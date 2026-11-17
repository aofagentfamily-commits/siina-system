'use strict';
// My Desktop: layout is saved per account and comes back after reload, bad input is refused,
// external shortcuts must be http(s), sensitive notes cannot be the quick note, and progress uses real data only.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'siina-desktop-'));
process.env.DATA_DIR = dir;
process.env.APP_SECRET = 'desktop-test-secret-0123456789abcdefghij';

const { db } = require('../server/db');
const desk = require('../server/desktop');
const notes = require('../server/notes');
const u = require('../server/util');

const owner = { id: 'u-desk-owner', email: 'desk-owner@example.com', timezone: 'Asia/Bangkok' };
const other = { id: 'u-desk-other', email: 'desk-other@example.com', timezone: 'Asia/Bangkok' };
const now = u.nowIso();
for (const who of [owner, other]) {
  db.prepare('INSERT INTO users (id, email, display_name, created_at, updated_at) VALUES (?,?,?,?,?)').run(who.id, who.email, who.id, now, now);
}

test('a new account gets the default layout, flagged as default', () => {
  const d = desk.getDesktop(owner);
  assert.equal(d.isDefault, true);
  assert.equal(d.layout.icons.length, 8);
  assert.deepEqual(d.layout.widgets.map((w) => w.kind), ['clock', 'calendar', 'tasks', 'note', 'progress']);
  assert.equal(d.quickNote, null);
});

test('a saved layout comes back exactly after reload', () => {
  const layout = desk.defaultLayout();
  layout.icons[0].slot = 10;                      // move chat to slot 10
  layout.icons[1].slot = 0;                       // projects to slot 0
  layout.icons.push({ id: 'link-1', kind: 'link', name: 'เว็บข่าว', url: 'https://example.com/news', icon: 'globe', slot: 9, hidden: false });
  layout.dock = ['m-home', 'link-1'];
  layout.wallpaper = { type: 'preset', key: 'sakura' };
  layout.widgets = layout.widgets.slice(0, 2);
  desk.saveDesktop(owner, { layout });
  const back = desk.getDesktop(owner);
  assert.equal(back.isDefault, false);
  assert.equal(back.layout.icons.find((i) => i.id === 'm-chat').slot, 10);
  assert.equal(back.layout.icons.find((i) => i.id === 'link-1').url, 'https://example.com/news');
  assert.deepEqual(back.layout.dock, ['m-home', 'link-1']);
  assert.equal(back.layout.wallpaper.key, 'sakura');
  assert.equal(back.layout.widgets.length, 2);
});

test('layouts are private to each account', () => {
  const d = desk.getDesktop(other);
  assert.equal(d.isDefault, true);
});

test('overlapping icons, unknown modules and unknown wallpapers are refused or ignored', () => {
  const base = desk.defaultLayout();
  const overlap = { ...base, icons: [{ id: 'm-chat', kind: 'module', key: 'chat', slot: 1, hidden: false }, { id: 'm-projects', kind: 'module', key: 'projects', slot: 1, hidden: false }] };
  assert.throws(() => desk.sanitizeLayout(overlap), (err) => err.status === 400);

  const unknown = { ...base, icons: [{ id: 'm-x', kind: 'module', key: 'secret-module', slot: 0, hidden: false }] };
  assert.throws(() => desk.sanitizeLayout(unknown), (err) => err.status === 400);

  const wall = desk.sanitizeLayout({ ...base, wallpaper: { type: 'preset', key: '../../etc' } });
  assert.deepEqual(wall.wallpaper, { type: 'preset', key: 'default' });
});

test('external shortcuts only accept http and https links', () => {
  for (const bad of ['javascript:alert(1)', 'data:text/html;base64,PGgxPg==', 'file:///etc/passwd', 'ftp://example.com', 'not a url']) {
    assert.throws(() => desk.httpsUrl(bad), (err) => err.status === 400, bad);
  }
  assert.equal(desk.httpsUrl('https://example.com/a?b=1'), 'https://example.com/a?b=1');
});

test('a custom icon must be an image data URL', () => {
  const base = desk.defaultLayout();
  const icon = (data) => ({ ...base, icons: [...base.icons, { id: 'l-1', kind: 'link', name: 'x', url: 'https://example.com', icon: data, slot: 20, hidden: false }] });
  assert.throws(() => desk.sanitizeLayout(icon('<svg onload=alert(1)>')), (err) => err.status === 400);
  const ok = desk.sanitizeLayout(icon('data:image/png;base64,iVBORw0KGgo='));
  assert.equal(ok.icons.at(-1).icon, 'data:image/png;base64,iVBORw0KGgo=');
});

test('the quick note must be an own, non-sensitive note', () => {
  const plain = notes.createNote(owner, { title: 'โน้ตด่วน', content: 'ซื้อของ' });
  const secret = notes.createNote(owner, { title: 'ลับ', content: 'รหัสห้อง 42', isSensitive: true });
  const d = desk.setQuickNote(owner, plain.id);
  assert.equal(d.quickNote.id, plain.id);
  assert.throws(() => desk.setQuickNote(owner, secret.id), (err) => err.status === 400);
  assert.throws(() => desk.setQuickNote(other, plain.id), (err) => err.status === 404);
  assert.equal(desk.setQuickNote(owner, null).quickNote, null);
});

test('project progress is computed from linked events and is null without data', () => {
  const p1 = 'proj-progress-1';
  const p2 = 'proj-progress-2';
  db.prepare(`INSERT INTO projects (id, user_id, name, category, description, icon, image_data, status, open_url, editor_url, start_date, notes, is_favorite, archived, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(p1, owner.id, 'เว็บไซต์', '', '', 'folder', null, 'in_progress', null, null, null, '', 0, 0, now, now);
  db.prepare(`INSERT INTO projects (id, user_id, name, category, description, icon, image_data, status, open_url, editor_url, start_date, notes, is_favorite, archived, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(p2, owner.id, 'ยังไม่มีงาน', '', '', 'folder', null, 'in_progress', null, null, null, '', 0, 0, now, now);
  const ins = db.prepare(`INSERT INTO calendar_events (id, user_id, title, category, start_date, end_date, start_at, status, project_id, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  ins.run('ev-p1-a', owner.id, 'a', 'todo', '2026-11-17', null, now, 'done', p1, now, now);
  ins.run('ev-p1-b', owner.id, 'b', 'todo', '2026-11-17', null, now, 'pending', p1, now, now);
  const items = desk.projectProgress(owner).items;
  const a = items.find((i) => i.id === p1);
  const b = items.find((i) => i.id === p2);
  assert.equal(a.percent, 50);
  assert.equal(a.total, 2);
  assert.equal(b.percent, null);
});

test('reset returns to the default layout and keeps the quick note', () => {
  const plain = notes.createNote(owner, { title: 'โน้ต 2', content: 'ทดสอบ' });
  desk.setQuickNote(owner, plain.id);
  const d = desk.resetDesktop(owner);
  assert.equal(d.isDefault, true);
  assert.equal(d.quickNote.id, plain.id);
});

test.after(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
