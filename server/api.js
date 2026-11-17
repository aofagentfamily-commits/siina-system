'use strict';
// HTTP router, auth middleware and API route table. No framework: plain node:http.
const fs = require('fs');
const { HttpError, logError } = require('./util');
const auth = require('./auth');
const f = require('./features');
const tg = require('./telegram');
const notes = require('./notes');
const privacy = require('./privacy');
const vault = require('./vault');
const live = require('./live');
const themes = require('./themes');
const categories = require('./categories');
const tpl = require('./templates');
const { db } = require('./db');
const u = require('./util');

const MAX_BODY = 1024 * 1024; // 1 MB (avatars and project images are capped separately)
const MAX_UPLOAD_BODY = 72 * 1024 * 1024; // file uploads arrive as base64 (50 MB file)
const WRITE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

const ROUTES = [];
function add(method, path, handler, opts = {}) {
  const keys = [];
  const pattern = path.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; });
  // Routes that need the account to be signed in are private by default: they also need the private area unlocked.
  ROUTES.push({ method, re: new RegExp(`^${pattern}/?$`), keys, handler, auth: opts.auth !== false, private: opts.private !== false });
}

// ---------------------------------------------------------------- auth
add('POST', '/api/auth/check', (c) => auth.checkEmail(c.body.email, c.ip), { auth: false });
add('POST', '/api/auth/setup', (c) => {
  const { token, user } = auth.setupPassword(c.body.email, c.body.password, c.body.confirm, c.ip, c.userAgent);
  c.setCookie(auth.sessionCookie(token, 7 * 24 * 60 * 60));
  return { user: f.userDto(user) };
}, { auth: false });
add('POST', '/api/auth/login', (c) => {
  const { token, user } = auth.login(c.body.email, c.body.password, c.ip, c.userAgent);
  c.setCookie(auth.sessionCookie(token, 7 * 24 * 60 * 60));
  return { user: f.userDto(user) };
}, { auth: false });
add('POST', '/api/auth/logout', (c) => {
  auth.revokeToken(c.token);
  c.setCookie(auth.sessionCookie('', 0));
  return { ok: true };
}, { auth: false });
add('GET', '/api/auth/me', (c) => ({ user: f.userDto(c.user) }), { private: false });

