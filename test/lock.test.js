'use strict';
// Room lock: a locked group shows no messages, topics or sends until its 6-digit PIN (or the account
// password) opens it. The PIN is stored hashed, wrong tries are limited, changing or turning off the lock
// needs the current PIN, and opening another room re-locks the last one.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'siina-lock-'));
process.env.DATA_DIR = dir;
process.env.APP_SECRET = 'lock-test-secret-0123456789abcdefghijkl';

const { db } = require('../server/db');
const auth = require('../server/auth');
const tg = require('../server/telegram');
const u = require('../server/util');

const user = { id: 'u-lock', email: 'owner@example.com' };
const now = u.nowIso();
db.prepare('INSERT INTO users (id, email, display_name, password_hash, created_at, updated_at) VALUES (?,?,?,?,?,?)')
  .run(user.id, user.email, 'owner', auth.hashPassword('owner-pass-123456'), now, now);
db.prepare(`INSERT INTO telegram_bots (id, user_id, name, username, token_enc, token_hint, mode, webhook_secret, status, created_at, updated_at)
  VALUES ('b-lock', ?, 'ไข่ดาว', 'workegg_bot', 'x.y.z', '••••abcd', 'polling', 's', 'connected', ?, ?)`).run(user.id, now, now);
for (const [id, chat] of [['g-lock', '-100555'], ['g-lock2', '-100556'], ['g-lock3', '-100557'], ['g-lock4', '-100558'], ['g-plain', '-100559']]) {
  db.prepare(`INSERT INTO telegram_groups (id, user_id, bot_id, title, chat_id, enabled, status, created_at, updated_at)
    VALUES (?, ?, 'b-lock', ?, ?, 1, 'ready', ?, ?)`).run(id, user.id, 'ห้อง ' + id, chat, now, now);
}

const expectError = (fn, status, code) => assert.throws(fn, (err) => err.status === status && err.code === code);

test('setting a PIN locks the room and stores only a hash', () => {
  tg.updateGroup(user, 'g-lock', { lockPin: '482915' });
  assert.equal(tg.listGroups(user).find((g) => g.id === 'g-lock').locked, true);
  const stored = db.prepare("SELECT lock_hash FROM telegram_groups WHERE id = 'g-lock'").get().lock_hash;
  assert.ok(stored.startsWith('scrypt$'));
  assert.ok(!stored.includes('482915'));
});

test('a locked room refuses messages and its preview is hidden in the chat list', () => {
  expectError(() => tg.groupMessages(user, 'g-lock', { limit: '10' }), 423, 'LOCKED');
  expectError(() => tg.groupTopics(user, 'g-lock'), 423, 'LOCKED');
  const row = tg.chatList(user).find((c) => c.id === 'g-lock');
  assert.equal(row.locked, true);
  assert.equal(row.unlocked, false);
  assert.equal(row.lastText, '');
});

test('a PIN must be six digits', () => {
  expectError(() => tg.updateGroup(user, 'g-lock2', { lockPin: '12345' }), 400, 'VALIDATION');
  expectError(() => tg.updateGroup(user, 'g-lock2', { lockPin: 'abcdef' }), 400, 'VALIDATION');
});

test('a wrong PIN is refused, the right PIN opens the room', () => {
  expectError(() => tg.unlockGroup(user, 'g-lock', '000000'), 403, 'BAD_PIN');
  tg.unlockGroup(user, 'g-lock', '482915');
  assert.ok(Array.isArray(tg.groupMessages(user, 'g-lock', { limit: '10' })));
  assert.equal(tg.chatList(user).find((c) => c.id === 'g-lock').unlocked, true);
});

test('changing the PIN or turning the lock off needs the current PIN', () => {
  expectError(() => tg.updateGroup(user, 'g-lock', { lockPin: '111222' }), 403, 'NEED_PIN');
  expectError(() => tg.updateGroup(user, 'g-lock', { lockPin: '111222', currentPin: '000000' }), 403, 'BAD_PIN');
  expectError(() => tg.updateGroup(user, 'g-lock', { lockOff: true }), 403, 'NEED_PIN');
  tg.updateGroup(user, 'g-lock', { lockPin: '111222', currentPin: '482915' });
  assert.equal(tg.listGroups(user).find((g) => g.id === 'g-lock').locked, true);
  tg.updateGroup(user, 'g-lock', { lockPin: '482915', currentPin: '111222' });
});

test('five wrong PINs make the room wait before the next try', () => {
  tg.updateGroup(user, 'g-lock2', { lockPin: '246810' });
  for (let i = 0; i < 4; i += 1) expectError(() => tg.unlockGroup(user, 'g-lock2', '111111'), 403, 'BAD_PIN');
  expectError(() => tg.unlockGroup(user, 'g-lock2', '111111'), 429, 'RATE_LIMIT');
  expectError(() => tg.unlockGroup(user, 'g-lock2', '246810'), 429, 'RATE_LIMIT');
});

test('the account password opens a locked room when the PIN is forgotten', () => {
  tg.updateGroup(user, 'g-lock3', { lockPin: '135790' });
  expectError(() => tg.unlockWithPassword(user, 'g-lock3', 'wrong-password-xx'), 403, 'BAD_PASSWORD');
  tg.unlockWithPassword(user, 'g-lock3', 'owner-pass-123456');
  assert.ok(Array.isArray(tg.groupMessages(user, 'g-lock3', { limit: '10' })));
  assert.equal(tg.listGroups(user).find((g) => g.id === 'g-lock3').locked, true);
});

test('opening another room re-locks the room that was open', () => {
  tg.updateGroup(user, 'g-lock4', { lockPin: '314159' });
  tg.unlockGroup(user, 'g-lock4', '314159');
  assert.ok(Array.isArray(tg.groupMessages(user, 'g-lock4', { limit: '10' })));
  assert.ok(Array.isArray(tg.groupMessages(user, 'g-plain', { limit: '10' })));
  expectError(() => tg.groupMessages(user, 'g-lock4', { limit: '10' }), 423, 'LOCKED');
});

test('turning the lock off with the current PIN opens the room without a PIN', () => {
  tg.updateGroup(user, 'g-lock', { lockOff: true, currentPin: '482915' });
  assert.equal(tg.listGroups(user).find((g) => g.id === 'g-lock').locked, false);
  assert.ok(Array.isArray(tg.groupMessages(user, 'g-lock', { limit: '10' })));
});
