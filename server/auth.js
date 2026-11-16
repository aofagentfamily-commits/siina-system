'use strict';
// Email OTP login (6 digits, 5 min, single use, attempt-limited) + server-side sessions.
const crypto = require('crypto');
const { db } = require('./db');
const u = require('./util');
const mailer = require('./mailer');

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_PER_15_MIN = 5;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const COOKIE_NAME = 'siina_sid';

function allowedEmails() {
  return (process.env.ALLOWED_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function otpHash(email, code) {
  return u.hmac(u.appSecret(), `otp:${email}:${code}`);
}

function requestOtp(rawEmail, ip) {
  const email = u.email(rawEmail);
  if (!allowedEmails().includes(email)) {
    throw new u.HttpError(403, 'อีเมลนี้ยังไม่ได้รับอนุญาตให้เข้าระบบ', 'EMAIL_NOT_ALLOWED');
  }
  if (!mailer.isConfigured()) {
    throw new u.HttpError(503, 'ระบบส่งอีเมลยังไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแลระบบ', 'MAIL_NOT_CONFIGURED');
  }
  u.rateLimit(`otp-ip:${ip}`, 20, 15 * 60 * 1000);

  const last = db.prepare('SELECT created_at FROM otp_requests WHERE email = ? ORDER BY created_at DESC LIMIT 1').get(email);
  if (last) {
    const wait = OTP_RESEND_COOLDOWN_MS - (Date.now() - new Date(last.created_at).getTime());
    if (wait > 0) {
      throw new u.HttpError(429, `กรุณารอ ${Math.ceil(wait / 1000)} วินาทีก่อนขอรหัสใหม่`, 'OTP_COOLDOWN', Math.ceil(wait / 1000));
    }
  }
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const count = db.prepare('SELECT COUNT(*) AS c FROM otp_requests WHERE email = ? AND created_at > ?').get(email, since).c;
  if (count >= OTP_MAX_PER_15_MIN) {
    throw new u.HttpError(429, 'ขอรหัส OTP บ่อยเกินไป กรุณาลองใหม่ภายหลัง', 'OTP_LIMIT', 15 * 60);
  }

  const code = crypto.randomInt(0, 1000000).toString().padStart(6, '0');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OTP_TTL_MS).toISOString();
  // Invalidate older unused codes so only the latest one works.
  db.prepare('UPDATE otp_requests SET used_at = ? WHERE email = ? AND used_at IS NULL').run(now.toISOString(), email);
  const id = u.uid();
  db.prepare('INSERT INTO otp_requests (id, email, code_hash, expires_at, attempts, created_at) VALUES (?,?,?,?,0,?)')
    .run(id, email, otpHash(email, code), expiresAt, now.toISOString());

  // Send asynchronously; the caller awaits this via the returned promise.
  return mailer.sendOtp(email, code, OTP_TTL_MS / 60000).then(
    () => ({ expiresAt, resendAfterSeconds: OTP_RESEND_COOLDOWN_MS / 1000 }),
    (err) => {
      db.prepare('UPDATE otp_requests SET used_at = ? WHERE id = ?').run(new Date().toISOString(), id);
      u.logError('OTP mail failed: ' + err.message, 'auth.requestOtp');
      throw new u.HttpError(502, 'ไม่สามารถส่งอีเมลได้ กรุณาลองใหม่อีกครั้ง', 'MAIL_FAILED');
    },
  );
}

function verifyOtp(rawEmail, rawCode, ip, userAgent) {
  const email = u.email(rawEmail);
  const code = String(rawCode || '').trim();
  if (!/^\d{6}$/.test(code)) throw new u.HttpError(400, 'กรุณากรอกรหัส OTP 6 หลัก', 'VALIDATION');
  u.rateLimit(`otp-verify-ip:${ip}`, 30, 15 * 60 * 1000);

  const row = db.prepare(
    'SELECT * FROM otp_requests WHERE email = ? AND used_at IS NULL ORDER BY created_at DESC LIMIT 1',
  ).get(email);
  if (!row || new Date(row.expires_at) < new Date()) {
    throw new u.HttpError(400, 'รหัส OTP หมดอายุหรือไม่ถูกต้อง กรุณาขอรหัสใหม่', 'OTP_EXPIRED');
  }
  if (row.attempts >= OTP_MAX_ATTEMPTS) {
    db.prepare('UPDATE otp_requests SET used_at = ? WHERE id = ?').run(new Date().toISOString(), row.id);
    throw new u.HttpError(429, 'กรอกรหัสผิดเกินกำหนด กรุณาขอรหัสใหม่', 'OTP_LOCKED');
  }
  const attempts = row.attempts + 1;
  db.prepare('UPDATE otp_requests SET attempts = ? WHERE id = ?').run(attempts, row.id);
  if (!u.safeEqual(row.code_hash, otpHash(email, code))) {
    const left = OTP_MAX_ATTEMPTS - attempts;
    throw new u.HttpError(400, `รหัส OTP ไม่ถูกต้อง (เหลือ ${left} ครั้ง)`, 'OTP_INVALID');
  }
  db.prepare('UPDATE otp_requests SET used_at = ? WHERE id = ?').run(new Date().toISOString(), row.id);

  const user = upsertUser(email);
  const token = createSession(user.id, userAgent);
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(new Date().toISOString(), user.id);
  u.activity(user.id, 'login', 'session', null, 'เข้าสู่ระบบด้วย OTP');
  return { token, user };
}

function upsertUser(email) {
  const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (existing) return existing;
  const now = u.nowIso();
  const id = u.uid();
  db.prepare('INSERT INTO users (id, email, display_name, created_at, updated_at) VALUES (?,?,?,?,?)')
    .run(id, email, email.split('@')[0], now, now);
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function createSession(userId, userAgent) {
  const token = u.randomToken(32);
  const now = new Date();
  db.prepare('INSERT INTO login_sessions (id, user_id, token_hash, created_at, expires_at, user_agent) VALUES (?,?,?,?,?,?)')
    .run(u.uid(), userId, u.sha256(token), now.toISOString(), new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
      String(userAgent || '').slice(0, 200));
  return token;
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
  COOKIE_NAME, requestOtp, verifyOtp, userFromToken, revokeToken, readCookie, sessionCookie,
  allowedEmails, OTP_TTL_MS,
};
