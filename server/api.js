'use strict';
// HTTP router, auth middleware and API route table. No framework: plain node:http.
const { HttpError, logError } = require('./util');
const auth = require('./auth');
const f = require('./features');
const tg = require('./telegram');
const { db } = require('./db');
const u = require('./util');

const MAX_BODY = 1024 * 1024; // 1 MB (avatars and project images are capped separately)
const WRITE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

const ROUTES = [];
function add(method, path, handler, opts = {}) {
  const keys = [];
  const pattern = path.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; });
  ROUTES.push({ method, re: new RegExp(`^${pattern}/?$`), keys, handler, auth: opts.auth !== false });
}

// ---------------------------------------------------------------- auth
add('POST', '/api/auth/otp/request', (c) => auth.requestOtp(c.body.email, c.ip), { auth: false });
add('POST', '/api/auth/otp/verify', (c) => {
  const { token, user } = auth.verifyOtp(c.body.email, c.body.code, c.ip, c.userAgent);
  c.setCookie(auth.sessionCookie(token, 7 * 24 * 60 * 60));
  return { user: f.userDto(user) };
}, { auth: false });
add('POST', '/api/auth/logout', (c) => {
  auth.revokeToken(c.token);
  c.setCookie(auth.sessionCookie('', 0));
  return { ok: true };
}, { auth: false });
add('GET', '/api/auth/me', (c) => ({ user: f.userDto(c.user) }));

// ---------------------------------------------------------------- profile & settings
add('GET', '/api/me', (c) => ({ user: f.userDto(c.user), settings: f.getSettings(c.user.id) }));
add('PATCH', '/api/me', (c) => ({ user: f.updateProfile(c.user, c.body) }));
add('GET', '/api/settings', (c) => ({ settings: f.getSettings(c.user.id) }));
add('PUT', '/api/settings', (c) => ({ settings: f.updateSettings(c.user, c.body) }));
add('GET', '/api/dashboard', (c) => f.dashboard(c.user));

// ---------------------------------------------------------------- projects
add('GET', '/api/projects', (c) => ({ items: f.listProjects(c.user, c.query) }));
add('POST', '/api/projects', (c) => f.createProject(c.user, c.body));
add('GET', '/api/projects/:id', (c) => f.projectDto(f.getProject(c.user, c.params.id)));
add('PATCH', '/api/projects/:id', (c) => f.updateProject(c.user, c.params.id, c.body));
add('DELETE', '/api/projects/:id', (c) => f.deleteProject(c.user, c.params.id));

// ---------------------------------------------------------------- calendar
add('GET', '/api/events', (c) => ({ items: f.listEvents(c.user, c.query) }));
add('GET', '/api/events/upcoming', (c) => ({ items: f.upcomingEvents(c.user, c.query) }));
add('GET', '/api/events/:id', (c) => f.getEventDto(c.user, c.params.id));
add('POST', '/api/events', (c) => f.createEvent(c.user, c.body));
add('PATCH', '/api/events/:id', (c) => f.updateEvent(c.user, c.params.id, c.body));
add('DELETE', '/api/events/:id', (c) => f.deleteEvent(c.user, c.params.id));

// ---------------------------------------------------------------- notifications & summary
add('GET', '/api/notifications', (c) => ({ items: f.listNotifications(c.user, c.query) }));
add('POST', '/api/notifications/read-all', (c) => f.markAllNotificationsRead(c.user));
add('POST', '/api/notifications/:id/read', (c) => f.markNotificationRead(c.user, c.params.id));
add('GET', '/api/summary', (c) => ({ items: f.summaryItems(c.user, c.query.tab) }));
add('POST', '/api/summary/state', (c) => f.setSummaryState(c.user, c.body));

// ---------------------------------------------------------------- telegram
add('GET', '/api/telegram/bots', (c) => ({ items: tg.listBots(c.user) }));
add('POST', '/api/telegram/bots', (c) => tg.createBot(c.user, c.body));
add('PATCH', '/api/telegram/bots/:id', (c) => tg.updateBot(c.user, c.params.id, c.body));
add('DELETE', '/api/telegram/bots/:id', (c) => tg.deleteBot(c.user, c.params.id));
add('POST', '/api/telegram/bots/:id/test', (c) => tg.testBot(c.user, c.params.id));
add('POST', '/api/telegram/bots/:id/webhook', (c) => tg.setWebhookForUser(c.user, c.params.id));
add('GET', '/api/telegram/groups', (c) => ({ items: tg.listGroups(c.user) }));
add('POST', '/api/telegram/groups', (c) => tg.createGroup(c.user, c.body));
add('PATCH', '/api/telegram/groups/:id', (c) => tg.updateGroup(c.user, c.params.id, c.body));
add('DELETE', '/api/telegram/groups/:id', (c) => tg.deleteGroup(c.user, c.params.id));
add('POST', '/api/telegram/groups/:id/test', (c) => tg.testGroup(c.user, c.params.id));
add('GET', '/api/telegram/chats', (c) => ({ items: tg.chatList(c.user) }));
add('GET', '/api/telegram/groups/:id/messages', (c) => ({ items: tg.groupMessages(c.user, c.params.id, c.query) }));
add('POST', '/api/telegram/groups/:id/read', (c) => tg.markGroupRead(c.user, c.params.id));
add('GET', '/api/telegram/groups/:id/outbox', (c) => ({ items: tg.outboxForGroup(c.user, c.params.id) }));
add('POST', '/api/telegram/groups/:id/send', (c) => tg.sendMessage(c.user, c.params.id, c.body, c.headers['x-client-key']));
add('POST', '/api/telegram/outbox/:id/retry', (c) => tg.retryOutbox(c.user, c.params.id));
add('GET', '/api/telegram/filters', (c) => ({ items: tg.listFilters(c.user) }));
add('POST', '/api/telegram/filters', (c) => tg.createFilter(c.user, c.body));
add('PATCH', '/api/telegram/filters/:id', (c) => tg.updateFilter(c.user, c.params.id, c.body));
add('DELETE', '/api/telegram/filters/:id', (c) => tg.deleteFilter(c.user, c.params.id));

