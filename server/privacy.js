'use strict';
// Private area: SIINA SYSTEM is only reachable after the account's 6-digit PIN (or, while no PIN is set,
// the first-time setup). The unlock lives on the login session and expires. Checked on the server for every
// private API route, not only in the screen.
const { db } = require('./db');
const u = require('./util');
const auth = require('./auth');

const SESSION_CHOICES = [5, 15, 30, 60, 120, 480];
const MAX_TRIES = 5;
const WAIT_MS = 5 * 60 * 1000;
const failed = new Map(); // user id -> { count, waitUntil }

function settingsRow(userId) {
  return db.prepare('SELECT * FROM private_access WHERE user_id = ?').get(userId) || null;
}
function sessionRow(token) {
  if (!token) return null;
  return db.prepare('SELECT id, private_until FROM login_sessions WHERE token_hash = ? AND revoked_at IS NULL').get(u.sha256(token)) || null;
}
function sessionOpen(token) {
  const s = sessionRow(token);
  return !!s && !!s.private_until && s.private_until > u.nowIso();
}

// Unlocked when the session has an open window, or when the owner has explicitly switched the PIN off.
function isUnlocked(user, token) {
  const r = settingsRow(user.id);
  if (r && r.pin_hash && !r.enabled) return true;
  return sessionOpen(token);
}

function status(user, token) {
  const r = settingsRow(user.id);
  const s = sessionRow(token);
  return {
    hasPin: !!(r && r.pin_hash),
    enabled: r ? !!r.enabled : true,
    unlocked: isUnlocked(user, token),
    sessionMinutes: r ? r.session_minutes : 30,
    choices: SESSION_CHOICES,
    until: s && s.private_until && s.private_until > u.nowIso() ? s.private_until : null,
  };
}

function checkTries(userId) {
  const t = failed.get(userId);
  if (t && t.waitUntil > Date.now()) throw new u.HttpError(429, 'ใส่รหัสผิดหลายครั้ง กรุณารอ 5 นาทีแล้วลองใหม่', 'RATE_LIMIT');
}
function failTry(userId, message, code) {
  const t = failed.get(userId) || { count: 0, waitUntil: 0 };
  t.count += 1;
  if (t.count >= MAX_TRIES) {
    failed.set(userId, { count: 0, waitUntil: Date.now() + WAIT_MS });
    throw new u.HttpError(429, 'ใส่รหัสผิดหลายครั้ง กรุณารอ 5 นาทีแล้วลองใหม่', 'RATE_LIMIT');
  }
  failed.set(userId, t);
  throw new u.HttpError(403, `${message} (เหลือ ${MAX_TRIES - t.count} ครั้ง)`, code);
}

// Proof for changing sensitive settings: the current PIN, or the account password.
function proofOk(user, r, body) {
  const current = body.currentPin != null ? String(body.currentPin) : '';
  const password = body.password != null ? String(body.password) : '';
  const key = user.id;
  checkTries(key);
  if (current) {
    if (!r || !r.pin_hash || !auth.verifyPassword(current, r.pin_hash)) failTry(key, 'รหัสเดิมไม่ถูกต้อง', 'BAD_PIN');
  } else if (password) {
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id);
    if (!row || !auth.verifyPassword(password, row.password_hash)) failTry(key, 'รหัสผ่านบัญชีไม่ถูกต้อง', 'BAD_PASSWORD');
  } else {
    throw new u.HttpError(403, 'กรุณายืนยันรหัสเดิมหรือรหัสผ่านบัญชีก่อน', 'NEED_PROOF');
  }
  failed.delete(key);
}

function validPin(pin) {
  const value = String(pin == null ? '' : pin).trim();
  if (!/^\d{6}$/.test(value)) throw new u.HttpError(400, 'รหัสต้องเป็นตัวเลข 6 หลัก', 'VALIDATION');
  return value;
}

