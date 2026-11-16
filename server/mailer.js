'use strict';
// Outgoing email over SMTP (used for OTP codes and optional reminder emails).
// OTP codes are only ever sent by email; they are never logged or returned to the browser.
const { HttpError } = require('./util');

let transport = null;

function isConfigured() {
  return !!process.env.SMTP_HOST;
}

function getTransport() {
  if (transport) return transport;
  if (!isConfigured()) {
    throw new HttpError(503, 'ระบบส่งอีเมลยังไม่ได้ตั้งค่า (SMTP_HOST)', 'MAIL_NOT_CONFIGURED');
  }
  const nodemailer = require('nodemailer');
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === '1',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' } : undefined,
  });
  return transport;
}

// Tests can inject a fake transport.
function setTransport(t) {
  transport = t;
}

async function send({ to, subject, text, html }) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'SIINA SYSTEM <no-reply@localhost>';
  return getTransport().sendMail({ from, to, subject, text, html });
}

async function sendOtp(to, code, ttlMinutes) {
  return send({
    to,
    subject: 'รหัส OTP สำหรับเข้าสู่ SIINA SYSTEM',
    text: `รหัส OTP ของคุณคือ ${code}\nรหัสมีอายุ ${ttlMinutes} นาที และใช้ได้เพียงครั้งเดียว\nหากคุณไม่ได้ขอรหัสนี้ กรุณาละเลยอีเมลฉบับนี้`,
    html: `<div style="font-family:sans-serif"><p>รหัส OTP ของคุณคือ</p><p style="font-size:28px;letter-spacing:6px;font-weight:bold">${code}</p><p>รหัสมีอายุ ${ttlMinutes} นาที และใช้ได้เพียงครั้งเดียว<br>หากคุณไม่ได้ขอรหัสนี้ กรุณาละเลยอีเมลฉบับนี้</p></div>`,
  });
}

async function sendReminder(to, title, body) {
  return send({
    to,
    subject: `แจ้งเตือน: ${title}`,
    text: `${title}\n${body}\n\n— SIINA SYSTEM`,
  });
}

module.exports = { isConfigured, setTransport, sendOtp, sendReminder };
