'use strict';
// Credentials vault: passwords are encrypted and only returned when asked, owners are separate,
// deleting a category keeps its accounts, and passwords never reach the activity log.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'siina-vault-'));
process.env.DATA_DIR = dir;
process.env.APP_SECRET = 'vault-test-secret-0123456789abcdefghijklmn';

const { db } = require('../server/db');
const vault = require('../server/vault');
const u = require('../server/util');

const owner = { id: 'u-vault', email: 'owner@example.com' };
const other = { id: 'u-vault-other', email: 'other@example.com' };
const now = u.nowIso();
for (const who of [owner, other]) {
  db.prepare('INSERT INTO users (id, email, display_name, created_at, updated_at) VALUES (?,?,?,?,?)').run(who.id, who.email, who.id, now, now);
}
const SECRET = 'correct-horse-battery-9';

test('a password is stored encrypted and only returned when asked', () => {
  const cat = vault.createCategory(owner, { name: 'บัญชีงาน', color: '#FFD1E5' });
  const item = vault.createItem(owner, { title: 'Google Workspace', login: 'siina.team@gmail.com', password: SECRET, categoryId: cat.id });
  assert.equal(item.hasPassword, true);
  assert.equal(item.password, undefined);
  assert.equal(item.categoryId, cat.id, 'the category is kept on create');
  const raw = db.prepare('SELECT secret_enc FROM vault_items WHERE id = ?').get(item.id).secret_enc;
  assert.ok(!raw.includes(SECRET));
  assert.equal(vault.getItem(owner, item.id, true).password, SECRET);
});

test('editing keeps the password unless a new one is sent; an empty one clears it', () => {
  const item = vault.listItems(owner)[0];
  vault.updateItem(owner, item.id, { title: 'Google Workspace (งาน)' });
  assert.equal(vault.getItem(owner, item.id, true).password, SECRET);
  vault.updateItem(owner, item.id, { password: 'new-pass-12345' });
  assert.equal(vault.getItem(owner, item.id, true).password, 'new-pass-12345');
  vault.updateItem(owner, item.id, { password: '' });
  assert.equal(vault.getItem(owner, item.id, false).hasPassword, false);
});

test('another account cannot read, change or delete an entry', () => {
  const item = vault.listItems(owner)[0] || vault.createItem(owner, { title: 'ของเจ้าของ', password: 'x' });
  assert.throws(() => vault.getItem(other, item.id, true), (err) => err.status === 404);
  assert.throws(() => vault.updateItem(other, item.id, { title: 'แก้' }), (err) => err.status === 404);
  assert.throws(() => vault.deleteItem(other, item.id), (err) => err.status === 404);
  assert.equal(vault.listItems(other).length, 0);
});

test('deleting a category keeps its accounts', () => {
  const cat = vault.listCategories(owner)[0];
  vault.deleteCategory(owner, cat.id);
  const left = vault.listItems(owner).find((i) => i.title.startsWith('Google'));
  assert.equal(left.categoryId, null);
  assert.equal(left.hasPassword, false, 'the earlier clear is kept; the entry itself stays');
});

test('the activity log never holds a password', () => {
  const logs = db.prepare("SELECT detail, entity_id FROM activity_logs WHERE entity = 'vault_item'").all();
  assert.ok(logs.length > 0);
  for (const l of logs) assert.ok(!String(l.detail).includes(SECRET) && !String(l.detail).includes('new-pass'));
});

test('a link must be http or https', () => {
  assert.throws(() => vault.createItem(owner, { title: 'เสีย', url: 'javascript:alert(1)' }), (err) => err.status === 400);
});
