'use strict';
// "รับทราบ" buttons: a press is recorded once per person and button, only for the owner's room, and the
// room view shows who acknowledged the message. Telegram is stubbed.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'siina-ack-'));
process.env.DATA_DIR = dir;
process.env.APP_SECRET = 'ack-test-secret-0123456789abcdefghijklmnop';

const realFetch = global.fetch;
global.fetch = async () => ({ ok: true, json: async () => ({ ok: true, result: true }), text: async () => '' });
after(() => { global.fetch = realFetch; });

const { db } = require('../server/db');
const tg = require('../server/telegram');
const u = require('../server/util');
const { encrypt } = require('../server/util');

const owner = { id: 'u-ack', email: 'owner@example.com', timezone: 'Asia/Bangkok' };
const now = u.nowIso();
db.prepare('INSERT INTO users (id, email, display_name, created_at, updated_at) VALUES (?,?,?,?,?)').run(owner.id, owner.email, 'owner', now, now);
db.prepare(`INSERT INTO telegram_bots (id, user_id, name, username, token_enc, token_hint, mode, webhook_secret, status, created_at, updated_at)
  VALUES ('b-ack', ?, 'ไข่ดาว', 'ack_bot', ?, '••••abcd', 'polling', 's', 'connected', ?, ?)`).run(owner.id, encrypt('123456:tokenfortest'), now, now);
db.prepare(`INSERT INTO telegram_groups (id, user_id, bot_id, title, chat_id, enabled, status, created_at, updated_at)
  VALUES ('g-ack', ?, 'b-ack', 'ประกาศ', '-100950', 1, 'ready', ?, ?)`).run(owner.id, now, now);
const bot = db.prepare("SELECT * FROM telegram_bots WHERE id = 'b-ack'").get();

const OUT = '11111111-2222-4333-8444-555555555555';
db.prepare(`INSERT INTO telegram_outbox (id, user_id, group_id, text, client_key, status, created_at, updated_at, buttons, telegram_message_id)
  VALUES (?, ?, 'g-ack', 'ประกาศสำคัญ', 'ack-key-1', 'sent', ?, ?, ?, 900)`)
  .run(OUT, owner.id, now, now, JSON.stringify([{ label: 'รับทราบ', type: 'ack' }, { label: 'เว็บ', type: 'url', url: 'https://example.com' }]));
// the bot's own message as it appears in the room
tg.processUpdate(bot, { update_id: 1, message: { message_id: 900, date: Math.floor(Date.now() / 1000), chat: { id: -100950 }, from: { id: 1, first_name: 'Bot', is_bot: true }, text: 'ประกาศสำคัญ' } });

const press = (fromId, name) => ({ update_id: 2, callback_query: { id: 'cb' + fromId, data: `ack:${OUT}:0`, from: { id: fromId, first_name: name } } });

test('a press is recorded for the person who pressed', () => {
  tg.processUpdate(bot, press(501, 'สมชาย'));
  const rows = db.prepare('SELECT from_name FROM telegram_button_presses WHERE outbox_id = ?').all(OUT);
  assert.deepEqual(rows.map((r) => r.from_name), ['สมชาย']);
});

test('the same person pressing again is not counted twice', () => {
  tg.processUpdate(bot, press(501, 'สมชาย'));
  tg.processUpdate(bot, press(502, 'สมหญิง'));
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM telegram_button_presses WHERE outbox_id = ?').get(OUT).c, 2);
});

test('the room view shows the count and the names on the message', () => {
  const msg = tg.groupMessages(owner, 'g-ack', { limit: '10' }).find((m) => m.messageId === 900);
  assert.ok(msg, 'the sent message is in the room');
  assert.equal(msg.acks.count, 2);
  assert.deepEqual(msg.acks.names, ['สมชาย', 'สมหญิง']);
});

test('a press for a button that is not "รับทราบ", or with a bad token, is ignored', () => {
  tg.processUpdate(bot, { update_id: 3, callback_query: { id: 'x1', data: `ack:${OUT}:1`, from: { id: 503, first_name: 'ไม่ใช่' } } });
  tg.processUpdate(bot, { update_id: 4, callback_query: { id: 'x2', data: 'ack:not-valid', from: { id: 504, first_name: 'แปลก' } } });
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM telegram_button_presses WHERE outbox_id = ?').get(OUT).c, 2);
});