// ---------------------------------------------------------------- profile & settings
add('GET', '/api/me', (c) => ({ user: f.userDto(c.user), settings: f.getSettings(c.user.id) }), { private: false });
add('GET', '/api/private/status', (c) => privacy.status(c.user, c.token), { private: false });
add('POST', '/api/private/pin', (c) => privacy.setPin(c.user, c.token, c.body), { private: false });
add('POST', '/api/private/unlock', (c) => privacy.unlock(c.user, c.token, c.body.pin), { private: false });
add('POST', '/api/private/lock', (c) => privacy.lock(c.token), { private: false });
add('POST', '/api/private/enabled', (c) => privacy.setEnabled(c.user, c.token, c.body), { private: false });
add('POST', '/api/private/session', (c) => privacy.setSessionMinutes(c.user, c.token, c.body));
add('POST', '/api/private/logout-others', (c) => privacy.logoutOthers(c.user, c.token));
add('PATCH', '/api/me', (c) => ({ user: f.updateProfile(c.user, c.body) }));
add('GET', '/api/settings', (c) => ({ settings: f.getSettings(c.user.id) }));
add('PUT', '/api/settings', (c) => ({ settings: f.updateSettings(c.user, c.body) }));
add('GET', '/api/dashboard', (c) => f.dashboard(c.user));
add('GET', '/api/dashboard/prefs', (c) => live.prefs(c.user));
add('PUT', '/api/dashboard/prefs', (c) => live.setPrefs(c.user, c.body));
add('GET', '/api/dashboard/weather', (c) => live.weather(c.user));
add('GET', '/api/dashboard/places', (c) => live.placeSearch(c.query.q));
add('GET', '/api/dashboard/news', (c) => live.news(c.user));
add('GET', '/api/dashboard/gold', (c) => live.goldLatest(c.user));
add('POST', '/api/dashboard/gold', (c) => live.goldAdd(c.user, c.body));
add('POST', '/api/dashboard/tasks/:id/done', (c) => live.setTaskDone(c.user, c.params.id, c.body.done !== false));

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
add('GET', '/api/notes', (c) => ({ items: notes.listNotes(c.user, c.query) }));
add('POST', '/api/notes', (c) => notes.createNote(c.user, c.body));
add('GET', '/api/notes/:id', (c) => notes.getNote(c.user, c.params.id, c.query.reveal === '1'));
add('PATCH', '/api/notes/:id', (c) => notes.updateNote(c.user, c.params.id, c.body));
add('DELETE', '/api/notes/:id', (c) => notes.deleteNote(c.user, c.params.id));
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
add('GET', '/api/telegram/mentions', (c) => ({ items: tg.mentionList(c.user) }));
add('GET', '/api/telegram/templates', (c) => ({ items: tpl.listTemplates(c.user, c.query) }));
add('POST', '/api/telegram/templates', (c) => tpl.createTemplate(c.user, c.body));
add('PATCH', '/api/telegram/templates/:id', (c) => tpl.updateTemplate(c.user, c.params.id, c.body));
add('DELETE', '/api/telegram/templates/:id', (c) => tpl.deleteTemplate(c.user, c.params.id));
add('GET', '/api/telegram/stickers', (c) => ({ items: tpl.listStickers(c.user) }));
add('POST', '/api/telegram/stickers', (c) => tpl.addSticker(c.user, c.body));
add('DELETE', '/api/telegram/stickers/:id', (c) => tpl.deleteSticker(c.user, c.params.id));
add('POST', '/api/telegram/groups/:id/send-file', (c) => tg.sendFile(c.user, c.params.id, c.body));
add('POST', '/api/telegram/groups/:id/send-sticker', (c) => tg.sendSticker(c.user, c.params.id, c.body));
add('POST', '/api/telegram/messages/:id/ack', (c) => tg.ackMessage(c.user, c.params.id, c.body.acked !== false && c.body.acked !== 'false'));
add('POST', '/api/telegram/groups/:id/unlock', (c) => tg.unlockGroup(c.user, c.params.id, c.body.pin));
add('POST', '/api/telegram/groups/:id/unlock-password', (c) => tg.unlockWithPassword(c.user, c.params.id, c.body.password));
add('POST', '/api/telegram/groups/:id/clear-history', (c) => tg.clearHistory(c.user, c.params.id, c.body.threadId));
add('GET', '/api/vault', (c) => ({ items: vault.listItems(c.user, c.query), categories: vault.listCategories(c.user), colors: vault.COLORS }));
add('POST', '/api/vault', (c) => vault.createItem(c.user, c.body));
add('GET', '/api/vault/:id', (c) => vault.getItem(c.user, c.params.id, c.query.reveal === '1'));
add('PATCH', '/api/vault/:id', (c) => vault.updateItem(c.user, c.params.id, c.body));
add('DELETE', '/api/vault/:id', (c) => vault.deleteItem(c.user, c.params.id));
add('POST', '/api/vault/categories', (c) => vault.createCategory(c.user, c.body));
add('PATCH', '/api/vault/categories/:id', (c) => vault.updateCategory(c.user, c.params.id, c.body));
add('DELETE', '/api/vault/categories/:id', (c) => vault.deleteCategory(c.user, c.params.id));
add('GET', '/api/telegram/groups/:id/theme', (c) => themes.getTheme(c.user, c.params.id));
add('PUT', '/api/telegram/groups/:id/theme', (c) => themes.saveTheme(c.user, c.params.id, c.body));
add('PUT', '/api/telegram/groups/:id/tags', (c) => tg.setGroupTags(c.user, c.params.id, c.body.tags));
add('GET', '/api/telegram/overview', (c) => tg.overview(c.user));
add('GET', '/api/telegram/logs', (c) => ({ items: tg.listLogs(c.user, c.query) }));
add('POST', '/api/telegram/autoreply/check', (c) => tg.autoReplyCheck(c.user, c.body.groupId));
add('GET', '/api/telegram/media/:rowId/:index', async (c) => {
  const file = await tg.mediaFile(c.user, c.params.rowId, Number(c.params.index));
  return { __file: file.path, mime: file.mime };
});
add('GET', '/api/telegram/chats', (c) => ({ items: tg.chatList(c.user, c.query.category) }));
add('GET', '/api/telegram/categories', (c) => ({ items: categories.listCategories(c.user), icons: categories.ICONS, colors: categories.COLORS }));
add('POST', '/api/telegram/categories', (c) => categories.createCategory(c.user, c.body));
add('PATCH', '/api/telegram/categories/:id', (c) => categories.updateCategory(c.user, c.params.id, c.body));
add('DELETE', '/api/telegram/categories/:id', (c) => categories.deleteCategory(c.user, c.params.id));
add('GET', '/api/telegram/groups/:id/messages', (c) => ({ items: tg.groupMessages(c.user, c.params.id, c.query) }));
add('POST', '/api/telegram/groups/:id/read', (c) => tg.markGroupRead(c.user, c.params.id));
add('GET', '/api/telegram/groups/:id/topics', (c) => ({ items: tg.groupTopics(c.user, c.params.id) }));
add('POST', '/api/telegram/groups/:id/topics', (c) => tg.createTopic(c.user, c.params.id, c.body.name, c.body.color));
add('PUT', '/api/telegram/groups/:id/topics/:threadId/color', (c) => tg.setTopicColor(c.user, c.params.id, c.params.threadId, c.body.color));
add('PATCH', '/api/telegram/groups/:id/topics/:threadId', (c) => tg.renameTopic(c.user, c.params.id, c.params.threadId, c.body.name));
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

