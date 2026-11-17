'use strict';
// Polling status: a good poll always clears the error; a short run of network blips is not shown as an error;
// a wrong token is shown at once. Telegram is stubbed with fetch.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'siina-poll-'));
process.env.DATA_DIR = dir;
process.env.APP_SECRET = 'poll-test-secret-0123456789abcdefghijklm';

const { db } = require('../server/db');
const u = require('../server/util');
const tg = require('../server/telegram');

const realFetch = global.fetch;
after(() => { global.fetch = realFetch; });

const now = u.nowIso();
db.prepare('INSERT INTO users (id, email, display_name, created_at, updated_at) VALUES (?,?,?,?,?)').run('u-poll', 'owner@example.com', 'owner', now, now);
db.prepare(`INSERT INTO telegram_bots (id, user_id, name, username, token_enc, token_hint, mode, webhook_secret, status, update_offset, created_at, updated_at)
  VALUES ('b-poll', 'u-poll', 'ทดสอบ', 'poll_bot', ?, '••••test', 'polling', 's', 'connected', 0, ?, ?)`).run(u.encrypt('123456:test-token-for-polling'), now, now);

let mode = 'ok';
global.fetch = async () => {
  if (mode === 'blip') throw new TypeError('fetch failed');
  if (mode === 'unauthorized') {
    return new Response(JSON.stringify({ ok: false, error_code: 401, description: 'Unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } });
  }
  return new Response(JSON.stringify({ ok: true, result: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
};

const bot = () => db.prepare("SELECT status, last_error FROM telegram_bots WHERE id = 'b-poll'").get();

test('a good poll keeps the bot connected', async () => {
  mode = 'ok';
  await tg.pollAll();
  assert.equal(bot().status, 'connected');
  assert.equal(bot().last_error, null);
});

test('two network blips in a row are not shown as an error', async () => {
  mode = 'blip';
  await tg.pollAll();
  await tg.pollAll();
  assert.equal(bot().status, 'connected');
  assert.equal(bot().last_error, null);
});

test('the third failed poll in a row is shown as an error', async () => {
  await tg.pollAll();
  assert.equal(bot().status, 'error');
  assert.match(bot().last_error, /ไม่สามารถเชื่อมต่อ Telegram ได้/);
});

test('the next good poll clears the error even without new messages', async () => {
  mode = 'ok';
  await tg.pollAll();
  assert.equal(bot().status, 'connected');
  assert.equal(bot().last_error, null);
});

test('a wrong token is shown as an error at once', async () => {
  mode = 'unauthorized';
  await tg.pollAll();
  assert.equal(bot().status, 'error');
});
