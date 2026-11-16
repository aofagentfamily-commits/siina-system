'use strict';
// Shared helpers: errors, crypto, validation, rate limiting, time-zone math, logging.
const crypto = require('crypto');
const { db } = require('./db');

class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code || 'ERROR';
  }
}

const uid = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();
const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const hmac = (key, s) => crypto.createHmac('sha256', key).update(s).digest('hex');
function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// ---- Secret handling -------------------------------------------------------
// APP_SECRET protects OTP hashes, webhook secrets and encrypts Telegram bot tokens at rest.
function appSecret() {
  const s = process.env.APP_SECRET || '';
  if (s.length < 32) throw new HttpError(500, 'APP_SECRET ต้องมีความยาวอย่างน้อย 32 ตัวอักษร', 'CONFIG');
  return s;
}
function encKey() {
  return crypto.createHash('sha256').update('siina-token:' + appSecret()).digest();
}
function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ct].map((b) => b.toString('base64')).join('.');
}
function decrypt(blob) {
  const [iv, tag, ct] = blob.split('.').map((p) => Buffer.from(p, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', encKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

// ---- Validation ------------------------------------------------------------
function str(v, { max = 500, required = false, field = 'ข้อมูล' } = {}) {
  const s = v == null ? '' : String(v).trim();
  if (required && !s) throw new HttpError(400, `กรุณากรอก${field}`, 'VALIDATION');
  if (s.length > max) throw new HttpError(400, `${field}ยาวเกิน ${max} ตัวอักษร`, 'VALIDATION');
  return s;
}
function oneOf(v, list, field = 'ค่า') {
  if (!list.includes(v)) throw new HttpError(400, `${field}ไม่ถูกต้อง`, 'VALIDATION');
  return v;
}
function bool(v) {
  return v === true || v === 'true' || v === 1 || v === '1';
}
function int(v, { min, max, field = 'ตัวเลข' } = {}) {
  const n = Number(v);
  if (!Number.isInteger(n) || (min != null && n < min) || (max != null && n > max)) {
    throw new HttpError(400, `${field}ไม่ถูกต้อง`, 'VALIDATION');
  }
  return n;
}
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
function email(v) {
  const s = str(v, { max: 254, required: true, field: 'อีเมล' }).toLowerCase();
  if (!EMAIL_RE.test(s)) throw new HttpError(400, 'รูปแบบอีเมลไม่ถูกต้อง', 'VALIDATION');
  return s;
}
function isDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
function dateOpt(v, field = 'วันที่') {
  if (v == null || v === '') return null;
  if (!isDate(v)) throw new HttpError(400, `${field}ไม่ถูกต้อง`, 'VALIDATION');
  return v;
}
function dateReq(v, field = 'วันที่') {
  if (!isDate(v)) throw new HttpError(400, `กรุณาเลือก${field}`, 'VALIDATION');
  return v;
}
function timeOpt(v, field = 'เวลา') {
  if (v == null || v === '') return null;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) throw new HttpError(400, `${field}ไม่ถูกต้อง`, 'VALIDATION');
  return v;
}
function httpUrlOpt(v, field = 'URL') {
  const s = str(v, { max: 2000, field });
  if (!s) return null;
  let u;
  try { u = new URL(s); } catch { throw new HttpError(400, `${field}ไม่ถูกต้อง`, 'VALIDATION'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new HttpError(400, `${field}ต้องขึ้นต้นด้วย http:// หรือ https://`, 'VALIDATION');
  return u.toString();
}
function isValidTimezone(tz) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

// ---- Rate limiting (in-memory, per process) --------------------------------
const buckets = new Map();
function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  const arr = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    buckets.set(key, arr);
    const retryAfter = Math.ceil((arr[0] + windowMs - now) / 1000);
    throw new HttpError(429, 'ทำรายการบ่อยเกินไป กรุณารอสักครู่', 'RATE_LIMIT', retryAfter);
  }
  arr.push(now);
  buckets.set(key, arr);
}

// ---- Time zone math --------------------------------------------------------
function tzOffsetMs(date, tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date);
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - (date.getTime() - date.getUTCMilliseconds());
}
// Convert a local date+time in an IANA time zone into a UTC ISO string.
function zonedToIso(date, time, tz) {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = (time || '09:00').split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  let guess = wall;
  for (let i = 0; i < 2; i++) guess = wall - tzOffsetMs(new Date(guess), tz);
  return new Date(guess).toISOString();
}
// Today's date (YYYY-MM-DD) in a time zone.
function todayIn(tz, at = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}
function addDays(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// ---- Logging (never logs secrets, OTP codes or tokens) ----------------------
function logError(message, context = '') {
  try {
    db.prepare('INSERT INTO error_logs (id, level, message, context, created_at) VALUES (?,?,?,?,?)')
      .run(uid(), 'error', String(message).slice(0, 500), String(context).slice(0, 1000), nowIso());
  } catch (e) {
    console.error('log write failed', e.message);
  }
}
function activity(userId, action, entity, entityId, detail = '') {
  db.prepare('INSERT INTO activity_logs (id, user_id, action, entity, entity_id, detail, created_at) VALUES (?,?,?,?,?,?,?)')
    .run(uid(), userId, action, entity, entityId || null, String(detail).slice(0, 300), nowIso());
}

module.exports = {
  HttpError, uid, nowIso, randomToken, sha256, hmac, safeEqual, appSecret, encrypt, decrypt,
  str, oneOf, bool, int, email, isDate, dateOpt, dateReq, timeOpt, httpUrlOpt, isValidTimezone,
  rateLimit, zonedToIso, todayIn, addDays, logError, activity,
};
