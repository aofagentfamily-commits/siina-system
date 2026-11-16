'use strict';
// Live updates: an incoming Telegram message is published to subscribers of that user only.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'siina-realtime-'));
process.env.DATA_DIR = dir;
process.env.APP_SECRET = 'realtime-test-secret-0123456789abcdefgh';

const { db } = require('../server/db');
const tg = require('../server/telegram');
const u = require('../server/util');

const now = u.nowIso();
db.prepare('INSERT INTO users (id, email, display_name, created_at, updated_at) VALUES (?,?,?,?,?)').run('u-rt', 'a@example.com', 'a', now, now);
db.prepare('INSERT INTO users (id, email, display_name, created_at, updated_at) VALUES (?,?,?,?,?)').run('u-other', 'b@example.com', 'b', now, now);
db.prepare(`INSERT INTO telegram_bots (id, user_id, name, username, token_enc, token_hint, mode, webhook_secret, status, created_at, updated_at)
  VALUES ('b-rt', 'u-rt', 'bot', 'rt_bot', 'x.y.z', '••••abcd', 'polling', 's', 'connected', ?, ?)`).run(now, now);
db.prepare(`INSERT INTO telegram_groups (id, user_id, bot_id, title, chat_id, enabled, status, created_at, updated_at)
  VALUES ('g-rt', 'u-rt', 'b-rt', 'ทดสอบ', '-100888', 1, 'ready', ?, ?)`).run(now, now);
const bot = db.prepare("SELECT * FROM telegram_bots WHERE id = 'b-rt'").get();

test('an incoming message is published to its owner only', () => {
  const seenOwner = [];
  const seenOther = [];
  const off1 = tg.subscribe('u-rt', (p) => seenOwner.push(p));
  const off2 = tg.subscribe('u-other', (p) => seenOther.push(p));
  tg.processUpdate(bot, { update_id: 1, message: { message_id: 7, date: Math.floor(Date.now() / 1000), chat: { id: -100888 },
    from: { id: 9, first_name: 'Ann' }, text: 'สวัสดี' } });
  off1();
  off2();
  assert.equal(seenOwner.length, 1);
  assert.equal(seenOwner[0].groupId, 'g-rt');
  assert.equal(seenOwner[0].kind, 'message');
  assert.equal(seenOther.length, 0);
});

test.after(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
