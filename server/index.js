'use strict';
// Entry point: static file server, API, and background jobs (reminders + Telegram polling).
const http = require('http');
const fs = require('fs');
const path = require('path');
const { handleApi, errorPayload, sendJson } = require('./api');
const features = require('./features');
const tg = require('./telegram');
const { logError } = require('./util');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

function securityHeaders(res) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (process.env.COOKIE_SECURE === '1' || process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  }
}

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const full = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!full.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  fs.stat(full, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found');
      return;
    }
    const ext = path.extname(full).toLowerCase();
    res.writeHead(200, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'content-length': stat.size,
      'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(full).pipe(res);
  });
}

function createServer() {
  return http.createServer(async (req, res) => {
    securityHeaders(res);
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname === '/health') return sendJson(res, 200, { ok: true });
      if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405).end();
        return;
      }
      return serveStatic(req, res, url.pathname);
    } catch (err) {
      const { status, body } = errorPayload(err);
      if (res.headersSent) return res.end();
      return sendJson(res, status, body);
    }
  });
}

let pollRunning = false;
function startJobs() {
  const reminders = setInterval(() => {
    features.runReminders(new Date()).catch((err) => logError('reminder job: ' + err.message, 'scheduler'));
  }, 30 * 1000);
  const polling = setInterval(() => {
    if (pollRunning) return;
    pollRunning = true;
    tg.pollAll().catch((err) => logError('poll job: ' + err.message, 'scheduler')).finally(() => { pollRunning = false; });
  }, 5 * 1000);
  reminders.unref();
  polling.unref();
  return () => { clearInterval(reminders); clearInterval(polling); };
}

function main() {
  const secret = process.env.APP_SECRET || '';
  if (secret.length < 32) {
    console.error('ต้องตั้งค่า APP_SECRET ในไฟล์ .env อย่างน้อย 32 ตัวอักษร (ดูคู่มือใน README.md)');
    process.exit(1);
  }
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '127.0.0.1';
  createServer().listen(port, host, () => {
    startJobs();
    console.log(`SIINA SYSTEM พร้อมใช้งานที่ http://${host}:${port}`);
  });
}

if (require.main === module) main();

module.exports = { createServer, startJobs };