// Live stream (Server-Sent Events) for Telegram updates. Uses the same session cookie as the API.
function openStream(req, res, user) {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  res.write('event: ready\ndata: {}\n\n');
  const unsubscribe = tg.subscribe(user.id, (payload) => {
    res.write(`event: update\ndata: ${JSON.stringify(payload)}\n\n`);
  });
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
}

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

function readBody(req, limit = MAX_BODY) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
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
  if (req.method === 'GET' && url.pathname === '/api/telegram/stream') {
    const user = auth.userFromToken(auth.readCookie(req, auth.COOKIE_NAME));
    if (!user) throw new HttpError(401, 'กรุณาเข้าสู่ระบบ', 'UNAUTHORIZED');
    if (!privacy.isUnlocked(user, auth.readCookie(req, auth.COOKIE_NAME))) throw new HttpError(423, 'กรุณายืนยันรหัสส่วนตัวก่อนเข้าพื้นที่นี้', 'PRIVATE_LOCKED');
    return openStream(req, res, user);
  }
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
  const body = WRITE_METHODS.includes(req.method) ? await readBody(req, url.pathname.endsWith('/send-file') ? MAX_UPLOAD_BODY : MAX_BODY) : {};
  const ip = req.socket.remoteAddress || 'unknown';
  const token = auth.readCookie(req, auth.COOKIE_NAME);
  const user = route.auth ? auth.userFromToken(token) : null;
  if (route.auth && !user) throw new HttpError(401, 'กรุณาเข้าสู่ระบบ', 'UNAUTHORIZED');
  if (route.auth && route.private && !privacy.isUnlocked(user, token)) {
    throw new HttpError(423, 'กรุณายืนยันรหัสส่วนตัวก่อนเข้าพื้นที่นี้', 'PRIVATE_LOCKED');
  }

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
  if (result && result.__file) {
    res.writeHead(200, {
      'content-type': result.mime,
      'cache-control': 'private, max-age=3600',
      'x-content-type-options': 'nosniff',
      ...headers,
    });
    fs.createReadStream(result.__file).pipe(res);
    return;
  }
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
