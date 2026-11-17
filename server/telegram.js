'use strict';
// Telegram integration: bots, groups, message ingest (webhook or polling), filters,
// auto-reply, media download, idempotent sends, logs.
// Deleting a bot only unlinks its groups; groups, their settings and message history are kept.
const fs = require('fs');
const path = require('path');
const { db, DATA_DIR } = require('./db');
const u = require('./util');
const auth = require('./auth');
const features = require('./features');
const { EventEmitter } = require('events');
const templates = require('./templates');

// Live updates: every change to a user's Telegram data is published here; api.js streams it to the browser.
const bus = new EventEmitter();
bus.setMaxListeners(0);
function publish(userId, payload) {
  bus.emit('update', userId, payload);
}
function subscribe(userId, fn) {
  const handler = (uid, payload) => { if (uid === userId) fn(payload); };
  bus.on('update', handler);
  return () => bus.off('update', handler);
}

const API_BASE = 'https://api.telegram.org';
const TOKEN_RE = /^\d{5,}:[A-Za-z0-9_-]{20,}$/;
const FILTER_TYPES = ['mention', 'keyword', 'sender'];
const MEDIA_LIMIT = 20 * 1024 * 1024; // Bot API download limit
const AVATAR_MAX_CHARS = 200000;

class TelegramError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'TelegramError';
    this.code = code;
  }
}

// Never let the token leak into error text.
function scrub(text, token) {
  return String(text || '').split(token).join('[token]').slice(0, 300);
}

