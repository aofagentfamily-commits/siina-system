'use strict';
// Chat categories: many-to-many links, "all" = enabled rooms only, deleting a category keeps its rooms.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'siina-cat-'));
process.env.DATA_DIR = dir;
process.env.APP_SECRET = 'cat-test-secret-0123456789abcdefghijklmnop';

const { db } = require('../server/db');
const tg = require('../server/telegram');
const categories = require('../server/categories');
const u = require('../server/util');

const owner = { id: 'u-cat', email: 'owner@example.com' };
const other = { id: 'u-cat-other', email: 'other@example.com' };
const now = u.nowIso();
for (const who of [owner, other]) {
  db.prepare('INSERT INTO users (id, email, display_name, created_at, updated_at) VALUES (?,?,?,?,?)').run(who.id, who.email, who.id, now, now);
}
db.prepare(`INSERT INTO telegram_bots (id, user_id, name, username, token_enc, token_hint, mode, webhook_secret, status, created_at, updated_at)
  VALUES ('b-cat', ?, 'ไข่ดาว', 'cat_bot', 'x.y.z', '••••abcd', 'polling', 's', 'connected', ?, ?)`).run(owner.id, now, now);
for (const [id, chat, enabled] of [['g-a', '-100700', 1], ['g-b', '-100701', 1], ['g-off', '-100702', 0]]) {
  db.prepare(`INSERT INTO telegram_groups (id, user_id, bot_id, title, chat_id, enabled, status, created_at, updated_at)
    VALUES (?, ?, 'b-cat', ?, ?, ?, 'ready', ?, ?)`).run(id, owner.id, 'ห้อง ' + id, chat, enabled, now, now);
}
db.prepare(`INSERT INTO telegram_groups (id, user_id, bot_id, title, chat_id, enabled, status, created_at, updated_at)
  VALUES ('g-other', ?, NULL, 'ของคนอื่น', '-100799', 1, 'unlinked', ?, ?)`).run(other.id, now, now);

const expectStatus = (fn, status) => assert.throws(fn, (err) => err.status === status);

test('a room can be in several categories', () => {
  const sales = categories.createCategory(owner, { name: 'ลูกค้า', icon: 'users', color: '#FF5AA5', groupIds: ['g-a'] });
  const urgent = categories.createCategory(owner, { name: 'งานด่วน', icon: 'zap', color: '#FF7A59', groupIds: ['g-a', 'g-b'] });
  const list = categories.listCategories(owner);
  assert.deepEqual(list.find((c) => c.id === sales.id).groupIds, ['g-a']);
  assert.deepEqual(list.find((c) => c.id === urgent.id).groupIds.sort(), ['g-a', 'g-b']);
});

test('"all" lists enabled rooms, including rooms with no category', () => {
  const ids = tg.chatList(owner, 'all').map((c) => c.id).sort();
  assert.deepEqual(ids, ['g-a', 'g-b']);
});

test('a category lists only its rooms', () => {
  const urgent = categories.listCategories(owner).find((c) => c.name === 'งานด่วน');
  assert.deepEqual(tg.chatList(owner, urgent.id).map((c) => c.id).sort(), ['g-a', 'g-b']);
  const sales = categories.listCategories(owner).find((c) => c.name === 'ลูกค้า');
  assert.deepEqual(tg.chatList(owner, sales.id).map((c) => c.id), ['g-a']);
});

test('editing a category replaces its rooms only', () => {
  const sales = categories.listCategories(owner).find((c) => c.name === 'ลูกค้า');
  categories.updateCategory(owner, sales.id, { name: 'ลูกค้า VIP', groupIds: ['g-b'] });
  const after = categories.listCategories(owner).find((c) => c.id === sales.id);
  assert.equal(after.name, 'ลูกค้า VIP');
  assert.deepEqual(after.groupIds, ['g-b']);
});

test('deleting a category keeps its rooms and their history', () => {
  const urgent = categories.listCategories(owner).find((c) => c.name === 'งานด่วน');
  categories.deleteCategory(owner, urgent.id);
  assert.equal(categories.listCategories(owner).some((c) => c.id === urgent.id), false);
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM telegram_groups WHERE id IN ('g-a','g-b')").get().c, 2);
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM telegram_category_groups WHERE category_id = ?').get(urgent.id).c, 0);
});

test('a category cannot hold another account\'s room or an unknown icon', () => {
  expectStatus(() => categories.createCategory(owner, { name: 'แปลก', icon: 'star', color: '#FF5AA5', groupIds: ['g-other'] }), 400);
  expectStatus(() => categories.createCategory(owner, { name: 'แปลก', icon: 'skull', color: '#FF5AA5' }), 400);
  expectStatus(() => categories.createCategory(owner, { name: 'สี', icon: 'star', color: '#000000' }), 400);
  expectStatus(() => categories.updateCategory(other, categories.listCategories(owner)[0].id, { name: 'ขโมย' }), 404);
});