// Webhook called by Telegram. Authenticated by the per-bot secret token header, not by session.
add('POST', '/api/telegram/webhook/:botId', (c) => {
  const bot = tg.getWebhookBot(c.params.botId);
  const given = c.headers['x-telegram-bot-api-secret-token'] || '';
  if (!bot || !u.safeEqual(given, bot.webhook_secret)) throw new HttpError(404, 'not found', 'NOT_FOUND');
  tg.processUpdate(bot, c.body);
  return { ok: true };
}, { auth: false });

// ---------------------------------------------------------------- system
add('GET', '/api/export', (c) => {
  c.setHeader('Content-Disposition', `attachment; filename="siina-export-${u.todayIn('UTC')}.json"`);
  return f.exportData(c.user);
});
add('GET', '/api/logs', (c) => ({ items: f.activityLogs(c.user) }));

function compile(method, pathname) {
  for (const r of ROUTES) {
    if (r.method !== method) continue;
    const m = r.re.exec(pathname);
    if (!m) continue;
    const params = {};
    r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
    return { route: r, params };
  }
  return null;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new HttpError(413, 'ข้อมูลที่ส่งมีขนาดใหญ่เกินไป', 'PAYLOAD_TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        resolve(parsed && typeof parsed === 'object' ? parsed : {});
      } catch {
        reject(new HttpError(400, 'รูปแบบข้อมูลไม่ถูกต้อง', 'BAD_JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    ...extraHeaders,
  });
  res.end(body);
}

async function handleApi(req, res, url) {
  const compiled = compile(req.method, url.pathname);
  if (!compiled) {
    const exists = ROUTES.some((r) => r.re.test(url.pathname));
    throw new HttpError(exists ? 405 : 404, 'ไม่พบ API ที่ร้องขอ', 'NOT_FOUND');
  }
  const { route, params } = compiled;
  const hasBody = Boolean(req.headers['transfer-encoding']) || (Number(req.headers['content-length'] || 0) > 0);
  if (WRITE_METHODS.includes(req.method) && hasBody && !String(req.headers['content-type'] || '').includes('application/json')) {
    throw new HttpError(415, 'ต้องส่งข้อมูลในรูปแบบ application/json', 'UNSUPPORTED_MEDIA');
  }
  const body = WRITE_METHODS.includes(req.method) ? await readBody(req) : {};
  const ip = req.socket.remoteAddress || 'unknown';
  const token = auth.readCookie(req, auth.COOKIE_NAME);
  const user = route.auth ? auth.userFromToken(token) : null;
  if (route.auth && !user) throw new HttpError(401, 'กรุณาเข้าสู่ระบบ', 'UNAUTHORIZED');

  const headers = {};
  const setCookies = [];
  const ctx = {
    user, token, params, body, ip, headers: req.headers,
    query: Object.fromEntries(url.searchParams),
    userAgent: req.headers['user-agent'],
    setHeader: (k, v) => { headers[k] = v; },
    setCookie: (c) => setCookies.push(c),
  };
  const result = await route.handler(ctx);
  if (setCookies.length) headers['set-cookie'] = setCookies;
  sendJson(res, 200, result === undefined ? { ok: true } : result, headers);
}

function errorPayload(err) {
  if (err instanceof HttpError) {
    return { status: err.status, body: { error: err.message, code: err.code } };
  }
  if (err && err.code === 'NETWORK') return { status: 502, body: { error: err.message, code: 'NETWORK' } };
  if (err && err.name === 'TelegramError') return { status: 502, body: { error: err.message, code: 'TELEGRAM' } };
  logError(err && err.stack ? err.stack : String(err), 'api');
  return { status: 500, body: { error: 'เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่อีกครั้ง', code: 'INTERNAL' } };
}

module.exports = { handleApi, errorPayload, sendJson, ROUTES, db };
