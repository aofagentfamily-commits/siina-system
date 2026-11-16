'use strict';
// Email + password login. The first visit for an allowed email asks the user to set a password once;
// after that the normal sign-in is used. Sessions are server-side and stored as hashes.
const crypto = require('crypto');
const { db } = require('./db');
const u = require('./util');

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const COOKIE_NAME = 'siina_sid';
const MIN_PASSWORD_LENGTH = 10;
const MAX_FAILED_LOGINS = 5;
const LOCK_MS = 15 * 60 * 1000;
const failedLogins = new Map(); // email -> { count, lockedUntil }  (in memory, per process)

function allowedEmails() {
  return (process.env.ALLOWED_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function assertAllowed(email) {
  if (!allowedEmails().includes(email)) {
    throw new u.HttpError(403, 'อีเมลนี้ยังไม่ได้รับอนุญาตให้เข้าระบบ', 'EMAIL_NOT_ALLOWED');
  }
}

// scrypt with a random salt; stored as "scrypt$<salt>$<key>".
const SCRYPT = { N: 16384, r: 8, p: 1 };
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 64, SCRYPT);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}
function verifyPassword(password, stored) {
  const [scheme, saltB64, keyB64] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !saltB64 || !keyB64) return false;
  const key = crypto.scryptSync(password, Buffer.from(saltB64, 'base64'), 64, SCRYPT);
  return u.safeEqual(key.toString('base64'), keyB64);
}

function findUser(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email) || null;
}

function upsertUser(email) {
  const existing = findUser(email);
  if (existing) return existing;
  const now = u.nowIso();
  const id = u.uid();
  db.prepare('INSERT INTO users (id, email, display_name, created_at, updated_at) VALUES (?,?,?,?,?)')
    .run(id, email, email.split('@')[0], now, now);
  return findUser(email);
}

// Tells the login page whether this allowed email still needs its one-time password setup.
function checkEmail(rawEmail, ip) {
  u.rateLimit(`auth-check-ip:${ip}`, 60, 15 * 60 * 1000);
  const email = u.email(rawEmail);
  assertAllowed(email);
  const user = findUser(email);
  return { mode: user && user.password_hash ? 'login' : 'setup' };
}

function createSession(userId, userAgent) {
  const token = u.randomToken(32);
  const now = new Date();
  db.prepare('INSERT INTO login_sessions (id, user_id, token_hash, created_at, expires_at, user_agent) VALUES (?,?,?,?,?,?)')
    .run(u.uid(), userId, u.sha256(token), now.toISOString(), new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
      String(userAgent || '').slice(0, 200));
  return token;
}

// One-time: sets the password for an allowed email that has none yet.
function setupPassword(rawEmail, password, confirm, ip, userAgent) {
  u.rateLimit(`auth-setup-ip:${ip}`, 10, 15 * 60 * 1000);
  const email = u.email(rawEmail);
  assertAllowed(email);
  const pw = String(password || '');
  if (pw.length < MIN_PASSWORD_LENGTH) {
    throw new u.HttpError(400, `รหัสผ่านต้องมีอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`, 'WEAK_PASSWORD');
  }
  if (pw.length > 200) throw new u.HttpError(400, 'รหัสผ่านยาวเกินไป', 'VALIDATION');
  if (pw !== String(confirm || '')) throw new u.HttpError(400, 'รหัสผ่านสองช่องไม่ตรงกัน', 'MISMATCH');

  const user = upsertUser(email);
  if (user.password_hash) {
    throw new u.HttpError(409, 'บัญชีนี้ตั้งรหัสผ่านแล้ว กรุณาเข้าสู่ระบบด้วยรหัสผ่าน', 'ALREADY_SET');
  }
  // Atomic: only succeeds while no password is stored yet.
  const result = db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ? AND password_hash IS NULL')
    .run(hashPassword(pw), u.nowIso(), user.id);
  if (!result.changes) throw new u.HttpError(409, 'บัญชีนี้ตั้งรหัสผ่านแล้ว กรุณาเข้าสู่ระบบด้วยรหัสผ่าน', 'ALREADY_SET');

  const token = createSession(user.id, userAgent);
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(u.nowIso(), user.id);
  u.activity(user.id, 'setup', 'account', user.id, 'ตั้งรหัสผ่านครั้งแรก');
  return { token, user: findUser(email) };
}

function login(rawEmail, password, ip, userAgent) {
  u.rateLimit(`auth-login-ip:${ip}`, 30, 15 * 60 * 1000);
  const email = u.email(rawEmail);
  assertAllowed(email);
  const pw = String(password || '');
  if (!pw) throw new u.HttpError(400, 'กรุณากรอกรหัสผ่าน', 'VALIDATION');

  const state = failedLogins.get(email) || { count: 0, lockedUntil: 0 };
  if (state.lockedUntil > Date.now()) {
    const wait = Math.ceil((state.lockedUntil - Date.now()) / 1000);
    throw new u.HttpError(429, `กรอกรหัสผ่านผิดหลายครั้ง กรุณารอ ${Math.ceil(wait / 60)} นาทีแล้วลองใหม่`, 'LOCKED', wait);
  }

  const user = findUser(email);
  if (!user || !user.password_hash) {
    throw new u.HttpError(400, 'ยังไม่ได้ตั้งรหัสผ่าน กรุณาตั้งรหัสผ่านก่อนเข้าสู่ระบบ', 'SETUP_REQUIRED');
  }
  if (!verifyPassword(pw, user.password_hash)) {
    state.count += 1;
    if (state.count >= MAX_FAILED_LOGINS) {
      state.lockedUntil = Date.now() + LOCK_MS;
      state.count = 0;
    }
    failedLogins.set(email, state);
    u.activity(user.id, 'login_failed', 'session', null, 'รหัสผ่านไม่ถูกต้อง');
    throw new u.HttpError(401, 'อีเมลหรือรหัสผ่านไม่ถูกต้อง', 'INVALID_CREDENTIALS');
  }

  failedLogins.delete(email);
  const token = createSession(user.id, userAgent);
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(u.nowIso(), user.id);
  u.activity(user.id, 'login', 'session', null, 'เข้าสู่ระบบ');
  return { token, user };
}

function userFromToken(token) {
  if (!token) return null;
  const row = db.prepare(`
    SELECT u.* FROM login_sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ?`).get(u.sha256(token), u.nowIso());
  return row || null;
}

function revokeToken(token) {
  if (!token) return;
  db.prepare('UPDATE login_sessions SET revoked_at = ? WHERE token_hash = ?').run(u.nowIso(), u.sha256(token));
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > -1 && part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

function sessionCookie(token, maxAgeSeconds) {
  const secure = process.env.COOKIE_SECURE === '1' || process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`;
}

module.exports = {
  COOKIE_NAME, checkEmail, setupPassword, login, userFromToken, revokeToken, readCookie, sessionCookie,
  allowedEmails, MIN_PASSWORD_LENGTH,
};
