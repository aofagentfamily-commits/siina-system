'use strict';
// Forum topics: messages keep their topic (thread) id, topic names come from Telegram,
// topic-created notices are not stored as conversation, and sends remember the chosen topic.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'siina-topics-'));
process.env.DATA_DIR = dir;
process.env.APP_SECRET = 'topics-test-secret-0123456789abcdefgh';

const { db } = require('../server/db');
const tg = require('../server/telegram');
const u = require('../server/util');

const user = { id: 'u-topics', email: 'owner@example.com', timezone: 'Asia/Bangkok', telegram_user_id: null };
const now = u.nowIso();
db.prepare('INSERT INTO users (id, email, display_name, created_at, updated_at) VALUES (?,?,?,?,?)').run(user.id, user.email, 'owner', now, now);
db.prepare(`INSERT INTO telegram_bots (id, user_id, name, username, token_enc, token_hint, mode, webhook_secret, status, created_at, updated_at)
  VALUES ('b-topics', ?, 'ไข่ดาว', 'workegg_bot', 'x.y.z', '••••abcd', 'polling', 's', 'connected', ?, ?)`).run(user.id, now, now);
db.prepare(`INSERT INTO telegram_groups (id, user_id, bot_id, title, chat_id, enabled, status, created_at, updated_at)
  VALUES ('g-topics', ?, 'b-topics', 'งานฟอรัม', '-100777', 1, 'ready', ?, ?)`).run(user.id, now, now);
const bot = db.prepare("SELECT * FROM telegram_bots WHERE id = 'b-topics'").get();

const base = Math.floor(Date.now() / 1000);
const msg = (id, extra) => ({ update_id: id, message: { message_id: id, date: base + id, chat: { id: -100777 },
  from: { id: 42, first_name: 'Mim' }, ...extra } });

test('topic created notice names the topic and is not stored as a message', () => {
  tg.processUpdate(bot, msg(1, { message_thread_id: 5, forum_topic_created: { name: 'HR999' } }));
  const topics = tg.groupTopics(user, 'g-topics');
  assert.deepEqual(topics, [{ threadId: 5, name: 'HR999' }]);
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM telegram_messages WHERE group_id = ?').get('g-topics').c, 0);
  assert.equal(db.prepare("SELECT is_forum FROM telegram_groups WHERE id = 'g-topics'").get().is_forum, 1);
});

test('messages keep their topic id and unknown topics get a fallback name', () => {
  tg.processUpdate(bot, msg(2, { message_thread_id: 5, text: 'ในหัวข้อ HR999' }));
  tg.processUpdate(bot, msg(3, { message_thread_id: 9, text: 'หัวข้อที่ไม่รู้ชื่อ' }));
  tg.processUpdate(bot, msg(4, { text: 'ข้อความทั่วไป' }));
  const rows = tg.groupMessages(user, 'g-topics', { limit: '10' });
  assert.equal(rows.find((m) => m.messageId === 2).threadId, 5);
  assert.equal(rows.find((m) => m.messageId === 3).threadId, 9);
  assert.equal(rows.find((m) => m.messageId === 4).threadId, null);
  const names = tg.groupTopics(user, 'g-topics').map((t) => t.name);
  assert.ok(names.includes('HR999') && names.includes('หัวข้อ #9'));
});

test('a rename updates the topic name', () => {
  tg.processUpdate(bot, msg(5, { message_thread_id: 5, forum_topic_edited: { name: 'HR1000' } }));
  assert.equal(tg.groupTopics(user, 'g-topics').find((t) => t.threadId === 5).name, 'HR1000');
});

test('sending to a topic stores the chosen topic on the outbox row', async () => {
  const sent = await tg.sendMessage(user, 'g-topics', { text: 'ทดสอบ', threadId: 5 }, 'topic-key-1');
  assert.equal(sent.status, 'failed', 'no real Telegram in tests, so the send fails and is recorded');
  const row = db.prepare("SELECT thread_id FROM telegram_outbox WHERE client_key = 'topic-key-1'").get();
  assert.equal(row.thread_id, 5);
});

test.after(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