async function callApi(token, method, body = {}) {
  let res;
  try {
    res = await fetch(`${API_BASE}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    throw new TelegramError('ไม่สามารถเชื่อมต่อ Telegram ได้ กรุณาลองใหม่', 'NETWORK');
  }
  const json = await res.json().catch(() => ({ ok: false, description: 'invalid response' }));
  if (!json.ok) throw new TelegramError(scrub(json.description || 'Telegram error', token), json.error_code);
  return json.result;
}

// ---------------------------------------------------------------- helpers
function tlog(userId, event, { bot = null, group = null, status = 'success', detail = '' } = {}) {
  db.prepare('INSERT INTO telegram_logs (id, user_id, created_at, event, bot_name, group_title, status, detail) VALUES (?,?,?,?,?,?,?,?)')
    .run(u.uid(), userId, u.nowIso(), event, bot, group, status, String(detail).slice(0, 300));
}

function avatarOrThrow(value, field) {
  if (value == null || value === '') return null;
  const s = String(value);
  if (!/^data:image\/(png|jpeg|webp);base64,/.test(s)) throw new u.HttpError(400, `${field}ต้องเป็นไฟล์ JPG, PNG หรือ WebP`, 'VALIDATION');
  if (s.length > AVATAR_MAX_CHARS) throw new u.HttpError(400, `${field}มีขนาดใหญ่เกินไป`, 'VALIDATION');
  return s;
}

// ---------------------------------------------------------------- bots
function botDto(b, groupCount) {
  return {
    id: b.id, name: b.name, username: b.username, tokenHint: b.token_hint, mode: b.mode, status: b.status,
    lastError: b.last_error, createdAt: b.created_at, avatarData: b.avatar_data || null,
    groupCount: groupCount || 0,
  };
}

function getBot(user, id) {
  const b = db.prepare('SELECT * FROM telegram_bots WHERE id = ? AND user_id = ?').get(id, user.id);
  if (!b) throw new u.HttpError(404, 'ไม่พบบอท', 'NOT_FOUND');
  return b;
}

function botToken(bot) {
  return u.decrypt(bot.token_enc);
}

function listBots(user) {
  return db.prepare(`SELECT b.*, (SELECT COUNT(*) FROM telegram_groups g WHERE g.bot_id = b.id) AS group_count
    FROM telegram_bots b WHERE b.user_id = ? ORDER BY b.created_at`).all(user.id).map((b) => botDto(b, b.group_count));
}

async function createBot(user, body) {
  const name = u.str(body.name, { max: 60, required: true, field: 'ชื่อบอท' });
  const token = u.str(body.token, { max: 200, required: true, field: 'Bot Token' });
  if (!TOKEN_RE.test(token)) throw new u.HttpError(400, 'รูปแบบ Bot Token ไม่ถูกต้อง', 'VALIDATION');
  const mode = u.oneOf(body.mode || 'polling', ['polling', 'webhook'], 'โหมดการรับข้อความ');
  let me;
  try { me = await callApi(token, 'getMe'); } catch (err) {
    throw new u.HttpError(400, 'ทดสอบการเชื่อมต่อไม่สำเร็จ: ' + err.message, 'TELEGRAM');
  }
  const id = u.uid();
  const now = u.nowIso();
  const avatar = avatarOrThrow(body.avatarData, 'รูปบอท');
  db.prepare(`INSERT INTO telegram_bots (id, user_id, name, username, token_enc, token_hint, avatar_data, mode, webhook_secret, status, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, user.id, name, me.username || null, u.encrypt(token), '••••' + token.slice(-4), avatar, mode,
      u.randomToken(24), 'connected', now, now);
  u.activity(user.id, 'create', 'telegram_bot', id, name);
  tlog(user.id, 'เพิ่มบอท', { bot: name, detail: `โหมด ${mode === 'webhook' ? 'Webhook' : 'Polling'}` });
  if (mode === 'webhook') await registerWebhook(user, id).catch(() => null);
  return botDto(getBot(user, id), 0);
}

async function updateBot(user, id, body) {
  const bot = getBot(user, id);
  let token = botToken(bot);
  let tokenEnc = bot.token_enc;
  let tokenHint = bot.token_hint;
  let username = bot.username;
  if (body.token) {
    token = u.str(body.token, { max: 200, field: 'Bot Token' });
    if (!TOKEN_RE.test(token)) throw new u.HttpError(400, 'รูปแบบ Bot Token ไม่ถูกต้อง', 'VALIDATION');
    try { username = (await callApi(token, 'getMe')).username || null; } catch (err) {
      throw new u.HttpError(400, 'Bot Token ใหม่ใช้งานไม่ได้: ' + err.message, 'TELEGRAM');
    }
    tokenEnc = u.encrypt(token);
    tokenHint = '••••' + token.slice(-4);
  }
  const name = body.name != null ? u.str(body.name, { max: 60, required: true, field: 'ชื่อบอท' }) : bot.name;
  const mode = body.mode != null ? u.oneOf(body.mode, ['polling', 'webhook'], 'โหมดการรับข้อความ') : bot.mode;
  const avatar = 'avatarData' in body ? avatarOrThrow(body.avatarData, 'รูปบอท') : bot.avatar_data;
  db.prepare(`UPDATE telegram_bots SET name=?, username=?, token_enc=?, token_hint=?, mode=?, avatar_data=?, status=?, last_error=NULL, updated_at=?
    WHERE id=? AND user_id=?`)
    .run(name, username, tokenEnc, tokenHint, mode, avatar, 'connected', u.nowIso(), id, user.id);
  if (mode === 'webhook') await registerWebhook(user, id).catch(() => null);
  u.activity(user.id, 'update', 'telegram_bot', id, name);
  if ('avatarData' in body && avatar !== bot.avatar_data) tlog(user.id, 'เปลี่ยนรูปบอท', { bot: name });
  else tlog(user.id, 'แก้ไขบอท', { bot: name });
  const count = db.prepare('SELECT COUNT(*) AS c FROM telegram_groups WHERE bot_id = ?').get(id).c;
  return botDto(getBot(user, id), count);
}

// Deleting a bot unlinks its groups (bot_id -> NULL) and keeps every group, setting and message.
async function deleteBot(user, id) {
  const bot = getBot(user, id);
  const count = db.prepare('SELECT COUNT(*) AS c FROM telegram_groups WHERE bot_id = ? AND user_id = ?').get(id, user.id).c;
  if (bot.mode === 'webhook') {
    try { await callApi(botToken(bot), 'deleteWebhook', {}); } catch (_) { /* token may already be invalid */ }
  }
  db.exec('BEGIN');
  try {
    db.prepare(`UPDATE telegram_groups SET previous_bot_id = bot_id, bot_id = NULL, status = 'unlinked', last_error = NULL, updated_at = ?
      WHERE bot_id = ? AND user_id = ?`).run(u.nowIso(), id, user.id);
    db.prepare('DELETE FROM telegram_bots WHERE id = ? AND user_id = ?').run(id, user.id);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  u.activity(user.id, 'delete', 'telegram_bot', id, bot.name);
  tlog(user.id, 'ลบบอท', { bot: bot.name, detail: `ยกเลิกการเชื่อมต่อ ${count} กลุ่ม (กลุ่มและประวัติยังอยู่)` });
  return { ok: true, unlinkedGroups: count };
}

async function testBot(user, id) {
  const bot = getBot(user, id);
  try {
    const me = await callApi(botToken(bot), 'getMe');
    db.prepare('UPDATE telegram_bots SET status=?, username=?, last_error=NULL, updated_at=? WHERE id=?')
      .run('connected', me.username || null, u.nowIso(), id);
    tlog(user.id, 'ทดสอบการเชื่อมต่อ', { bot: bot.name, detail: 'เชื่อมต่อสำเร็จ' });
    return { ok: true, username: me.username, name: me.first_name };
  } catch (err) {
    db.prepare('UPDATE telegram_bots SET status=?, last_error=?, updated_at=? WHERE id=?').run('error', err.message, u.nowIso(), id);
    tlog(user.id, 'ทดสอบการเชื่อมต่อ', { bot: bot.name, status: 'failed', detail: err.message });
    return { ok: false, message: err.message };
  }
}

function publicBaseUrl() {
  return (process.env.PUBLIC_URL || '').replace(/\/$/, '');
}

async function registerWebhook(user, id) {
  const bot = getBot(user, id);
  const base = publicBaseUrl();
  if (!base.startsWith('https://')) throw new u.HttpError(400, 'Webhook ต้องใช้ PUBLIC_URL แบบ https', 'CONFIG');
  await callApi(botToken(bot), 'setWebhook', {
    url: `${base}/api/telegram/webhook/${id}`,
    secret_token: bot.webhook_secret,
    allowed_updates: ['message', 'edited_message'],
  });
  return { ok: true };
}

async function setWebhookForUser(user, id) {
  await registerWebhook(user, id);
  db.prepare("UPDATE telegram_bots SET mode='webhook', updated_at=? WHERE id=? AND user_id=?").run(u.nowIso(), id, user.id);
  tlog(user.id, 'แก้ไขบอท', { bot: getBot(user, id).name, detail: 'เปลี่ยนเป็นโหมด Webhook' });
  return { ok: true };
}

// ---------------------------------------------------------------- groups
const GROUP_TAG_COLORS = ['#AFC8FF', '#B5E6FF', '#B8F2D5', '#FFFFFF', '#FFD8B5', '#FFF4A8'];

function groupDto(g) {
  return {
    id: g.id, botId: g.bot_id || null, botName: g.bot_name || null, previousBotId: g.previous_bot_id || null,
    tags: g.tags || [],
    title: g.title, chatId: g.chat_id, enabled: !!g.enabled, autoReply: !!g.auto_reply,
    avatarData: g.avatar_data || null, status: g.bot_id ? g.status : 'unlinked', locked: !!g.lock_hash,
    lastError: g.last_error, lastTestedAt: g.last_tested_at, createdAt: g.created_at, updatedAt: g.updated_at,
  };
}

function tagsByGroup(userId) {
  const map = new Map();
  for (const t of db.prepare('SELECT id, group_id, name, color FROM telegram_group_tags WHERE user_id = ? ORDER BY created_at').all(userId)) {
    if (!map.has(t.group_id)) map.set(t.group_id, []);
    map.get(t.group_id).push({ id: t.id, name: t.name, color: t.color });
  }
  return map;
}

function listGroups(user) {
  const tags = tagsByGroup(user.id);
  return db.prepare(`SELECT g.*, b.name AS bot_name FROM telegram_groups g
    LEFT JOIN telegram_bots b ON b.id = g.bot_id WHERE g.user_id = ? ORDER BY g.title`).all(user.id)
    .map((g) => groupDto({ ...g, tags: tags.get(g.id) || [] }));
}

// Replaces all tags of one group in a single transaction. Tags are for the app only (never sent to Telegram).
function setGroupTags(user, groupId, list) {
  const g = getGroup(user, groupId);
  if (!Array.isArray(list)) throw new u.HttpError(400, 'รูปแบบแท็กไม่ถูกต้อง', 'VALIDATION');
  if (list.length > 20) throw new u.HttpError(400, 'แท็กในกลุ่มเดียวกันมากที่สุด 20 แท็ก', 'VALIDATION');
  const clean = [];
  const seen = new Set();
  for (const t of list) {
    const name = u.str(t && t.name, { max: 30, required: true, field: 'ชื่อแท็ก' });
    if (!GROUP_TAG_COLORS.includes(t.color)) throw new u.HttpError(400, 'สีแท็กไม่ถูกต้อง', 'VALIDATION');
    const key = name.toLowerCase();
    if (seen.has(key)) throw new u.HttpError(409, `มีแท็ก “${name}” อยู่แล้วในกลุ่มนี้`, 'DUPLICATE');
    seen.add(key);
    clean.push({ name, color: t.color });
  }
  const now = u.nowIso();
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM telegram_group_tags WHERE group_id = ? AND user_id = ?').run(g.id, user.id);
    const insert = db.prepare('INSERT INTO telegram_group_tags (id, user_id, group_id, name, color, created_at, updated_at) VALUES (?,?,?,?,?,?,?)');
    for (const t of clean) insert.run(u.uid(), user.id, g.id, t.name, t.color, now, now);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  u.activity(user.id, 'update', 'telegram_group', g.id, `แท็ก ${clean.length} รายการ`);
  return { ok: true, tags: clean };
}

// ---------------------------------------------------------------- room lock (6-digit PIN per group)
// A locked room needs its PIN once per 2 hours. Five wrong tries wait 5 minutes. Stored only in memory.
const UNLOCK_TTL_MS = 2 * 60 * 60 * 1000;
const TRIES_MAX = 5;
const TRIES_WAIT_MS = 5 * 60 * 1000;
const unlockedUntil = new Map(); // `${userId}:${groupId}` -> time the room stays open
const failedTries = new Map();   // same key -> { count, waitUntil }
const lockKey = (userId, groupId) => `${userId}:${groupId}`;

function isUnlocked(userId, groupId) {
  const t = unlockedUntil.get(lockKey(userId, groupId));
  return !!t && t > Date.now();
}
function lockedGroupIds(userId) {
  return new Set(db.prepare('SELECT id FROM telegram_groups WHERE user_id = ? AND lock_hash IS NOT NULL').all(userId)
    .map((r) => r.id).filter((id) => !isUnlocked(userId, id)));
}
function checkTries(key) {
  const t = failedTries.get(key);
  if (t && t.waitUntil > Date.now()) throw new u.HttpError(429, 'ใส่รหัสผิดหลายครั้ง กรุณารอ 5 นาทีแล้วลองใหม่', 'RATE_LIMIT');
}
function failTry(key, message, code) {
  const t = failedTries.get(key) || { count: 0, waitUntil: 0 };
  t.count += 1;
  if (t.count >= TRIES_MAX) {
    failedTries.set(key, { count: 0, waitUntil: Date.now() + TRIES_WAIT_MS });
    throw new u.HttpError(429, 'ใส่รหัสผิดหลายครั้ง กรุณารอ 5 นาทีแล้วลองใหม่', 'RATE_LIMIT');
  }
  failedTries.set(key, t);
  throw new u.HttpError(403, `${message} (เหลือ ${TRIES_MAX - t.count} ครั้ง)`, code);
}
function grantUnlock(userId, groupId) {
  unlockedUntil.set(lockKey(userId, groupId), Date.now() + UNLOCK_TTL_MS);
  failedTries.delete(lockKey(userId, groupId));
}
// A locked room refuses reading and sending until it is unlocked. Returns the group for chaining.
function assertUnlocked(user, g) {
  if (g.lock_hash && !isUnlocked(user.id, g.id)) throw new u.HttpError(423, 'ห้องแชทนี้ถูกล็อก กรุณาใส่รหัสก่อน', 'LOCKED');
  return g;
}
function hashPin(pin) {
  const value = String(pin == null ? '' : pin).trim();
  if (!/^\d{6}$/.test(value)) throw new u.HttpError(400, 'รหัสล็อกต้องเป็นตัวเลข 6 หลัก', 'VALIDATION');
  return auth.hashPassword(value);
}
function unlockGroup(user, id, pin) {
  const g = getGroup(user, id);
  if (!g.lock_hash) return { ok: true };
  const key = lockKey(user.id, g.id);
  checkTries(key);
  if (!auth.verifyPassword(String(pin || ''), g.lock_hash)) failTry(key, 'รหัสไม่ถูกต้อง', 'BAD_PIN');
  grantUnlock(user.id, g.id);
  return { ok: true };
}
// "ลืมรหัส?": the account password opens the room for this session. The room PIN itself is not changed.
function unlockWithPassword(user, id, password) {
  const g = getGroup(user, id);
  const key = lockKey(user.id, g.id);
  checkTries(key);
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id);
  if (!auth.verifyPassword(String(password || ''), row && row.password_hash)) failTry(key, 'รหัสผ่านบัญชีไม่ถูกต้อง', 'BAD_PASSWORD');
  grantUnlock(user.id, g.id);
  u.activity(user.id, 'unlock', 'telegram_group', g.id, '');
  return { ok: true };
}

function getGroup(user, id) {
  const g = db.prepare('SELECT * FROM telegram_groups WHERE id = ? AND user_id = ?').get(id, user.id);
  if (!g) throw new u.HttpError(404, 'ไม่พบกลุ่ม', 'NOT_FOUND');
  return g;
}

function createGroup(user, body) {
  const title = u.str(body.title, { max: 120, required: true, field: 'ชื่อกลุ่ม' });
  const chatId = u.str(body.chatId, { max: 30, required: true, field: 'Chat ID' });
  if (!/^-?\d{1,20}$/.test(chatId)) throw new u.HttpError(400, 'Chat ID ต้องเป็นตัวเลข (เช่น -1001234567890)', 'VALIDATION');
  const bot = getBot(user, u.str(body.botId, { max: 64, required: true, field: 'บอท' }));
  const dup = db.prepare('SELECT 1 FROM telegram_groups WHERE bot_id = ? AND chat_id = ?').get(bot.id, chatId);
  if (dup) throw new u.HttpError(409, 'กลุ่มนี้ถูกเพิ่มกับบอทนี้แล้ว', 'DUPLICATE');
  const id = u.uid();
  const now = u.nowIso();
  const avatar = avatarOrThrow(body.avatarData, 'รูปกลุ่ม');
  db.prepare(`INSERT INTO telegram_groups (id, user_id, bot_id, title, chat_id, enabled, auto_reply, avatar_data, status, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(id, user.id, bot.id, title, chatId, u.bool(body.enabled ?? true) ? 1 : 0,
    u.bool(body.autoReply) ? 1 : 0, avatar, 'unknown', now, now);
  u.activity(user.id, 'create', 'telegram_group', id, title);
  tlog(user.id, 'เพิ่มกลุ่ม', { bot: bot.name, group: title });
  return groupDto(db.prepare('SELECT g.*, b.name AS bot_name FROM telegram_groups g LEFT JOIN telegram_bots b ON b.id = g.bot_id WHERE g.id = ?').get(id));
}

// Changing the bot keeps chat_id, filters, avatar, settings and history. The new bot must be tested before "ready".
function updateGroup(user, id, body) {
  const g = getGroup(user, id);
  const title = body.title != null ? u.str(body.title, { max: 120, required: true, field: 'ชื่อกลุ่ม' }) : g.title;
  const enabled = body.enabled != null ? (u.bool(body.enabled) ? 1 : 0) : g.enabled;
  const autoReply = body.autoReply != null ? (u.bool(body.autoReply) ? 1 : 0) : g.auto_reply;
  const avatar = 'avatarData' in body ? avatarOrThrow(body.avatarData, 'รูปกลุ่ม') : g.avatar_data;
  // lockOff removes the PIN; a 6-digit lockPin sets or changes it; otherwise the current PIN stays.
  let lockHash = g.lock_hash;
  if (body.lockOff === true) lockHash = null;
  else if (body.lockPin != null && String(body.lockPin).trim() !== '') lockHash = hashPin(body.lockPin);
  if (lockHash !== g.lock_hash) unlockedUntil.delete(lockKey(user.id, g.id));
  let botId = g.bot_id;
  let status = g.status;
  let lastError = g.last_error;
  let previous = g.previous_bot_id;
  let botChangedFrom = null;
  let botChangedTo = null;
  if ('botId' in body) {
    const nextId = body.botId ? String(body.botId) : null;
    if (nextId !== g.bot_id) {
      if (nextId) {
        const bot = getBot(user, nextId);
        const dup = db.prepare('SELECT 1 FROM telegram_groups WHERE bot_id = ? AND chat_id = ? AND id != ?').get(nextId, g.chat_id, g.id);
        if (dup) throw new u.HttpError(409, 'บอทนี้เชื่อมต่อกับกลุ่มนี้อยู่แล้ว', 'DUPLICATE');
        botId = nextId;
        status = 'unknown';
        botChangedTo = bot.name;
      } else {
        botId = null;
        status = 'unlinked';
      }
      lastError = null;
      previous = g.bot_id || previous;
      if (g.bot_id) botChangedFrom = db.prepare('SELECT name FROM telegram_bots WHERE id = ?').get(g.bot_id)?.name || 'บอทเดิม';
    }
  }
  db.prepare(`UPDATE telegram_groups SET title=?, enabled=?, auto_reply=?, avatar_data=?, bot_id=?, previous_bot_id=?, status=?, last_error=?, lock_hash=?, updated_at=?
    WHERE id=? AND user_id=?`).run(title, enabled, autoReply, avatar, botId, previous, status, lastError, lockHash, u.nowIso(), id, user.id);
  const updated = db.prepare('SELECT g.*, b.name AS bot_name FROM telegram_groups g LEFT JOIN telegram_bots b ON b.id = g.bot_id WHERE g.id = ?').get(id);
  if (botChangedTo !== null || botChangedFrom !== null || (botId === null && g.bot_id)) {
    tlog(user.id, 'เปลี่ยนบอท', { group: title, bot: botChangedTo, detail: `${botChangedFrom || 'ไม่มีบอท'} → ${botChangedTo || 'ไม่มีบอท'}` });
  }
  if ('avatarData' in body && avatar !== g.avatar_data) tlog(user.id, 'เปลี่ยนรูปกลุ่ม', { group: title });
  if (title !== g.title || enabled !== g.enabled || autoReply !== g.auto_reply) tlog(user.id, 'แก้ไขกลุ่ม', { group: title, detail: `ติดตาม ${enabled ? 'เปิด' : 'ปิด'} · ตอบรับอัตโนมัติ ${autoReply ? 'เปิด' : 'ปิด'}` });
  return groupDto(updated);
}

function deleteGroup(user, id) {
  const g = getGroup(user, id);
  db.prepare('DELETE FROM telegram_groups WHERE id = ? AND user_id = ?').run(id, user.id);
  u.activity(user.id, 'delete', 'telegram_group', id, g.title);
  tlog(user.id, 'ลบกลุ่ม', { group: g.title });
  return { ok: true };
}

// Checks that the bot can see the chat and whether it can post in it.
async function testGroup(user, id) {
  const g = getGroup(user, id);
  if (!g.bot_id) {
    saveGroupTest(id, false, 'ยังไม่ได้เชื่อมต่อบอท', null);
    tlog(user.id, 'ทดสอบสิทธิ์', { group: g.title, status: 'failed', detail: 'ยังไม่ได้เชื่อมต่อบอท' });
    return { ok: false, message: 'ยังไม่ได้เชื่อมต่อบอท กรุณาเลือกบอทก่อน' };
  }
  const bot = getBot(user, g.bot_id);
  const token = botToken(bot);
  const me = await callApi(token, 'getMe').catch((err) => ({ id: null, error: err.message }));
  if (!me.id) return finishGroupTest(user, g, id, false, 'ไม่สามารถอ่านข้อมูลบอทได้', null);
  let chat;
  let member;
  try {
    chat = await callApi(token, 'getChat', { chat_id: g.chat_id });
    member = await callApi(token, 'getChatMember', { chat_id: g.chat_id, user_id: me.id });
  } catch (err) {
    return finishGroupTest(user, g, id, false, err.message, null);
  }
  const status = member.status;
  const isAdmin = status === 'administrator' || status === 'creator';
  const canPost = isAdmin ? member.can_post_messages !== false : status === 'member' || (status === 'restricted' && member.can_send_messages !== false);
  const message = canPost
    ? 'บอทอ่านและส่งข้อความได้' + (isAdmin ? '' : ' (แนะนำให้ตั้งบอทเป็นแอดมินเพื่อรับข้อความทั้งหมด)')
    : 'บอทไม่มีสิทธิ์ส่งข้อความในกลุ่มนี้';
  if (chat.title) db.prepare('UPDATE telegram_groups SET title=? WHERE id=?').run(chat.title, id);
  return finishGroupTest(user, g, id, canPost, message, { title: chat.title, botStatus: status, isAdmin });
}

function finishGroupTest(user, g, id, ok, message, info) {
  const res = saveGroupTest(id, ok, message, info);
  tlog(user.id, 'ทดสอบสิทธิ์', { group: g.title, bot: getBot(user, g.bot_id).name, status: ok ? 'success' : 'failed', detail: message });
  return res;
}

function saveGroupTest(id, ok, message, info) {
  db.prepare('UPDATE telegram_groups SET status=?, last_error=?, last_tested_at=?, updated_at=? WHERE id=?')
    .run(ok ? 'ready' : 'error', ok ? null : message, u.nowIso(), u.nowIso(), id);
  return { ok, message, ...(info || {}) };
}

// ---------------------------------------------------------------- ingest
// Attachments keep what is needed to fetch the file later. file_id never reaches the browser.
function attachmentsOf(msg) {
  const list = [];
  const push = (type, name, f, mime) => {
    if (!f || !f.file_id) return;
    if (f.file_unique_id && list.some((x) => x.uniqueId === f.file_unique_id)) return;
    list.push({ type, name, fileId: f.file_id, uniqueId: f.file_unique_id || null, mime, size: f.file_size || 0 });
  };
  if (msg.photo && msg.photo.length) push('photo', 'รูปภาพ', msg.photo[msg.photo.length - 1], 'image/jpeg');
  if (msg.sticker) {
    const st = msg.sticker;
    const mime = st.is_animated ? 'application/x-tgsticker' : st.is_video ? 'video/webm' : 'image/webp';
    push('sticker', st.emoji ? `สติกเกอร์ ${st.emoji}` : 'สติกเกอร์', st, mime);
  }
  push('animation', (msg.animation && msg.animation.file_name) || 'GIF', msg.animation, 'video/mp4');
  push('video', (msg.video && msg.video.file_name) || 'วิดีโอ', msg.video, 'video/mp4');
  push('voice', 'ข้อความเสียง', msg.voice, 'audio/ogg');
  push('audio', (msg.audio && msg.audio.file_name) || 'เสียง', msg.audio, 'audio/mpeg');
  push('document', (msg.document && msg.document.file_name) || 'ไฟล์', msg.document,
    (msg.document && msg.document.mime_type) || 'application/octet-stream');
  return list;
}

function mentionsIn(msg) {
  const names = new Set();
  const ids = new Set();
  const text = msg.text || msg.caption || '';
  for (const e of msg.entities || msg.caption_entities || []) {
    if (e.type === 'mention') names.add(text.substr(e.offset, e.length).replace(/^@/, '').toLowerCase());
    if (e.type === 'text_mention' && e.user) ids.add(String(e.user.id));
  }
  return { names, ids };
}

function matchFilters(user, msg, replyToSenderId, mentions, settings, attachments) {
  const filters = db.prepare('SELECT type, value FROM telegram_filters WHERE user_id = ? AND enabled = 1').all(user.id);
  const text = (msg.text || msg.caption || '').toLowerCase();
  const reasons = new Set();
  const senderId = msg.from ? String(msg.from.id) : null;
  const myId = user.telegram_user_id;
  for (const f of filters) {
    if (f.type === 'mention' && (mentions.names.has(f.value.toLowerCase()) || (f.value.startsWith('id:') && mentions.ids.has(f.value.slice(3))))) reasons.add('mention');
    if (f.type === 'keyword' && text.includes(f.value.toLowerCase())) reasons.add('keyword');
    if (f.type === 'sender' && senderId && senderId === f.value) reasons.add('sender');
  }
  if (settings.filterReplyToMe && myId && replyToSenderId === myId) reasons.add('reply_to_me');
  if (myId && mentions.ids.has(myId)) reasons.add('mention');
  if (settings.filterAttachments && attachments.length) reasons.add('attachment');
  return [...reasons];
}

// Forum topics: remember the name Telegram gives each topic (service messages and first sight).
function upsertTopic(userId, groupId, threadId, name, overwrite) {
  if (!threadId) return;
  const now = u.nowIso();
  if (overwrite && name) {
    db.prepare(`INSERT INTO telegram_topics (id, user_id, group_id, thread_id, name, updated_at) VALUES (?,?,?,?,?,?)
      ON CONFLICT(group_id, thread_id) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at`)
      .run(u.uid(), userId, groupId, threadId, String(name).slice(0, 120), now);
  } else {
    db.prepare(`INSERT OR IGNORE INTO telegram_topics (id, user_id, group_id, thread_id, name, updated_at) VALUES (?,?,?,?,?,?)`)
      .run(u.uid(), userId, groupId, threadId, String(name || `หัวข้อ #${threadId}`).slice(0, 120), now);
  }
  db.prepare('UPDATE telegram_groups SET is_forum = 1 WHERE id = ?').run(groupId);
}

// The user can give a topic a name when Telegram never sent one (topics created before the bot joined).
function renameTopic(user, groupId, threadId, name) {
  getGroup(user, groupId);
  const clean = u.str(name, { max: 120, required: true, field: 'ชื่อหัวข้อ' });
  upsertTopic(user.id, groupId, u.int(threadId, { min: 2, field: 'หัวข้อ' }), clean, true);
  return { ok: true, name: clean };
}

// Pastel colours for topic pills. The colour is a display setting inside SIINA SYSTEM only (never sent to Telegram).
const TOPIC_COLORS = ['#B8CEFF', '#B5E6FF', '#C5EBD3', '#DEC8FF', '#FFD5B5', '#FFF0AD', '#FFC5DE', '#FFFFFF'];

function groupTopics(user, groupId) {
  assertUnlocked(user, getGroup(user, groupId));
  return db.prepare('SELECT thread_id, name, color FROM telegram_topics WHERE group_id = ? AND user_id = ? ORDER BY thread_id')
    .all(groupId, user.id).map((t) => ({ threadId: t.thread_id, name: t.name, color: t.color || null }));
}

// Sets the display colour of one topic. Rows are keyed by group + Telegram topic id, so renaming never changes the id.
function setTopicColor(user, groupId, threadId, color) {
  getGroup(user, groupId);
  const tid = u.int(threadId, { min: 2, field: 'หัวข้อ' });
  if (!TOPIC_COLORS.includes(color)) throw new u.HttpError(400, 'สีหัวข้อไม่ถูกต้อง', 'VALIDATION');
  upsertTopic(user.id, groupId, tid, null, false); // make sure the row exists; an existing name is kept
  db.prepare('UPDATE telegram_topics SET color = ?, updated_at = ? WHERE group_id = ? AND user_id = ? AND thread_id = ?')
    .run(color, u.nowIso(), groupId, user.id, tid);
  return { ok: true, threadId: tid, color };
}

// Creates a real forum topic in the Telegram group. The bot must be an admin with the "manage topics" right.
async function createTopic(user, groupId, name, color) {
  const g = getGroup(user, groupId);
  const clean = u.str(name, { max: 120, required: true, field: 'ชื่อหัวข้อ' });
  if (color != null && !TOPIC_COLORS.includes(color)) throw new u.HttpError(400, 'สีหัวข้อไม่ถูกต้อง', 'VALIDATION');
  if (!g.bot_id) throw new u.HttpError(400, 'ยังไม่ได้เชื่อมต่อบอท กรุณาเลือกบอทก่อน', 'VALIDATION');
  const bot = getBot(user, g.bot_id);
  let created;
  try {
    created = await callApi(botToken(bot), 'createForumTopic', { chat_id: g.chat_id, name: clean });
  } catch (err) {
    throw new u.HttpError(400, 'สร้างหัวข้อใน Telegram ไม่สำเร็จ บอทต้องเป็นแอดมินที่มีสิทธิ์จัดการหัวข้อ: ' + err.message, 'TELEGRAM');
  }
  const tid = created.message_thread_id;
  upsertTopic(user.id, groupId, tid, clean, true);
  if (color) setTopicColor(user, groupId, tid, color);
  u.activity(user.id, 'create', 'telegram_topic', String(tid), clean);
  return { ok: true, threadId: tid, name: clean, color: color || null };
}

// Store one incoming message for every enabled group that matches this bot and chat.
function ingestMessage(bot, msg) {
  const chatId = String(msg.chat.id);
  const groups = db.prepare('SELECT * FROM telegram_groups WHERE bot_id = ? AND chat_id = ? AND enabled = 1').all(bot.id, chatId);
  for (const g of groups) {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(g.user_id);
    const exists = db.prepare('SELECT id FROM telegram_messages WHERE group_id = ? AND message_id = ?').get(g.id, msg.message_id);
    if (exists) continue; // duplicate delivery (webhook retry / polling overlap)
    const threadId = msg.message_thread_id || null;
    // A thread id alone does not make a topic: only a real forum group (or a topic event) lists topics.
    const isForum = !!(g.is_forum || (msg.chat && msg.chat.is_forum) || msg.forum_topic_created || msg.forum_topic_edited);
    if (msg.forum_topic_created) upsertTopic(user.id, g.id, threadId, msg.forum_topic_created.name, true);
    if (msg.forum_topic_edited && msg.forum_topic_edited.name) upsertTopic(user.id, g.id, threadId, msg.forum_topic_edited.name, true);
    else if (threadId && isForum) upsertTopic(user.id, g.id, threadId, null, false);
    const isTopicService = !!(msg.forum_topic_created || msg.forum_topic_edited || msg.forum_topic_closed || msg.forum_topic_reopened);
    if (isTopicService && !(msg.text || msg.caption)) continue; // topic created/renamed notices are not conversation
    const settings = features.getSettings(user.id);
    const reply = msg.reply_to_message || null;
    const replyToSenderId = reply && reply.from ? String(reply.from.id) : null;
    const mentions = mentionsIn(msg);
    const attachments = attachmentsOf(msg);
    const matched = matchFilters(user, msg, replyToSenderId, mentions, settings, attachments);
    const isOutgoing = msg.from && bot.username && msg.from.username === bot.username ? 1 : 0;
    const id = u.uid();
    const senderName = msg.from
      ? [msg.from.first_name, msg.from.last_name].filter(Boolean).join(' ') || msg.from.username || 'ไม่ทราบชื่อ'
      : (msg.sender_chat ? msg.sender_chat.title : 'ไม่ทราบชื่อ');
    db.prepare(`INSERT INTO telegram_messages (id, user_id, group_id, message_id, sender_id, sender_name, sender_username, text,
      attachments, reply_to_message_id, reply_to_sender_id, reply_to_text, matched, is_outgoing, sent_at, received_at, thread_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, user.id, g.id, msg.message_id,
      msg.from ? String(msg.from.id) : null, senderName,
      msg.from && msg.from.username ? msg.from.username : null,
      String(msg.text || msg.caption || '').slice(0, 4000),
      JSON.stringify(attachments),
      reply ? reply.message_id : null, replyToSenderId,
      reply ? String(reply.text || reply.caption || '').slice(0, 300) : null,
      JSON.stringify(matched), isOutgoing,
      new Date(msg.date * 1000).toISOString(), u.nowIso(), threadId);
    publish(user.id, { groupId: g.id, messageId: msg.message_id, kind: 'message' });
    if (!matched.length) continue;
    db.prepare(`INSERT OR IGNORE INTO notifications (id, user_id, source_type, source_id, title, body, remind_at, created_at)
      VALUES (?,?,?,?,?,?,?,?)`).run(u.uid(), user.id, 'telegram', id,
      `ข้อความสำคัญจาก ${g.title}`, String(msg.text || msg.caption || '(ไฟล์แนบ)').slice(0, 140),
      u.nowIso(), u.nowIso());
    if (matched.includes('mention')) {
      tlog(user.id, 'ตรวจพบข้อความแท็ก', { bot: bot.name, group: g.title, detail: `${senderName}: ${String(msg.text || msg.caption || '(ไฟล์แนบ)').slice(0, 80)}` });
      const canAutoReply = g.auto_reply && settings.autoReply.enabled && msg.from && !msg.from.is_bot && !isOutgoing;
      if (canAutoReply) scheduleAutoReply(user.id, g.id, msg.message_id, settings.autoReply.text);
    }
  }
}

function processUpdate(bot, update) {
  const msg = update.message || update.edited_message;
  if (msg && msg.chat) ingestMessage(bot, msg);
}

// Polling: fetch new updates for bots in polling mode (used when no public webhook URL is set).
async function pollBot(bot) {
  const token = botToken(bot);
  const updates = await callApi(token, 'getUpdates', {
    offset: bot.update_offset + 1,
    timeout: 0,
    allowed_updates: ['message', 'edited_message'],
  });
  let maxId = bot.update_offset;
  for (const up of updates) {
    processUpdate(bot, up);
    if (up.update_id > maxId) maxId = up.update_id;
  }
  if (maxId !== bot.update_offset) {
    db.prepare('UPDATE telegram_bots SET update_offset = ?, status = ?, last_error = NULL WHERE id = ?').run(maxId, 'connected', bot.id);
  }
  return updates.length;
}

async function pollAll() {
  const bots = db.prepare("SELECT * FROM telegram_bots WHERE mode = 'polling' AND status != 'disabled'").all();
  for (const bot of bots) {
    try {
      await pollBot(bot);
    } catch (err) {
      db.prepare('UPDATE telegram_bots SET status = ?, last_error = ? WHERE id = ?').run('error', err.message, bot.id);
    }
  }
}

// ---------------------------------------------------------------- auto reply
// Runs after the message is stored. The outbox key makes each tagged message reply at most once.
function scheduleAutoReply(userId, groupId, messageId, text) {
  setImmediate(() => {
    const key = `auto:${groupId}:${messageId}`;
    if (db.prepare('SELECT 1 FROM telegram_outbox WHERE user_id = ? AND client_key = ?').get(userId, key)) return;
    const id = u.uid();
    const now = u.nowIso();
    db.prepare(`INSERT INTO telegram_outbox (id, user_id, group_id, text, reply_to_message_id, client_key, status, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(id, userId, groupId, text, messageId, key, 'sending', now, now);
    deliver({ id: userId }, id, 'ตอบรับอัตโนมัติ').catch((err) => u.logError(err.message, 'telegram.autoReply'));
  });
}

// ---------------------------------------------------------------- chat list, messages, media
function chatList(user) {
  return db.prepare(`
    SELECT g.id, g.title, g.enabled, g.status, g.bot_id, g.avatar_data, (g.lock_hash IS NOT NULL) AS is_locked,
      (SELECT text FROM telegram_messages m WHERE m.group_id = g.id ORDER BY sent_at DESC LIMIT 1) AS last_text,
      (SELECT sent_at FROM telegram_messages m WHERE m.group_id = g.id ORDER BY sent_at DESC LIMIT 1) AS last_at,
      (SELECT COUNT(*) FROM telegram_messages m WHERE m.group_id = g.id AND m.read_at IS NULL AND m.is_outgoing = 0) AS unread,
      (SELECT COUNT(*) FROM telegram_messages m WHERE m.group_id = g.id AND m.read_at IS NULL AND m.is_outgoing = 0 AND m.matched != '[]') AS mentions
    FROM telegram_groups g WHERE g.user_id = ? ORDER BY last_at DESC NULLS LAST, g.title`).all(user.id).map((r) => ({
    id: r.id, title: r.title, enabled: !!r.enabled, status: r.bot_id ? r.status : 'unlinked',
    avatarData: r.avatar_data || null,
    locked: !!r.is_locked, unlocked: !r.is_locked || isUnlocked(user.id, r.id),
    lastText: r.is_locked && !isUnlocked(user.id, r.id) ? '' : (r.last_text ? r.last_text.slice(0, 120) : ''), lastAt: r.last_at,
    unread: r.unread, mentions: r.mentions,
  }));
}

function messageDto(m) {
  return {
    id: m.id, messageId: m.message_id, senderId: m.sender_id, senderName: m.sender_name,
    text: m.text,
    attachments: JSON.parse(m.attachments).map((a) => ({ type: a.type, name: a.name, mime: a.mime, hasFile: !!a.fileId })),
    replyToMessageId: m.reply_to_message_id, replyToText: m.reply_to_text, matched: JSON.parse(m.matched),
    isOutgoing: !!m.is_outgoing, sentAt: m.sent_at, readAt: m.read_at, threadId: m.thread_id ?? null,
    ackedAt: m.acked_at || null,
  };
}

// Adds the group bot's name and picture to each message, so bot messages show the bot the user set up.
function withSenderBot(groupId, userId) {
  const bot = db.prepare(`SELECT b.name, b.avatar_data FROM telegram_groups g
    LEFT JOIN telegram_bots b ON b.id = g.bot_id WHERE g.id = ? AND g.user_id = ?`).get(groupId, userId) || {};
  return (m) => ({ ...messageDto(m), botName: bot.name || null, botAvatar: bot.avatar_data || null });
}

// Latest messages, older pages (before=), or a window around one message (around=) for "jump to message".
function groupMessages(user, groupId, q) {
  assertUnlocked(user, getGroup(user, groupId));
  const limit = u.int(q.limit || 60, { min: 1, max: 200, field: 'จำนวนข้อความ' });
  if (q.around) {
    const target = u.int(q.around, { min: 1, field: 'ข้อความเป้าหมาย' });
    const half = Math.max(1, Math.floor(limit / 2));
    const before = db.prepare(`SELECT * FROM telegram_messages WHERE group_id = ? AND user_id = ? AND message_id <= ?
      ORDER BY message_id DESC LIMIT ?`).all(groupId, user.id, target, half + 1);
    const after = db.prepare(`SELECT * FROM telegram_messages WHERE group_id = ? AND user_id = ? AND message_id > ?
      ORDER BY message_id ASC LIMIT ?`).all(groupId, user.id, target, half);
    return [...before.reverse(), ...after].map(withSenderBot(groupId, user.id));
  }
  const before = q.before ? u.int(q.before, { min: 0, field: 'ตำแหน่งข้อความ' }) : null;
  const rows = db.prepare(`SELECT * FROM telegram_messages WHERE group_id = ? AND user_id = ?
    AND (? IS NULL OR message_id < ?) ORDER BY message_id DESC LIMIT ?`).all(groupId, user.id, before, before, limit);
  return rows.reverse().map(withSenderBot(groupId, user.id));
}

// 👌 on a tagged message: the user acknowledged it. This is separate from the bot's auto-reply.
// It closes the alert for that message and marks it as read in the summary.
function ackMessage(user, rowId, acked) {
  const m = db.prepare('SELECT id, matched FROM telegram_messages WHERE id = ? AND user_id = ?').get(rowId, user.id);
  if (!m) throw new u.HttpError(404, 'ไม่พบข้อความ', 'NOT_FOUND');
  const now = u.nowIso();
  db.prepare('UPDATE telegram_messages SET acked_at = ? WHERE id = ? AND user_id = ?').run(acked ? now : null, rowId, user.id);
  if (acked) {
    db.prepare("UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE user_id = ? AND source_type = 'telegram' AND source_id = ?")
      .run(now, user.id, rowId);
  }
  features.setSummaryState(user, { sourceType: 'telegram', sourceId: rowId, state: acked ? 'read' : 'open' });
  tlog(user.id, 'รับทราบข้อความแท็ก', { detail: acked ? 'กด 👌 รับทราบแล้ว' : 'ยกเลิกการรับทราบ' });
  return { ok: true, ackedAt: acked ? now : null };
}

// Messages where someone tagged the user's Username (newest first), for the "มีการแท็กฉัน" tab.
function mentionList(user) {
  return db.prepare(`SELECT m.id, m.message_id, m.group_id, m.sender_name, m.text, m.sent_at, m.read_at, m.acked_at, g.title AS group_title
    FROM telegram_messages m JOIN telegram_groups g ON g.id = m.group_id
    WHERE m.user_id = ? AND m.is_outgoing = 0 AND m.matched LIKE '%"mention"%'
      AND m.group_id NOT IN (SELECT value FROM json_each(?))
    ORDER BY m.sent_at DESC LIMIT 200`).all(user.id, JSON.stringify([...lockedGroupIds(user.id)])).map((r) => ({
    id: r.id, messageId: r.message_id, groupId: r.group_id, groupTitle: r.group_title,
    senderName: r.sender_name, text: r.text, sentAt: r.sent_at, read: !!r.read_at, ackedAt: r.acked_at || null,
  }));
}

function markGroupRead(user, groupId) {
  assertUnlocked(user, getGroup(user, groupId));
  db.prepare('UPDATE telegram_messages SET read_at = ? WHERE group_id = ? AND user_id = ? AND read_at IS NULL').run(u.nowIso(), groupId, user.id);
  return { ok: true };
}

// Downloads an attachment from Telegram once and keeps it in DATA_DIR/media.
async function mediaFile(user, rowId, index) {
  const row = db.prepare(`SELECT m.attachments, g.bot_id FROM telegram_messages m
    JOIN telegram_groups g ON g.id = m.group_id WHERE m.id = ? AND m.user_id = ?`).get(rowId, user.id);
  if (!row) throw new u.HttpError(404, 'ไม่พบไฟล์', 'NOT_FOUND');
  const att = JSON.parse(row.attachments)[index];
  if (!att || !att.fileId || !att.uniqueId || !/^[A-Za-z0-9_-]{1,100}$/.test(att.uniqueId)) {
    throw new u.HttpError(404, 'ไฟล์นี้แสดงไม่ได้ (เก็บก่อนเปิดระบบรับไฟล์)', 'NO_FILE');
  }
  if (att.size > MEDIA_LIMIT) throw new u.HttpError(413, 'ไฟล์ใหญ่เกิน 20 MB แสดงไม่ได้', 'TOO_LARGE');
  const dir = path.join(DATA_DIR, 'media');
  fs.mkdirSync(dir, { recursive: true });
  const cachePath = path.join(dir, att.uniqueId);
  if (!fs.existsSync(cachePath)) {
    if (!row.bot_id) throw new u.HttpError(400, 'กลุ่มนี้ยังไม่ได้เชื่อมต่อบอท', 'UNLINKED');
    const bot = db.prepare('SELECT * FROM telegram_bots WHERE id = ?').get(row.bot_id);
    const token = botToken(bot);
    const info = await callApi(token, 'getFile', { file_id: att.fileId });
    if (!info.file_path) throw new u.HttpError(404, 'ไม่พบไฟล์บน Telegram', 'NOT_FOUND');
    let res;
    try {
      res = await fetch(`${API_BASE}/file/bot${token}/${info.file_path}`, { signal: AbortSignal.timeout(30000) });
    } catch (err) {
      throw new TelegramError('ดาวน์โหลดไฟล์จาก Telegram ไม่สำเร็จ', 'NETWORK');
    }
    if (!res.ok) throw new TelegramError('ดาวน์โหลดไฟล์จาก Telegram ไม่สำเร็จ', 'FILE');
    fs.writeFileSync(cachePath, Buffer.from(await res.arrayBuffer()));
  }
  return { path: cachePath, mime: att.mime };
}

// ---------------------------------------------------------------- send (outbox, idempotent)
function outboxDto(o) {
  return { id: o.id, groupId: o.group_id, text: o.text, replyToMessageId: o.reply_to_message_id, status: o.status, error: o.error, createdAt: o.created_at };
}

// Sends one outbox row. eventName decides how the attempt is written to the logs.
async function deliver(user, outboxId, eventName = 'ส่งข้อความ') {
  const o = db.prepare('SELECT * FROM telegram_outbox WHERE id = ? AND user_id = ?').get(outboxId, user.id);
  let g;
  let bot;
  try {
    g = getGroup(user, o.group_id);
    if (!g.bot_id) throw new u.HttpError(400, 'กลุ่มนี้ยังไม่ได้เชื่อมต่อบอท', 'UNLINKED');
    bot = getBot(user, g.bot_id);
    const body = { chat_id: g.chat_id, text: o.html || o.text };
    if (o.html) body.parse_mode = 'HTML';
    if (o.thread_id) body.message_thread_id = o.thread_id;
    if (o.reply_to_message_id) body.reply_parameters = { message_id: o.reply_to_message_id, allow_sending_without_reply: true };
    const sent = await callApi(botToken(bot), 'sendMessage', body);
    db.prepare("UPDATE telegram_outbox SET status='sent', telegram_message_id=?, error=NULL, updated_at=? WHERE id=?")
      .run(sent.message_id, u.nowIso(), o.id);
    db.prepare(`INSERT OR IGNORE INTO telegram_messages (id, user_id, group_id, message_id, sender_name, text, reply_to_message_id,
      is_outgoing, sent_at, received_at, read_at, thread_id) VALUES (?,?,?,?,?,?,?,1,?,?,?,?)`).run(
      u.uid(), user.id, g.id, sent.message_id, bot.name, o.text, o.reply_to_message_id, u.nowIso(), u.nowIso(), u.nowIso(), o.thread_id);
    tlog(user.id, eventName, { bot: bot.name, group: g.title, detail: o.text.slice(0, 80) });
    publish(user.id, { groupId: g.id, kind: 'sent' });
  } catch (err) {
    const message = err.message || 'ส่งข้อความไม่สำเร็จ';
    db.prepare("UPDATE telegram_outbox SET status='failed', error=?, updated_at=? WHERE id=?").run(message, u.nowIso(), o.id);
    tlog(user.id, eventName, { bot: bot ? bot.name : null, group: g ? g.title : null, status: 'failed', detail: message });
  }
  return outboxDto(db.prepare('SELECT * FROM telegram_outbox WHERE id = ?').get(o.id));
}

async function sendMessage(user, groupId, body, clientKey) {
  const g = assertUnlocked(user, getGroup(user, groupId));
  if (!g.enabled) throw new u.HttpError(400, 'กลุ่มนี้ปิดการติดตามอยู่ เปิดก่อนจึงจะส่งได้', 'DISABLED');
  if (!g.bot_id) throw new u.HttpError(400, 'กลุ่มนี้ยังไม่ได้เชื่อมต่อบอท เลือกบอทก่อนส่งข้อความ', 'UNLINKED');
  const text = u.str(body.text, { max: 4000, required: true, field: 'ข้อความ' });
  const key = u.str(clientKey || body.clientKey, { max: 100, required: true, field: 'รหัสการส่ง' });
  const replyTo = body.replyToMessageId ? u.int(body.replyToMessageId, { min: 1, field: 'ข้อความที่ตอบกลับ' }) : null;
  const threadId = body.threadId ? u.int(body.threadId, { min: 1, field: 'หัวข้อ' }) : null;
  const existing = db.prepare('SELECT * FROM telegram_outbox WHERE user_id = ? AND client_key = ?').get(user.id, key);
  if (existing) return outboxDto(existing); // double-click / retry: return the same send
  // Formatting is used only when the text still matches the template exactly.
  let html = null;
  if (body.formatted && templates.plainFromHtml(String(body.formatted)) === text) {
    html = templates.telegramHtml(String(body.formatted));
    if (html.length > 4096) throw new u.HttpError(400, 'ข้อความยาวเกินที่ Telegram รองรับ', 'TOO_LONG');
  }
  const id = u.uid();
  const now = u.nowIso();
  db.prepare(`INSERT INTO telegram_outbox (id, user_id, group_id, text, reply_to_message_id, client_key, status, created_at, updated_at, thread_id, html)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(id, user.id, g.id, text, replyTo, key, 'sending', now, now, threadId, html);
  return deliver(user, id, 'ส่งข้อความ');
}

async function retryOutbox(user, id) {
  const o = db.prepare('SELECT * FROM telegram_outbox WHERE id = ? AND user_id = ?').get(id, user.id);
  if (!o) throw new u.HttpError(404, 'ไม่พบข้อความ', 'NOT_FOUND');
  if (o.status !== 'failed') throw new u.HttpError(400, 'ข้อความนี้ส่งสำเร็จแล้วหรือกำลังส่งอยู่', 'INVALID_STATE');
  db.prepare("UPDATE telegram_outbox SET status='sending', updated_at=? WHERE id=?").run(u.nowIso(), id);
  return deliver(user, id, 'ส่งข้อความ');
}

function outboxForGroup(user, groupId) {
  assertUnlocked(user, getGroup(user, groupId));
  return db.prepare("SELECT * FROM telegram_outbox WHERE user_id = ? AND group_id = ? AND status != 'sent' AND client_key NOT LIKE 'auto:%' ORDER BY created_at DESC LIMIT 20")
    .all(user.id, groupId).map(outboxDto);
}

// ---------------------------------------------------------------- files and stickers
const FILE_LIMIT_IMAGE = 10 * 1024 * 1024;
const FILE_LIMIT_DOC = 50 * 1024 * 1024;

function sentFile(user, g, bot, sent, kind, name, mime, size, caption, threadId) {
  const fileObj = sent.photo ? sent.photo[sent.photo.length - 1] : sent.sticker || sent.document;
  db.prepare(`INSERT OR IGNORE INTO telegram_messages (id, user_id, group_id, message_id, sender_name, text, attachments,
    is_outgoing, sent_at, received_at, read_at, thread_id) VALUES (?,?,?,?,?,?,?,1,?,?,?,?)`).run(
    u.uid(), user.id, g.id, sent.message_id, bot.name, caption || '',
    JSON.stringify([{ type: kind, name, mime, size, fileId: fileObj ? fileObj.file_id : null, uniqueId: fileObj ? fileObj.file_unique_id : null }]),
    u.nowIso(), u.nowIso(), u.nowIso(), threadId);
  publish(user.id, { groupId: g.id, kind: 'sent' });
}

async function sendFile(user, groupId, body) {
  const g = assertUnlocked(user, getGroup(user, groupId));
  if (!g.enabled) throw new u.HttpError(400, 'กลุ่มนี้ปิดการติดตามอยู่', 'DISABLED');
  if (!g.bot_id) throw new u.HttpError(400, 'กลุ่มนี้ยังไม่ได้เชื่อมต่อบอท', 'UNLINKED');
  const bot = getBot(user, g.bot_id);
  const name = u.str(body.fileName, { max: 200, required: true, field: 'ชื่อไฟล์' });
  const mime = u.str(body.mime, { max: 120, field: 'ประเภทไฟล์' }) || 'application/octet-stream';
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(body.dataUrl || ''));
  if (!match) throw new u.HttpError(400, 'ไฟล์ไม่ถูกต้อง', 'VALIDATION');
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length) throw new u.HttpError(400, 'ไฟล์ว่างเปล่า', 'VALIDATION');
  const isImage = mime === 'image/jpeg' || mime === 'image/png';
  const limit = isImage ? FILE_LIMIT_IMAGE : FILE_LIMIT_DOC;
  if (buffer.length > limit) throw new u.HttpError(413, `ไฟล์ใหญ่เกินกำหนด (สูงสุด ${limit / 1024 / 1024} MB)`, 'TOO_LARGE');
  const caption = body.caption ? u.str(body.caption, { max: 1024, field: 'คำบรรยาย' }) : '';
  const threadId = body.threadId ? u.int(body.threadId, { min: 1, field: 'หัวข้อ' }) : null;
  const replyTo = body.replyToMessageId ? u.int(body.replyToMessageId, { min: 1, field: 'ข้อความที่ตอบกลับ' }) : null;
  const token = botToken(bot);
  const form = new FormData();
  form.append('chat_id', g.chat_id);
  if (threadId) form.append('message_thread_id', String(threadId));
  if (caption) form.append('caption', caption);
  if (replyTo) form.append('reply_parameters', JSON.stringify({ message_id: replyTo, allow_sending_without_reply: true }));
  const field = isImage ? 'photo' : 'document';
  form.append(field, new Blob([buffer], { type: mime }), name);
  const kind = isImage ? 'photo' : 'document';
  try {
    const res = await fetch(`${API_BASE}/bot${token}/${isImage ? 'sendPhoto' : 'sendDocument'}`, { method: 'POST', body: form, signal: AbortSignal.timeout(120000) });
    const json = await res.json().catch(() => ({ ok: false, description: 'invalid response' }));
    if (!json.ok) throw new TelegramError(scrub(json.description || 'ส่งไฟล์ไม่สำเร็จ', token), json.error_code);
    sentFile(user, g, bot, json.result, kind, name, mime, buffer.length, caption, threadId);
    tlog(user.id, 'ส่งไฟล์', { bot: bot.name, group: g.title, detail: name });
    return { ok: true, messageId: json.result.message_id };
  } catch (err) {
    tlog(user.id, 'ส่งไฟล์', { bot: bot.name, group: g.title, status: 'failed', detail: `${name}: ${err.message}` });
    throw err instanceof TelegramError ? new u.HttpError(502, 'ส่งไฟล์ไม่สำเร็จ: ' + err.message + ' · กดส่งใหม่ได้', 'TELEGRAM') : err;
  }
}

async function sendSticker(user, groupId, body) {
  const g = assertUnlocked(user, getGroup(user, groupId));
  if (!g.enabled) throw new u.HttpError(400, 'กลุ่มนี้ปิดการติดตามอยู่', 'DISABLED');
  if (!g.bot_id) throw new u.HttpError(400, 'กลุ่มนี้ยังไม่ได้เชื่อมต่อบอท', 'UNLINKED');
  const sticker = templates.getSticker(user, u.str(body.stickerId, { max: 64, required: true, field: 'สติกเกอร์' }));
  const bot = getBot(user, g.bot_id);
  const threadId = body.threadId ? u.int(body.threadId, { min: 1, field: 'หัวข้อ' }) : null;
  const payload = { chat_id: g.chat_id, sticker: sticker.file_id };
  if (threadId) payload.message_thread_id = threadId;
  try {
    const sent = await callApi(botToken(bot), 'sendSticker', payload);
    sentFile(user, g, bot, sent, 'sticker', sticker.label || 'สติกเกอร์', 'image/webp', 0, '', threadId);
    tlog(user.id, 'ส่งสติกเกอร์', { bot: bot.name, group: g.title });
    return { ok: true, messageId: sent.message_id };
  } catch (err) {
    tlog(user.id, 'ส่งสติกเกอร์', { bot: bot.name, group: g.title, status: 'failed', detail: err.message });
    throw new u.HttpError(502, 'ส่งสติกเกอร์ไม่สำเร็จ: ' + err.message, 'TELEGRAM');
  }
}

// ---------------------------------------------------------------- filters
function filtersDto(f) { return { id: f.id, type: f.type, value: f.value, enabled: !!f.enabled }; }

function listFilters(user) {
  return db.prepare('SELECT * FROM telegram_filters WHERE user_id = ? ORDER BY type, value').all(user.id).map(filtersDto);
}

function createFilter(user, body) {
  const type = u.oneOf(body.type, [...FILTER_TYPES, 'reply_to_me'], 'ประเภทตัวกรอง');
  if (type === 'reply_to_me') throw new u.HttpError(400, 'การตอบกลับข้อความของฉันใช้ตัวเลือกในหมวดตัวกรองเพิ่มเติม', 'VALIDATION');
  let value = u.str(body.value, { max: 100, required: true, field: 'คำค้นหา' });
  if (type === 'mention') value = value.replace(/^@/, '').toLowerCase();
  if (type === 'sender' && !/^\d{1,20}$/.test(value)) throw new u.HttpError(400, 'Telegram User ID ต้องเป็นตัวเลข', 'VALIDATION');
  if (type === 'mention' && !/^[A-Za-z0-9_]{3,64}$/.test(value)) throw new u.HttpError(400, 'Telegram Username ไม่ถูกต้อง', 'VALIDATION');
  const dup = db.prepare('SELECT 1 FROM telegram_filters WHERE user_id = ? AND type = ? AND value = ?').get(user.id, type, value);
  if (dup) throw new u.HttpError(409, 'มีตัวกรองนี้อยู่แล้ว', 'DUPLICATE');
  const id = u.uid();
  db.prepare('INSERT INTO telegram_filters (id, user_id, type, value, enabled, created_at) VALUES (?,?,?,?,1,?)').run(id, user.id, type, value, u.nowIso());
  return filtersDto(db.prepare('SELECT * FROM telegram_filters WHERE id = ?').get(id));
}

function updateFilter(user, id, body) {
  const f = db.prepare('SELECT * FROM telegram_filters WHERE id = ? AND user_id = ?').get(id, user.id);
  if (!f) throw new u.HttpError(404, 'ไม่พบตัวกรอง', 'NOT_FOUND');
  let value = body.value != null ? u.str(body.value, { max: 100, required: true, field: 'คำค้นหา' }) : f.value;
  if (f.type === 'mention') value = value.replace(/^@/, '').toLowerCase();
  const enabled = body.enabled != null ? (u.bool(body.enabled) ? 1 : 0) : f.enabled;
  db.prepare('UPDATE telegram_filters SET value = ?, enabled = ? WHERE id = ? AND user_id = ?').run(value, enabled, id, user.id);
  return filtersDto(db.prepare('SELECT * FROM telegram_filters WHERE id = ?').get(id));
}

function deleteFilter(user, id) {
  const r = db.prepare('DELETE FROM telegram_filters WHERE id = ? AND user_id = ?').run(id, user.id);
  if (!r.changes) throw new u.HttpError(404, 'ไม่พบตัวกรอง', 'NOT_FOUND');
  return { ok: true };
}

// ---------------------------------------------------------------- overview, auto-reply check, logs
function overview(user) {
  const bots = db.prepare('SELECT status FROM telegram_bots WHERE user_id = ?').all(user.id);
  const groups = db.prepare('SELECT enabled, bot_id, auto_reply FROM telegram_groups WHERE user_id = ?').all(user.id);
  const filters = db.prepare('SELECT enabled FROM telegram_filters WHERE user_id = ?').all(user.id);
  const settings = features.getSettings(user.id);
  return {
    bots: { total: bots.length, ready: bots.filter((b) => b.status === 'connected').length },
    groups: { total: groups.length, enabled: groups.filter((g) => g.enabled).length, unlinked: groups.filter((g) => !g.bot_id).length },
    filters: { total: filters.length, enabled: filters.filter((f) => f.enabled).length },
    autoReply: {
      enabled: settings.autoReply.enabled,
      text: settings.autoReply.text,
      groupsOn: groups.filter((g) => g.auto_reply && g.bot_id).length,
    },
    recentLogs: listLogs(user, { limit: '5' }),
  };
}

// Checks a group's auto-reply setup and reports the latest real result from stored data.
function autoReplyCheck(user, groupId) {
  const g = db.prepare(`SELECT g.*, b.name AS bot_name FROM telegram_groups g LEFT JOIN telegram_bots b ON b.id = g.bot_id
    WHERE g.id = ? AND g.user_id = ?`).get(groupId, user.id);
  if (!g) throw new u.HttpError(404, 'ไม่พบกลุ่ม', 'NOT_FOUND');
  const settings = features.getSettings(user.id);
  const mentionFilters = db.prepare("SELECT COUNT(*) AS c FROM telegram_filters WHERE user_id = ? AND type = 'mention' AND enabled = 1").get(user.id).c;
  const checks = [
    { label: 'เปิดตอบรับอัตโนมัติ (ทั้งระบบ)', ok: settings.autoReply.enabled },
    { label: 'เปิดตอบรับในกลุ่มนี้', ok: !!g.auto_reply },
    { label: 'กลุ่มเปิดการติดตามอยู่', ok: !!g.enabled },
    { label: 'มีบอทเชื่อมต่อและทดสอบสิทธิ์แล้ว', ok: !!g.bot_id && g.status === 'ready' },
    { label: 'มี Username ที่ติดตามอย่างน้อย 1 รายการ', ok: mentionFilters > 0 },
    { label: 'มีข้อความตอบรับ', ok: !!settings.autoReply.text },
  ];
  const lastMention = db.prepare(`SELECT sender_name, text, sent_at FROM telegram_messages
    WHERE group_id = ? AND user_id = ? AND is_outgoing = 0 AND matched LIKE '%"mention"%' ORDER BY sent_at DESC LIMIT 1`).get(g.id, user.id);
  const lastReply = db.prepare(`SELECT status, error, created_at FROM telegram_outbox
    WHERE user_id = ? AND group_id = ? AND client_key LIKE 'auto:%' ORDER BY created_at DESC LIMIT 1`).get(user.id, g.id);
  return {
    ready: checks.every((c) => c.ok),
    checks,
    lastMention: lastMention ? { senderName: lastMention.sender_name, text: lastMention.text.slice(0, 120), sentAt: lastMention.sent_at, saved: true } : null,
    lastReply: lastReply ? { status: lastReply.status, error: lastReply.error, at: lastReply.created_at } : null,
  };
}

function listLogs(user, q) {
  const where = ['user_id = ?'];
  const params = [user.id];
  const tz = user.timezone || 'Asia/Bangkok';
  if (q.from) {
    where.push('created_at >= ?');
    params.push(u.zonedToIso(u.dateReq(q.from, 'วันที่เริ่มต้น'), '00:00', tz));
  }
  if (q.to) {
    where.push('created_at < ?');
    params.push(u.zonedToIso(u.addDays(u.dateReq(q.to, 'วันที่สิ้นสุด'), 1), '00:00', tz));
  }
  if (q.event) { where.push('event = ?'); params.push(String(q.event).slice(0, 60)); }
  if (q.bot) { where.push('bot_name = ?'); params.push(String(q.bot).slice(0, 120)); }
  if (q.group) { where.push('group_title = ?'); params.push(String(q.group).slice(0, 120)); }
  if (q.status) { where.push('status = ?'); params.push(u.oneOf(q.status, ['success', 'failed'], 'สถานะ')); }
  if (q.q) {
    const like = `%${String(q.q).slice(0, 80).replace(/[%_]/g, '')}%`;
    where.push('(detail LIKE ? OR event LIKE ? OR bot_name LIKE ? OR group_title LIKE ?)');
    params.push(like, like, like, like);
  }
  const limit = u.int(q.limit || 200, { min: 1, max: 500, field: 'จำนวนรายการ' });
  return db.prepare(`SELECT id, created_at, event, bot_name, group_title, status, detail FROM telegram_logs
    WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ${limit}`).all(...params).map((r) => ({
    id: r.id, at: r.created_at, event: r.event, bot: r.bot_name, group: r.group_title, status: r.status, detail: r.detail,
  }));
}

module.exports = {
  TelegramError, listBots, createBot, updateBot, deleteBot, testBot, setWebhookForUser,
  listGroups, createGroup, updateGroup, deleteGroup, testGroup,
  processUpdate, pollAll, chatList, groupMessages, mentionList, markGroupRead, mediaFile,
  sendMessage, retryOutbox, outboxForGroup,
  listFilters, createFilter, updateFilter, deleteFilter, groupTopics, renameTopic, setTopicColor, createTopic, ackMessage, setGroupTags, unlockGroup, unlockWithPassword,
  overview, autoReplyCheck, listLogs, subscribe, sendFile, sendSticker,
  getWebhookBot: (id) => db.prepare('SELECT * FROM telegram_bots WHERE id = ?').get(id),
  publicBaseUrl,
};
