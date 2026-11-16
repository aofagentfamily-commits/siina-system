'use strict';
// Telegram Bot integration: bot & group management, message ingest (webhook or polling),
// keyword/mention/sender/reply filters, and an idempotent send-to-group outbox.
// Bot tokens are encrypted at rest and never returned to the browser in full.
const fs = require('fs');
const path = require('path');
const { db, DATA_DIR } = require('./db');
const u = require('./util');

const API_BASE = 'https://api.telegram.org';
const TOKEN_RE = /^\d{5,}:[A-Za-z0-9_-]{20,}$/;
const FILTER_TYPES = ['mention', 'keyword', 'sender'];

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

// ---------------------------------------------------------------- bots
function botDto(b) {
  return {
    id: b.id, name: b.name, username: b.username, tokenHint: b.token_hint, mode: b.mode,
    status: b.status, lastError: b.last_error, createdAt: b.created_at,
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
  return db.prepare('SELECT * FROM telegram_bots WHERE user_id = ? ORDER BY created_at').all(user.id).map(botDto);
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
  db.prepare(`INSERT INTO telegram_bots (id, user_id, name, username, token_enc, token_hint, mode, webhook_secret, status, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, user.id, name, me.username || null, u.encrypt(token), '••••' + token.slice(-4), mode,
      u.randomToken(24), 'connected', now, now);
  u.activity(user.id, 'create', 'telegram_bot', id, name);
  if (mode === 'webhook') await registerWebhook(user, id).catch(() => null);
  return botDto(getBot(user, id));
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
  db.prepare('UPDATE telegram_bots SET name=?, username=?, token_enc=?, token_hint=?, mode=?, status=?, updated_at=? WHERE id=? AND user_id=?')
    .run(name, username, tokenEnc, tokenHint, mode, 'connected', u.nowIso(), id, user.id);
  if (mode === 'webhook') await registerWebhook(user, id).catch(() => null);
  u.activity(user.id, 'update', 'telegram_bot', id, name);
  return botDto(getBot(user, id));
}

function deleteBot(user, id) {
  getBot(user, id);
  db.prepare('DELETE FROM telegram_bots WHERE id = ? AND user_id = ?').run(id, user.id);
  u.activity(user.id, 'delete', 'telegram_bot', id);
  return { ok: true };
}

async function testBot(user, id) {
  const bot = getBot(user, id);
  try {
    const me = await callApi(botToken(bot), 'getMe');
    db.prepare('UPDATE telegram_bots SET status=?, username=?, last_error=NULL, updated_at=? WHERE id=?')
      .run('connected', me.username || null, u.nowIso(), id);
    return { ok: true, username: me.username, name: me.first_name };
  } catch (err) {
    db.prepare('UPDATE telegram_bots SET status=?, last_error=?, updated_at=? WHERE id=?').run('error', err.message, u.nowIso(), id);
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
  return { ok: true };
}

// ---------------------------------------------------------------- groups
function groupDto(g) {
  return {
    id: g.id, botId: g.bot_id, title: g.title, chatId: g.chat_id, enabled: !!g.enabled,
    status: g.status, lastError: g.last_error, lastTestedAt: g.last_tested_at,
  };
}

function getGroup(user, id) {
  const g = db.prepare('SELECT * FROM telegram_groups WHERE id = ? AND user_id = ?').get(id, user.id);
  if (!g) throw new u.HttpError(404, 'ไม่พบกลุ่ม', 'NOT_FOUND');
  return g;
}

function listGroups(user) {
  return db.prepare('SELECT * FROM telegram_groups WHERE user_id = ? ORDER BY title').all(user.id).map(groupDto);
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
  db.prepare(`INSERT INTO telegram_groups (id, user_id, bot_id, title, chat_id, enabled, status, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(id, user.id, bot.id, title, chatId, u.bool(body.enabled ?? true) ? 1 : 0, 'unknown', now, now);
  u.activity(user.id, 'create', 'telegram_group', id, title);
  return groupDto(getGroup(user, id));
}

function updateGroup(user, id, body) {
  const g = getGroup(user, id);
  const title = body.title != null ? u.str(body.title, { max: 120, required: true, field: 'ชื่อกลุ่ม' }) : g.title;
  const enabled = body.enabled != null ? (u.bool(body.enabled) ? 1 : 0) : g.enabled;
  db.prepare('UPDATE telegram_groups SET title=?, enabled=?, updated_at=? WHERE id=? AND user_id=?')
    .run(title, enabled, u.nowIso(), id, user.id);
  return groupDto(getGroup(user, id));
}

function deleteGroup(user, id) {
  getGroup(user, id);
  db.prepare('DELETE FROM telegram_groups WHERE id = ? AND user_id = ?').run(id, user.id);
  u.activity(user.id, 'delete', 'telegram_group', id);
  return { ok: true };
}

// Checks that the bot can see the chat and whether it can post in it.
async function testGroup(user, id) {
  const g = getGroup(user, id);
  const bot = getBot(user, g.bot_id);
  const token = botToken(bot);
  const me = await callApi(token, 'getMe').catch((err) => ({ id: null, error: err.message }));
  if (!me.id) return saveGroupTest(id, false, 'ไม่สามารถอ่านข้อมูลบอทได้', null);
  let chat;
  let member;
  try {
    chat = await callApi(token, 'getChat', { chat_id: g.chat_id });
    member = await callApi(token, 'getChatMember', { chat_id: g.chat_id, user_id: me.id });
  } catch (err) {
    return saveGroupTest(id, false, err.message, null);
  }
  const status = member.status;
  const isAdmin = status === 'administrator' || status === 'creator';
  const canPost = isAdmin ? member.can_post_messages !== false : status === 'member' || (status === 'restricted' && member.can_send_messages !== false);
  const message = canPost
    ? 'บอทอ่านและส่งข้อความได้' + (isAdmin ? '' : ' (แนะนำให้ตั้งบอทเป็นแอดมินเพื่อรับข้อความทั้งหมด)')
    : 'บอทไม่มีสิทธิ์ส่งข้อความในกลุ่มนี้';
  if (chat.title) db.prepare('UPDATE telegram_groups SET title=? WHERE id=?').run(chat.title, id);
  return saveGroupTest(id, canPost, message, { title: chat.title, botStatus: status, isAdmin });
}

function saveGroupTest(id, ok, message, info) {
  db.prepare('UPDATE telegram_groups SET status=?, last_error=?, last_tested_at=?, updated_at=? WHERE id=?')
    .run(ok ? 'ready' : 'error', ok ? null : message, u.nowIso(), u.nowIso(), id);
  return { ok, message, ...(info || {}) };
}

// ---------------------------------------------------------------- ingest
const MEDIA_LIMIT = 20 * 1024 * 1024; // Bot API download limit

// Keeps what is needed to fetch the file later (file_id stays on the server, never sent to the browser).
function attachmentsOf(msg) {
  const list = [];
  const push = (type, name, f, mime) => {
    if (!f || !f.file_id) return;
    if (f.file_unique_id && list.some((x) => x.uniqueId === f.file_unique_id)) return; // same file sent twice
    list.push({ type, name, fileId: f.file_id, uniqueId: f.file_unique_id || null, mime, size: f.file_size || 0 });
  };
  if (msg.photo && msg.photo.length) push('photo', 'รูปภาพ', msg.photo[msg.photo.length - 1], 'image/jpeg');
  if (msg.sticker) {
    const st = msg.sticker;
    const mime = st.is_animated ? 'application/x-tgsticker' : st.is_video ? 'video/webm' : 'image/webp';
    push('sticker', st.emoji ? `สติกเกอร์ ${st.emoji}` : 'สติกเกอร์', st, mime);
  }
  push('animation', msg.animation && msg.animation.file_name || 'GIF', msg.animation, 'video/mp4');
  push('video', msg.video && msg.video.file_name || 'วิดีโอ', msg.video, 'video/mp4');
  push('voice', 'ข้อความเสียง', msg.voice, 'audio/ogg');
  push('audio', msg.audio && msg.audio.file_name || 'เสียง', msg.audio, 'audio/mpeg');
  push('document', msg.document && msg.document.file_name || 'ไฟล์', msg.document, (msg.document && msg.document.mime_type) || 'application/octet-stream');
  return list;
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

function matchFilters(user, msg, replyToSenderId, mentions) {
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
  if (myId && replyToSenderId && replyToSenderId === myId) reasons.add('reply_to_me');
  if (myId && mentions.ids.has(myId)) reasons.add('mention');
  return [...reasons];
}

// Store one incoming Telegram message for every enabled group that matches the bot + chat.
function ingestMessage(bot, msg) {
  const chatId = String(msg.chat.id);
  const groups = db.prepare('SELECT * FROM telegram_groups WHERE bot_id = ? AND chat_id = ? AND enabled = 1').all(bot.id, chatId);
  for (const g of groups) {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(g.user_id);
    const exists = db.prepare('SELECT id FROM telegram_messages WHERE group_id = ? AND message_id = ?').get(g.id, msg.message_id);
    if (exists) continue; // dedupe: same message delivered twice (webhook retry / polling overlap)
    const reply = msg.reply_to_message || null;
    const replyToSenderId = reply && reply.from ? String(reply.from.id) : null;
    const mentions = mentionsIn(msg);
    const matched = matchFilters(user, msg, replyToSenderId, mentions);
    const isOutgoing = msg.from && bot.username && msg.from.username === bot.username ? 1 : 0;
    const id = u.uid();
    db.prepare(`INSERT INTO telegram_messages (id, user_id, group_id, message_id, sender_id, sender_name, sender_username, text,
      attachments, reply_to_message_id, reply_to_sender_id, reply_to_text, matched, is_outgoing, sent_at, received_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, user.id, g.id, msg.message_id,
      msg.from ? String(msg.from.id) : null,
      msg.from ? [msg.from.first_name, msg.from.last_name].filter(Boolean).join(' ') || msg.from.username || 'ไม่ทราบชื่อ' : (msg.sender_chat ? msg.sender_chat.title : 'ไม่ทราบชื่อ'),
      msg.from && msg.from.username ? msg.from.username : null,
      String(msg.text || msg.caption || '').slice(0, 4000),
      JSON.stringify(attachmentsOf(msg)),
      reply ? reply.message_id : null, replyToSenderId,
      reply ? String(reply.text || reply.caption || '').slice(0, 300) : null,
      JSON.stringify(matched), isOutgoing,
      new Date(msg.date * 1000).toISOString(), u.nowIso());
    if (matched.length) {
      db.prepare(`INSERT OR IGNORE INTO notifications (id, user_id, source_type, source_id, title, body, remind_at, created_at)
        VALUES (?,?,?,?,?,?,?,?)`).run(u.uid(), user.id, 'telegram', id,
        `ข้อความสำคัญจาก ${g.title}`, String(msg.text || msg.caption || '(ไฟล์แนบ)').slice(0, 140),
        u.nowIso(), u.nowIso());
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
    offset: bot.update_offset + 1 || undefined,
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

// ---------------------------------------------------------------- messages & chat list
function chatList(user) {
  return db.prepare(`
    SELECT g.id, g.title, g.enabled, g.status,
      (SELECT text FROM telegram_messages m WHERE m.group_id = g.id ORDER BY sent_at DESC LIMIT 1) AS last_text,
      (SELECT sent_at FROM telegram_messages m WHERE m.group_id = g.id ORDER BY sent_at DESC LIMIT 1) AS last_at,
      (SELECT COUNT(*) FROM telegram_messages m WHERE m.group_id = g.id AND m.read_at IS NULL AND m.is_outgoing = 0) AS unread,
      (SELECT COUNT(*) FROM telegram_messages m WHERE m.group_id = g.id AND m.read_at IS NULL AND m.is_outgoing = 0 AND m.matched != '[]') AS mentions
    FROM telegram_groups g WHERE g.user_id = ? ORDER BY last_at DESC NULLS LAST, g.title`).all(user.id).map((r) => ({
    id: r.id, title: r.title, enabled: !!r.enabled, status: r.status,
    lastText: r.last_text ? r.last_text.slice(0, 120) : '', lastAt: r.last_at,
    unread: r.unread, mentions: r.mentions,
  }));
}

function groupMessages(user, groupId, q) {
  getGroup(user, groupId);
  const limit = u.int(q.limit || 60, { min: 1, max: 200, field: 'จำนวนข้อความ' });
  const before = q.before ? u.int(q.before, { min: 0, field: 'ตำแหน่งข้อความ' }) : null;
  const rows = db.prepare(`SELECT * FROM telegram_messages WHERE group_id = ? AND user_id = ?
    AND (? IS NULL OR message_id < ?) ORDER BY message_id DESC LIMIT ?`).all(groupId, user.id, before, before, limit);
  return rows.reverse().map((m) => ({
    id: m.id, messageId: m.message_id, senderId: m.sender_id, senderName: m.sender_name,
    text: m.text, attachments: JSON.parse(m.attachments).map((a) => ({ type: a.type, name: a.name, mime: a.mime, hasFile: !!a.fileId })), replyToMessageId: m.reply_to_message_id,
    replyToText: m.reply_to_text, matched: JSON.parse(m.matched), isOutgoing: !!m.is_outgoing,
    sentAt: m.sent_at, readAt: m.read_at,
  }));
}

function markGroupRead(user, groupId) {
  getGroup(user, groupId);
  db.prepare('UPDATE telegram_messages SET read_at = ? WHERE group_id = ? AND user_id = ? AND read_at IS NULL').run(u.nowIso(), groupId, user.id);
  return { ok: true };
}

// ---------------------------------------------------------------- send (outbox, idempotent)
function outboxDto(o) {
  return { id: o.id, groupId: o.group_id, text: o.text, replyToMessageId: o.reply_to_message_id, status: o.status, error: o.error, createdAt: o.created_at };
}

async function deliver(user, outboxId) {
  const o = db.prepare('SELECT * FROM telegram_outbox WHERE id = ? AND user_id = ?').get(outboxId, user.id);
  const g = getGroup(user, o.group_id);
  const bot = getBot(user, g.bot_id);
  try {
    const body = { chat_id: g.chat_id, text: o.text };
    if (o.reply_to_message_id) body.reply_parameters = { message_id: o.reply_to_message_id, allow_sending_without_reply: true };
    const sent = await callApi(botToken(bot), 'sendMessage', body);
    db.prepare("UPDATE telegram_outbox SET status='sent', telegram_message_id=?, error=NULL, updated_at=? WHERE id=?")
      .run(sent.message_id, u.nowIso(), o.id);
    db.prepare(`INSERT OR IGNORE INTO telegram_messages (id, user_id, group_id, message_id, sender_name, text, reply_to_message_id,
      is_outgoing, sent_at, received_at, read_at) VALUES (?,?,?,?,?,?,?,1,?,?,?)`).run(
      u.uid(), user.id, g.id, sent.message_id, bot.name, o.text, o.reply_to_message_id, u.nowIso(), u.nowIso(), u.nowIso());
  } catch (err) {
    db.prepare("UPDATE telegram_outbox SET status='failed', error=?, updated_at=? WHERE id=?").run(err.message, u.nowIso(), o.id);
  }
  return outboxDto(db.prepare('SELECT * FROM telegram_outbox WHERE id = ?').get(o.id));
}

async function sendMessage(user, groupId, body, clientKey) {
  const g = getGroup(user, groupId);
  if (!g.enabled) throw new u.HttpError(400, 'กลุ่มนี้ปิดการติดตามอยู่ เปิดก่อนจึงจะส่งได้', 'DISABLED');
  const text = u.str(body.text, { max: 4000, required: true, field: 'ข้อความ' });
  const key = u.str(clientKey || body.clientKey, { max: 100, required: true, field: 'รหัสการส่ง' });
  const replyTo = body.replyToMessageId ? u.int(body.replyToMessageId, { min: 1, field: 'ข้อความที่ตอบกลับ' }) : null;
  const existing = db.prepare('SELECT * FROM telegram_outbox WHERE user_id = ? AND client_key = ?').get(user.id, key);
  if (existing) return outboxDto(existing); // double-click / retry: return the same send
  const id = u.uid();
  const now = u.nowIso();
  db.prepare(`INSERT INTO telegram_outbox (id, user_id, group_id, text, reply_to_message_id, client_key, status, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(id, user.id, g.id, text, replyTo, key, 'sending', now, now);
  return deliver(user, id);
}

async function retryOutbox(user, id) {
  const o = db.prepare('SELECT * FROM telegram_outbox WHERE id = ? AND user_id = ?').get(id, user.id);
  if (!o) throw new u.HttpError(404, 'ไม่พบข้อความ', 'NOT_FOUND');
  if (o.status !== 'failed') throw new u.HttpError(400, 'ข้อความนี้ส่งสำเร็จแล้วหรือกำลังส่งอยู่', 'INVALID_STATE');
  db.prepare("UPDATE telegram_outbox SET status='sending', updated_at=? WHERE id=?").run(u.nowIso(), id);
  return deliver(user, id);
}

function outboxForGroup(user, groupId) {
  return db.prepare("SELECT * FROM telegram_outbox WHERE user_id = ? AND group_id = ? AND status != 'sent' ORDER BY created_at DESC LIMIT 20")
    .all(user.id, groupId).map(outboxDto);
}

// ---------------------------------------------------------------- filters
function filtersDto(f) { return { id: f.id, type: f.type, value: f.value, enabled: !!f.enabled }; }

function listFilters(user) {
  return db.prepare('SELECT * FROM telegram_filters WHERE user_id = ? ORDER BY type, value').all(user.id).map(filtersDto);
}

function createFilter(user, body) {
  const type = u.oneOf(body.type, [...FILTER_TYPES, 'reply_to_me'], 'ประเภทตัวกรอง');
  if (type === 'reply_to_me') throw new u.HttpError(400, 'การตอบกลับข้อความของฉันใช้ Telegram User ID ในหน้าตั้งค่าโปรไฟล์', 'VALIDATION');
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

module.exports = {
  TelegramError, listBots, createBot, updateBot, deleteBot, testBot, setWebhookForUser,
  listGroups, createGroup, updateGroup, deleteGroup, testGroup,
  processUpdate, pollAll, chatList, groupMessages, mediaFile, markGroupRead, sendMessage, retryOutbox, outboxForGroup,
  listFilters, createFilter, updateFilter, deleteFilter,
  getBot, getWebhookBot: (id) => db.prepare('SELECT * FROM telegram_bots WHERE id = ?').get(id),
  publicBaseUrl,
};
