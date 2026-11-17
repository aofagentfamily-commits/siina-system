'use strict';
// Chat themes: a theme is saved per room and comes back; unknown themes are refused; other accounts see nothing.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'siina-theme-'));
process.env.DATA_DIR = dir;
process.env.APP_SECRET = 'theme-test-secret-0123456789abcdefghijklmn';

const { db } = require('../server/db');
const themes = require('../server/themes');
const u = require('../server/util');

const owner = { id: 'u-theme', email: 'owner@example.com' };
const other = { id: 'u-theme-other', email: 'other@example.com' };
const now = u.nowIso();
for (const who of [owner, other]) {
  db.prepare('INSERT INTO users (id, email, display_name, created_at, updated_at) VALUES (?,?,?,?,?)').run(who.id, who.email, who.id, now, now);
}
db.prepare(`INSERT INTO telegram_groups (id, user_id, title, chat_id, enabled, status, created_at, updated_at)
  VALUES ('g-theme', ?, 'ไข่ดาว & ที่รัก', '-100970', 1, 'unlinked', ?, ?)`).run(owner.id, now, now);

test('the default theme is the couple theme until one is saved', () => {
  const t = themes.getTheme(owner, 'g-theme');
  assert.equal(t.theme, 'couple');
  assert.equal(t.saved, false);
});

test('a saved theme comes back for that room', () => {
  themes.saveTheme(owner, 'g-theme', { theme: 'night', options: { primary: false, textStyle: 'light', mascot: false, animation: false, opacity: 40 } });
  const t = themes.getTheme(owner, 'g-theme');
  assert.equal(t.theme, 'night');
  assert.equal(t.options.opacity, 40);
  assert.equal(t.options.textStyle, 'light');
  assert.equal(t.saved, true);
});

test('an unknown theme is refused and another account cannot see or change the room theme', () => {
  assert.throws(() => themes.saveTheme(owner, 'g-theme', { theme: 'hacker' }), (e) => e.status === 400);
  assert.throws(() => themes.getTheme(other, 'g-theme'), (e) => e.status === 404);
  assert.throws(() => themes.saveTheme(other, 'g-theme', { theme: 'sea' }), (e) => e.status === 404);
});
