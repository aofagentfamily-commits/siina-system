'use strict';
// Legacy database (bot delete cascaded to groups) must migrate without losing rows,
// and deleting a bot must keep its groups, settings and message history.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'siina-mig-'));
process.env.DATA_DIR = dir;
process.env.APP_SECRET = 'migration-test-secret-0123456789abcdef';

// Build the OLD shape directly: telegram_groups.bot_id NOT NULL with ON DELETE CASCADE.
const legacy = new DatabaseSync(path.join(dir, 'siina.db'));
legacy.exec(`
CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL DEFAULT '', avatar_data TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Bangkok', telegram_user_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_login_at TEXT);
CREATE TABLE telegram_bots (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL,
  username TEXT, token_enc TEXT NOT NULL, token_hint TEXT NOT NULL, mode TEXT NOT NULL DEFAULT 'polling', webhook_secret TEXT NOT NULL,
  update_offset INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'unknown', last_error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE telegram_groups (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bot_id TEXT NOT NULL REFERENCES telegram_bots(id) ON DELETE CASCADE, title TEXT NOT NULL, chat_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'unknown', last_error TEXT, last_tested_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(bot_id, chat_id));
CREATE TABLE telegram_messages (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES telegram_groups(id) ON DELETE CASCADE, message_id INTEGER NOT NULL, sender_id TEXT,
  sender_name TEXT NOT NULL DEFAULT '', sender_username TEXT, text TEXT NOT NULL DEFAULT '', attachments TEXT NOT NULL DEFAULT '[]',
  reply_to_message_id INTEGER, reply_to_sender_id TEXT, reply_to_text TEXT, matched TEXT NOT NULL DEFAULT '[]',
  is_outgoing INTEGER NOT NULL DEFAULT 0, sent_at TEXT NOT NULL, received_at TEXT NOT NULL, read_at TEXT, UNIQUE(group_id, message_id));
INSERT INTO users (id, email, created_at, updated_at) VALUES ('u1', 'owner@example.com', '2026-01-01', '2026-01-01');
INSERT INTO telegram_bots (id, user_id, name, token_enc, token_hint, webhook_secret, created_at, updated_at)
  VALUES ('b1', 'u1', 'น้องซีนี่', 'x.y.z', '••••abcd', 'sec', '2026-01-01', '2026-01-01');
INSERT INTO telegram_groups (id, user_id, bot_id, title, chat_id, created_at, updated_at)
  VALUES ('g1', 'u1', 'b1', 'กลุ่ม A', '-100111', '2026-01-01', '2026-01-01');
INSERT INTO telegram_groups (id, user_id, bot_id, title, chat_id, created_at, updated_at)
  VALUES ('g2', 'u1', 'b1', 'กลุ่ม B', '-100222', '2026-01-01', '2026-01-01');
INSERT INTO telegram_messages (id, user_id, group_id, message_id, text, sent_at, received_at)
  VALUES ('m1', 'u1', 'g1', 1, 'สวัสดี', '2026-01-02', '2026-01-02');
`);
legacy.close();

const { db } = require('../server/db');
const tg = require('../server/telegram');

test('migration keeps every legacy group and message, and makes bot_id nullable', () => {
  const groups = db.prepare('SELECT id, title, chat_id, bot_id FROM telegram_groups ORDER BY id').all();
  assert.equal(groups.length, 2);
  assert.equal(groups[0].bot_id, 'b1');
  assert.equal(groups[0].chat_id, '-100111');
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM telegram_messages').get().c, 1);
  const notnull = db.prepare('PRAGMA table_info(telegram_groups)').all().find((c) => c.name === 'bot_id').notnull;
  assert.equal(notnull, 0);
  const backups = fs.readdirSync(dir).filter((f) => f.startsWith('siina-before-telegram-migration-'));
  assert.equal(backups.length, 1, 'a backup was written before migrating');
});

test('deleting a bot unlinks its groups and keeps groups, titles, chat ids and history', async () => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get('u1');
  const res = await tg.deleteBot(user, 'b1');
  assert.equal(res.unlinkedGroups, 2);
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM telegram_bots').get().c, 0);
  const groups = db.prepare('SELECT id, title, chat_id, bot_id, previous_bot_id, status FROM telegram_groups ORDER BY id').all();
  assert.equal(groups.length, 2, 'no group was deleted');
  assert.equal(groups[0].title, 'กลุ่ม A');
  assert.equal(groups[0].chat_id, '-100111');
  assert.equal(groups[0].bot_id, null);
  assert.equal(groups[0].previous_bot_id, 'b1');
  assert.equal(groups[0].status, 'unlinked');
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM telegram_messages').get().c, 1, 'history kept');
  const logs = tg.listLogs(user, {});
  assert.ok(logs.some((l) => l.event === 'ลบบอท' && l.detail.includes('2 กลุ่ม')));
});

test.after(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
