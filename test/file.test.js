'use strict';
// Sending an image: it goes to Telegram's sendPhoto with the chosen caption and is recorded as a message.
// Telegram is stubbed.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'siina-file-'));
process.env.DATA_DIR = dir;
process.env.APP_SECRET = 'file-test-secret-0123456789abcdefghijklmnop';

const calls = [];
const realFetch = global.fetch;
global.fetch = async (url) => {
  calls.push(String(url));
  return { ok: true, json: async () => ({ ok: true, result: { message_id: 4321, date: 1 } }) };
};
after(() => { global.fetch = realFetch; });

const { db } = require('../server/db');
const tg = require('../server/telegram');
const u = require('../server/util');
const { encrypt } = require('../server/util');

const owner = { id: 'u-file', email: 'owner@example.com', timezone: 'Asia/Bangkok' };
const now = u.nowIso();
db.prepare('INSERT INTO users (id, email, display_name, created_at, updated_at) VALUES (?,?,?,?,?)').run(owner.id, owner.email, 'owner', now, now);
db.prepare(`INSERT INTO telegram_bots (id, user_id, name, username, token_enc, token_hint, mode, webhook_secret, status, created_at, updated_at)
  VALUES ('b-file', ?, 'ไข่ดาว', 'file_bot', ?, '••••abcd', 'polling', 's', 'connected', ?, ?)`).run(owner.id, encrypt('123456:tokenfortest'), now, now);
db.prepare(`INSERT INTO telegram_groups (id, user_id, bot_id, title, chat_id, enabled, status, created_at, updated_at)
  VALUES ('g-file', ?, 'b-file', 'รูป', '-100960', 1, 'ready', ?, ?)`).run(owner.id, now, now);

// a tiny PNG
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

test('an image is sent with sendPhoto and recorded as a message', async () => {
  const r = await tg.sendFile(owner, 'g-file', { fileName: 'pic.png', mime: 'image/png', dataUrl: PNG, caption: 'สวัสดี' });
  assert.ok(r, 'the send returns a result');
  assert.ok(calls.some((c) => c.includes('/sendPhoto')), 'Telegram sendPhoto was called');
  const row = db.prepare("SELECT message_id, text, is_outgoing FROM telegram_messages WHERE group_id = 'g-file' AND message_id = 4321").get();
  assert.ok(row, 'the sent image is stored in the room');
  assert.equal(row.is_outgoing, 1);
});
