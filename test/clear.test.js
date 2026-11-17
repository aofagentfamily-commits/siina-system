'use strict';
// Clear history: removes the stored messages of one room or one topic from SIINA SYSTEM only.
// Re-delivered old messages are not stored again, new messages are stored, and other rooms are untouched.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'siina-clear-'));
process.env.DATA_DIR = dir;
process.env.APP_SECRET = 'clear-test-secret-0123456789abcdefghijklmn';

const { db } = require('../server/db');
const tg = require('../server/telegram');
const u = require('../server/util');

const owner = { id: 'u-clear', email: 'owner@example.com', timezone: 'Asia/Bangkok' };
const other = { id: 'u-clear-other', email: 'other@example.com', timezone: 'Asia/Bangkok' };
const now = u.nowIso();
for (const who of [owner, other]) {
  db.prepare('INSERT INTO users (id, email, display_name, created_at, updated_at) VALUES (?,?,?,?,?)').run(who.id, who.email, who.id, now, now);
}
db.prepare(`INSERT INTO telegram_bots (id, user_id, name, username, token_enc, token_hint, mode, webhook_secret, status, created_at, updated_at)
  VALUES ('b-clear', ?, 'ไข่ดาว', 'clear_bot', 'x.y.z', '••••abcd', 'polling', 's', 'connected', ?, ?)`).run(owner.id, now, now);
for (const [id, chat] of [['g-clear', '-100900'], ['g-other', '-100901']]) {
  db.prepare(`INSERT INTO telegram_groups (id, user_id, bot_id, title, chat_id, enabled, status, created_at, updated_at)
    VALUES (?, ?, 'b-clear', ?, ?, 1, 'ready', ?, ?)`).run(id, owner.id, 'ห้อง ' + id, chat, now, now);
}
const bot = db.prepare("SELECT * FROM telegram_bots WHERE id = 'b-clear'").get();
const base = Math.floor(Date.now() / 1000);
const msg = (chat, id, text, thread) => ({ update_id: id, message: { message_id: id, date: base + id, chat: { id: chat },
  from: { id: 42, first_name: 'Mim' }, text, ...(thread ? { message_thread_id: thread } : {}) } });

test('clearing a room removes its stored messages and keeps the room and other rooms', () => {
  tg.processUpdate(bot, msg(-100900, 1, 'หนึ่ง'));
  tg.processUpdate(bot, msg(-100900, 2, 'สอง'));
  tg.processUpdate(bot, msg(-100901, 3, 'ห้องอื่น'));
  const result = tg.clearHistory(owner, 'g-clear', null);
  assert.equal(result.deleted, 2);
  assert.deepEqual(tg.groupMessages(owner, 'g-clear', { limit: '10' }), []);
  assert.equal(tg.groupMessages(owner, 'g-other', { limit: '10' }).length, 1);
  assert.equal(tg.listGroups(owner).some((g) => g.id === 'g-clear' && g.chatId === '-100900'), true);
});

test('a cleared message is not stored again when Telegram delivers it later', () => {
  tg.processUpdate(bot, msg(-100900, 2, 'สอง ส่งซ้ำ'));
  assert.deepEqual(tg.groupMessages(owner, 'g-clear', { limit: '10' }), []);
});

test('new messages after the clear are stored as usual', () => {
  tg.processUpdate(bot, msg(-100900, 4, 'ข้อความใหม่'));
  const rows = tg.groupMessages(owner, 'g-clear', { limit: '10' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].text, 'ข้อความใหม่');
});

test('clearing one topic keeps the other topics', () => {
  tg.processUpdate(bot, msg(-100901, 20, 'หัวข้อ 5 ข้อความ', 5));
  tg.processUpdate(bot, msg(-100901, 21, 'หัวข้อ 9 ข้อความ', 9));
  tg.clearHistory(owner, 'g-other', 5);
  const left = tg.groupMessages(owner, 'g-other', { limit: '10' }).map((m) => m.text);
  assert.ok(left.includes('หัวข้อ 9 ข้อความ'));
  assert.ok(!left.includes('หัวข้อ 5 ข้อความ'));
  tg.processUpdate(bot, msg(-100901, 20, 'หัวข้อ 5 ส่งซ้ำ', 5));
  assert.ok(!tg.groupMessages(owner, 'g-other', { limit: '10' }).some((m) => m.text === 'หัวข้อ 5 ส่งซ้ำ'));
  tg.processUpdate(bot, msg(-100901, 22, 'หัวข้อ 5 ใหม่', 5));
  assert.ok(tg.groupMessages(owner, 'g-other', { limit: '10' }).some((m) => m.text === 'หัวข้อ 5 ใหม่'));
});

test('another account cannot clear a room it does not own', () => {
  assert.throws(() => tg.clearHistory(other, 'g-other', null), (err) => err.status === 404);
});