function upsert(userId, fields) {
  const now = u.nowIso();
  const r = settingsRow(userId);
  const next = {
    pin_hash: 'pin_hash' in fields ? fields.pin_hash : (r ? r.pin_hash : null),
    enabled: 'enabled' in fields ? (fields.enabled ? 1 : 0) : (r ? r.enabled : 1),
    session_minutes: 'session_minutes' in fields ? fields.session_minutes : (r ? r.session_minutes : 30),
  };
  db.prepare(`INSERT INTO private_access (user_id, pin_hash, enabled, session_minutes, updated_at) VALUES (?,?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET pin_hash = excluded.pin_hash, enabled = excluded.enabled,
    session_minutes = excluded.session_minutes, updated_at = excluded.updated_at`)
    .run(userId, next.pin_hash, next.enabled, next.session_minutes, now);
}

function openSession(token, minutes) {
  const s = sessionRow(token);
  if (!s) throw new u.HttpError(401, 'กรุณาเข้าสู่ระบบ', 'UNAUTHORIZED');
  const until = new Date(Date.now() + minutes * 60000).toISOString();
  db.prepare('UPDATE login_sessions SET private_until = ? WHERE id = ?').run(until, s.id);
}

// Sets the first PIN, or changes it with proof. Setting a PIN also opens the private area on this device.
function setPin(user, token, body = {}) {
  const r = settingsRow(user.id);
  const pin = validPin(body.pin);
  if (String(body.confirm != null ? body.confirm : '').trim() !== pin) throw new u.HttpError(400, 'รหัสยืนยันไม่ตรงกับรหัสที่ตั้ง', 'VALIDATION');
  if (r && r.pin_hash) proofOk(user, r, body);
  upsert(user.id, { pin_hash: auth.hashPassword(pin), enabled: true });
  openSession(token, (settingsRow(user.id) || {}).session_minutes || 30);
  u.activity(user.id, r && r.pin_hash ? 'change' : 'create', 'private_pin', user.id, '');
  return status(user, token);
}

function unlock(user, token, pin) {
  const r = settingsRow(user.id);
  if (!r || !r.pin_hash) throw new u.HttpError(400, 'ยังไม่ได้ตั้งรหัสส่วนตัว', 'NO_PIN');
  if (!r.enabled) return status(user, token);
  checkTries(user.id);
  if (!auth.verifyPassword(String(pin == null ? '' : pin), r.pin_hash)) failTry(user.id, 'รหัสไม่ถูกต้อง', 'BAD_PIN');
  failed.delete(user.id);
  openSession(token, r.session_minutes);
  u.activity(user.id, 'unlock', 'private_area', user.id, '');
  return status(user, token);
}

function lock(token) {
  const s = sessionRow(token);
  if (s) db.prepare('UPDATE login_sessions SET private_until = NULL WHERE id = ?').run(s.id);
  return { ok: true, unlocked: false };
}

// Turning the PIN off needs proof. Turning it on needs a PIN to exist already.
function setEnabled(user, token, body = {}) {
  const r = settingsRow(user.id);
  const on = u.bool(body.enabled);
  if (on && !(r && r.pin_hash)) throw new u.HttpError(400, 'ตั้งรหัสส่วนตัวก่อนจึงจะเปิดใช้งานได้', 'NO_PIN');
  if (!on) proofOk(user, r, body);
  upsert(user.id, { enabled: on });
  u.activity(user.id, on ? 'enable' : 'disable', 'private_pin', user.id, '');
  return status(user, token);
}

function setSessionMinutes(user, token, body = {}) {
  const minutes = Number(body.minutes);
  if (!SESSION_CHOICES.includes(minutes)) throw new u.HttpError(400, 'ระยะเวลาไม่ถูกต้อง', 'VALIDATION');
  upsert(user.id, { session_minutes: minutes });
  return status(user, token);
}

// Signs out every other device of this account. The current device stays signed in.
function logoutOthers(user, token) {
  const current = token ? u.sha256(token) : '';
  const result = db.prepare('UPDATE login_sessions SET revoked_at = ? WHERE user_id = ? AND token_hash != ? AND revoked_at IS NULL')
    .run(u.nowIso(), user.id, current);
  u.activity(user.id, 'logout_others', 'login_session', user.id, '');
  return { ok: true, signedOut: result.changes };
}

module.exports = { isUnlocked, status, setPin, unlock, lock, setEnabled, setSessionMinutes, logoutOthers, SESSION_CHOICES };
