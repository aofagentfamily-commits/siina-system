'use strict';
// End-to-end tests against a real HTTP server and a temporary SQLite database.
// The SMTP transport is replaced by an in-memory fake, so no real email is sent.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'siina-test-'));
process.env.DATA_DIR = tmp;
process.env.APP_SECRET = 'test-secret-that-is-long-enough-0123456789';
process.env.ALLOWED_EMAILS = 'owner@example.com';
process.env.SMTP_HOST = 'smtp.test.invalid';
process.env.SMTP_FROM = 'SIINA SYSTEM <no-reply@example.com>';

const mailer = require('../server/mailer');
const { createServer } = require('../server/index');
const { db } = require('../server/db');

const sent = [];
mailer.setTransport({ sendMail: async (msg) => { sent.push(msg); return { messageId: 'x' }; } });

let base;
let server;
let cookie = '';

async function api(method, p, body, extraHeaders = {}) {
  const headers = { ...extraHeaders };
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(base + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie && setCookie.startsWith('siina_sid=')) cookie = setCookie.split(';')[0];
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, body: json, headers: res.headers };
}

function codeFromMail() {
  const msg = sent[sent.length - 1];
  return /(\d{6})/.exec(msg.text)[1];
}

before(async () => {
  server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((r) => server.close(r));
  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('unauthenticated API access is rejected', async () => {
  const r = await api('GET', '/api/projects');
  assert.equal(r.status, 401);
});

test('auth: email must be on the allowlist', async () => {
  const r = await api('POST', '/api/auth/check', { email: 'stranger@example.com' });
  assert.equal(r.status, 403);
});

test('auth: malformed email is rejected', async () => {
  const r = await api('POST', '/api/auth/check', { email: 'not-an-email' });
  assert.equal(r.status, 400);
});

test('auth: first visit asks for a one-time password setup', async () => {
  const r = await api('POST', '/api/auth/check', { email: 'Owner@Example.com' });
  assert.equal(r.status, 200);
  assert.equal(r.body.mode, 'setup');
});

test('auth: setup checks length and confirmation', async () => {
  const short = await api('POST', '/api/auth/setup', { email: 'owner@example.com', password: 'short', confirm: 'short' });
  assert.equal(short.status, 400);
  const mismatch = await api('POST', '/api/auth/setup', { email: 'owner@example.com', password: 'long-enough-pass-1', confirm: 'long-enough-pass-2' });
  assert.equal(mismatch.status, 400);
});

test('auth: setup stores the password once and starts a session', async () => {
  const body = { email: 'owner@example.com', password: 'long-enough-pass-1', confirm: 'long-enough-pass-1' };
  const r = await api('POST', '/api/auth/setup', body);
  assert.equal(r.status, 200);
  assert.ok(cookie.startsWith('siina_sid='));
  assert.equal(r.body.user.email, 'owner@example.com');
  // The private area is locked after sign-in until the PIN is set (or entered) on this device.
  const locked = await api('GET', '/api/telegram/groups');
  assert.equal(locked.status, 423);
  const before = await api('GET', '/api/private/status');
  assert.equal(before.body.unlocked, false);
  assert.equal(before.body.hasPin, false);
  const pinSet = await api('POST', '/api/private/pin', { pin: '482915', confirm: '482915' });
  assert.equal(pinSet.status, 200);
  assert.equal(pinSet.body.unlocked, true);
  assert.equal((await api('GET', '/api/telegram/groups')).status, 200);
  const again = await api('POST', '/api/auth/setup', body);
  assert.equal(again.status, 409);
  const check = await api('POST', '/api/auth/check', { email: 'owner@example.com' });
  assert.equal(check.body.mode, 'login');
  // The password itself is never stored in plain text.
  const row = db.prepare('SELECT password_hash FROM users WHERE email = ?').get('owner@example.com');
  assert.ok(row.password_hash.startsWith('scrypt$'));
  assert.ok(!row.password_hash.includes('long-enough-pass-1'));
});

test('auth: wrong password is rejected, correct password signs in', async () => {
  await api('POST', '/api/auth/logout');
  const bad = await api('POST', '/api/auth/login', { email: 'owner@example.com', password: 'wrong-password-xx' });
  assert.equal(bad.status, 401);
  const ok = await api('POST', '/api/auth/login', { email: 'owner@example.com', password: 'long-enough-pass-1' });
  assert.equal(ok.status, 200);
  assert.ok(cookie.startsWith('siina_sid='));
  // A new sign-in opens the private area only after the PIN is entered again.
  assert.equal((await api('GET', '/api/telegram/groups')).status, 423);
  assert.equal((await api('POST', '/api/private/unlock', { pin: '000000' })).status, 403);
  assert.equal((await api('POST', '/api/private/unlock', { pin: '482915' })).status, 200);
});

test('session persists across requests and profile is readable', async () => {
  const r = await api('GET', '/api/me');
  assert.equal(r.status, 200);
  assert.equal(r.body.user.email, 'owner@example.com');
});

test('projects: create, read, update, search, favorite, archive, delete', async () => {
  const created = await api('POST', '/api/projects', {
    name: 'TG Hub', category: 'ระบบภายใน', description: 'ทดสอบ', icon: 'send', status: 'live',
    openUrl: 'https://example.com', editorUrl: '', isFavorite: true,
  });
  assert.equal(created.status, 200);
  const id = created.body.id;
  assert.equal(created.body.isFavorite, true);

  const list = await api('GET', '/api/projects?filter=live');
  assert.ok(list.body.items.some((p) => p.id === id));

  const search = await api('GET', '/api/projects?q=tg%20hub');
  assert.equal(search.body.items.length, 1);

  const upd = await api('PATCH', `/api/projects/${id}`, { status: 'needs_update', name: 'TG Hub v2' });
  assert.equal(upd.body.status, 'needs_update');
  assert.equal(upd.body.name, 'TG Hub v2');

  const bad = await api('POST', '/api/projects', { name: 'x', openUrl: 'javascript:alert(1)' });
  assert.equal(bad.status, 400);

  const arch = await api('PATCH', `/api/projects/${id}`, { archived: true });
  assert.equal(arch.body.archived, true);
  const active = await api('GET', '/api/projects');
  assert.ok(!active.body.items.some((p) => p.id === id));

  const del = await api('DELETE', `/api/projects/${id}`);
  assert.equal(del.status, 200);
  const gone = await api('GET', `/api/projects/${id}`);
  assert.equal(gone.status, 404);
});

test('calendar: create event with symbol, reminder, edit, mark done, delete', async () => {
  const dateTomorrow = new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10);
  const ev = await api('POST', '/api/events', {
    title: 'ส่งมอบระบบ KPI v3', category: 'delivery', symbol: 'rocket', color: '#FF4F9A',
    startDate: dateTomorrow, startTime: '14:00', endTime: '17:00', details: 'ส่งเวอร์ชันสำหรับทดสอบ',
    reminderMinutes: 30,
  });
  assert.equal(ev.status, 200);
  assert.equal(ev.body.symbol, 'rocket');
  assert.ok(ev.body.reminderDueAt, 'reminder due time computed');

  const range = await api('GET', `/api/events?from=${dateTomorrow}&to=${dateTomorrow}`);
  assert.ok(range.body.items.some((e) => e.id === ev.body.id));

  const badColor = await api('POST', '/api/events', { title: 'x', startDate: dateTomorrow, color: 'red' });
  assert.equal(badColor.status, 400);

  const upd = await api('PATCH', `/api/events/${ev.body.id}`, { title: 'ส่งมอบระบบ KPI v3.1' });
  assert.equal(upd.body.title, 'ส่งมอบระบบ KPI v3.1');

  const done = await api('PATCH', `/api/events/${ev.body.id}`, { status: 'done' });
  assert.equal(done.body.status, 'done');
  const doneTab = await api('GET', '/api/events/upcoming?tab=done');
  assert.ok(doneTab.body.items.some((e) => e.id === ev.body.id));

  const del = await api('DELETE', `/api/events/${ev.body.id}`);
  assert.equal(del.status, 200);
});

test('reminders: due reminder becomes a notification exactly once', async () => {
  const { runReminders } = require('../server/features');
  const soon = new Date(Date.now() + 5 * 60000); // starts in 5 minutes (Bangkok wall clock)
  const bkk = { timeZone: 'Asia/Bangkok' };
  const date = new Intl.DateTimeFormat('en-CA', { ...bkk, year: 'numeric', month: '2-digit', day: '2-digit' }).format(soon);
  const time = new Intl.DateTimeFormat('en-GB', { ...bkk, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(soon);
  const ev = await api('POST', '/api/events', {
    title: 'นัดด่วน', category: 'appointment', startDate: date, startTime: time, reminderMinutes: 0,
  });
  assert.equal(ev.status, 200);
  // Not due yet: nothing is created before the start time.
  await runReminders(new Date(Date.now()));
  const early = await api('GET', '/api/notifications');
  assert.equal(early.body.items.filter((n) => n.sourceId === ev.body.id).length, 0);
  // Run the scheduler after the reminder moment, twice: still exactly one notification.
  await runReminders(new Date(Date.now() + 10 * 60000));
  await runReminders(new Date(Date.now() + 20 * 60000));
  const notes = await api('GET', '/api/notifications?unread=1');
  const matching = notes.body.items.filter((n) => n.sourceId === ev.body.id);
  assert.equal(matching.length, 1, 'notification created once');
  const read = await api('POST', `/api/notifications/${matching[0].id}/read`);
  assert.equal(read.status, 200);
  await api('DELETE', `/api/events/${ev.body.id}`);
});

test('summary: state can be set and done items disappear', async () => {
  const dateToday = new Date().toISOString().slice(0, 10);
  const ev = await api('POST', '/api/events', { title: 'ส่งงานด่วน', category: 'todo', startDate: dateToday, startTime: '00:00' });
  const list = await api('GET', '/api/summary?tab=all');
  const item = list.body.items.find((i) => i.sourceId === ev.body.id);
  assert.ok(item, 'overdue/near todo appears in summary');
  await api('POST', '/api/summary/state', { sourceType: 'event', sourceId: ev.body.id, state: 'follow' });
  const follow = await api('GET', '/api/summary?tab=follow');
  assert.ok(follow.body.items.some((i) => i.sourceId === ev.body.id));
  await api('POST', '/api/summary/state', { sourceType: 'event', sourceId: ev.body.id, state: 'done' });
  const after2 = await api('GET', '/api/summary?tab=all');
  assert.ok(!after2.body.items.some((i) => i.sourceId === ev.body.id));
  await api('DELETE', `/api/events/${ev.body.id}`);
});

test('settings persist and dashboard responds', async () => {
  const s = await api('PUT', '/api/settings', { animation: 'reduced', fontScale: 110, defaultReminderMinutes: 10 });
  assert.equal(s.body.settings.animation, 'reduced');
  const again = await api('GET', '/api/settings');
  assert.equal(again.body.settings.fontScale, 110);
  const bad = await api('PUT', '/api/settings', { animation: 'loud' });
  assert.equal(bad.status, 400);
  const dash = await api('GET', '/api/dashboard');
  assert.equal(dash.status, 200);
  assert.ok('projectsTotal' in dash.body);
});

test('telegram: filters validate and dedupe; bot token is never returned in full', async () => {
  const f1 = await api('POST', '/api/telegram/filters', { type: 'keyword', value: 'ด่วน' });
  assert.equal(f1.status, 200);
  const dup = await api('POST', '/api/telegram/filters', { type: 'keyword', value: 'ด่วน' });
  assert.equal(dup.status, 409);
  const mention = await api('POST', '/api/telegram/filters', { type: 'mention', value: '@SiinaUser' });
  assert.equal(mention.body.value, 'siinauser');
  const badMention = await api('POST', '/api/telegram/filters', { type: 'mention', value: 'a b' });
  assert.equal(badMention.status, 400);
  const badToken = await api('POST', '/api/telegram/bots', { name: 'bot', token: 'not-a-token' });
  assert.equal(badToken.status, 400);
});

test('telegram: ingest stores matched messages once and sends are idempotent', async () => {
  // Insert a bot + group directly (the real Telegram API is not reachable from tests).
  const { encrypt } = require('../server/util');
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get('owner@example.com');
  const botId = 'bot-test-1';
  db.prepare(`INSERT INTO telegram_bots (id, user_id, name, username, token_enc, token_hint, mode, webhook_secret, status, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(botId, user.id, 'Test bot', 'siina_bot', encrypt('123456:abcdefghijklmnopqrstuvwxyz'),
    '••••wxyz', 'webhook', 'secret-abc-xyz', 'connected', new Date().toISOString(), new Date().toISOString());
  const grp = await api('POST', '/api/telegram/groups', { botId, title: 'ทีมงาน', chatId: '-1001234567890' });
  assert.equal(grp.status, 200);
  const dupGroup = await api('POST', '/api/telegram/groups', { botId, title: 'ซ้ำ', chatId: '-1001234567890' });
  assert.equal(dupGroup.status, 409);

  const bot = db.prepare('SELECT * FROM telegram_bots WHERE id = ?').get(botId);
  const now = Math.floor(Date.now() / 1000);
  const update = {
    update_id: 1,
    message: {
      message_id: 10, date: now, chat: { id: -1001234567890 },
      from: { id: 555, first_name: 'Ann', username: 'ann' },
      text: 'ช่วย @SiinaUser ตรวจสอบเอกสารด่วน',
      entities: [{ type: 'mention', offset: 5, length: 10 }],
    },
  };
  const { processUpdate } = require('../server/telegram');
  processUpdate(bot, update);
  processUpdate(bot, update); // duplicate delivery must not create a second row
  const msgs = await api('GET', `/api/telegram/groups/${grp.body.id}/messages`);
  assert.equal(msgs.body.items.length, 1);
  assert.ok(msgs.body.items[0].matched.includes('mention'));
  assert.ok(msgs.body.items[0].matched.includes('keyword'));

  const summary = await api('GET', '/api/summary?tab=reply');
  assert.ok(summary.body.items.some((i) => i.sourceType === 'telegram'));

  const chats = await api('GET', '/api/telegram/chats');
  assert.equal(chats.body.items[0].unread, 1);
  await api('POST', `/api/telegram/groups/${grp.body.id}/read`);
  const chats2 = await api('GET', '/api/telegram/chats');
  assert.equal(chats2.body.items[0].unread, 0);

  // Sending with the same client key returns the same outbox row (no duplicate send).
  // Telegram is unreachable in tests, so the send is recorded as failed and can be retried.
  const key = 'client-key-1';
  const first = await api('POST', `/api/telegram/groups/${grp.body.id}/send`, { text: 'รับทราบ' }, { 'x-client-key': key });
  const second = await api('POST', `/api/telegram/groups/${grp.body.id}/send`, { text: 'รับทราบ' }, { 'x-client-key': key });
  assert.equal(first.body.id, second.body.id);
  assert.equal(first.body.status, 'failed');
  assert.ok(!JSON.stringify(first.body).includes('123456:abcdef'), 'token never leaks');

  // Webhook rejects requests without the bot's secret token.
  const noSecret = await api('POST', `/api/telegram/webhook/${botId}`, update);
  assert.equal(noSecret.status, 404);
  const withSecret = await fetch(base + `/api/telegram/webhook/${botId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'secret-abc-xyz' },
    body: JSON.stringify({ ...update, update_id: 2, message: { ...update.message, message_id: 11 } }),
  });
  assert.equal(withSecret.status, 200);
});

test('telegram groups: tags are saved per group and replaced in one call', async () => {
  const created = await api('POST', '/api/telegram/groups', { botId: 'bot-test-1', title: 'กลุ่มแท็ก', chatId: '-1009998887776' });
  assert.equal(created.status, 200);
  const gid = created.body.id;
  const ok = await api('PUT', `/api/telegram/groups/${gid}/tags`, { tags: [
    { name: 'ด่วน', color: '#FFD8B5' }, { name: 'งานบัญชี', color: '#B5E6FF' },
  ] });
  assert.equal(ok.status, 200);
  const list = (await api('GET', '/api/telegram/groups')).body.items.find((g) => g.id === gid);
  assert.deepEqual(list.tags.map((t) => t.name), ['ด่วน', 'งานบัญชี']);
  // the next save replaces the whole list
  await api('PUT', `/api/telegram/groups/${gid}/tags`, { tags: [{ name: 'ใหม่', color: '#FFF4A8' }] });
  const after = (await api('GET', '/api/telegram/groups')).body.items.find((g) => g.id === gid);
  assert.deepEqual(after.tags.map((t) => t.name), ['ใหม่']);
  // validation: duplicate names (any case), unknown colour, too many tags
  const dup = await api('PUT', `/api/telegram/groups/${gid}/tags`, { tags: [{ name: 'A', color: '#AFC8FF' }, { name: 'a', color: '#AFC8FF' }] });
  assert.equal(dup.status, 409);
  const badColor = await api('PUT', `/api/telegram/groups/${gid}/tags`, { tags: [{ name: 'X', color: '#000000' }] });
  assert.equal(badColor.status, 400);
  const many = Array.from({ length: 21 }, (_, i) => ({ name: 'T' + i, color: '#AFC8FF' }));
  const tooMany = await api('PUT', `/api/telegram/groups/${gid}/tags`, { tags: many });
  assert.equal(tooMany.status, 400);
  // tags are not part of the chat id or the group's identity
  const still = (await api('GET', '/api/telegram/groups')).body.items.find((g) => g.id === gid);
  assert.equal(still.chatId, '-1009998887776');
});

test('export excludes bot tokens and logs record activity', async () => {
  const exp = await api('GET', '/api/export');
  assert.equal(exp.status, 200);
  assert.ok(!JSON.stringify(exp.body).includes('token_enc'));
  const logs = await api('GET', '/api/logs');
  assert.ok(logs.body.items.length > 0);
});

test('security headers and static files', async () => {
  const page = await fetch(base + '/');
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /default-src 'self'/);
  const traversal = await fetch(base + '/..%2Fpackage.json');
  assert.notEqual(traversal.status, 200);
});

test('logout revokes the session', async () => {
  const out = await api('POST', '/api/auth/logout');
  assert.equal(out.status, 200);
  const me = await api('GET', '/api/me');
  assert.equal(me.status, 401);
});

test('auth: repeated wrong passwords lock sign-in temporarily', async () => {
  for (let i = 0; i < 5; i++) {
    await api('POST', '/api/auth/login', { email: 'owner@example.com', password: 'wrong-password-xx' });
  }
  const locked = await api('POST', '/api/auth/login', { email: 'owner@example.com', password: 'long-enough-pass-1' });
  assert.equal(locked.status, 429);
});
