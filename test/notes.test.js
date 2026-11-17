'use strict';
// Personal quick notes: owner-only access, sensitive text encrypted at rest and hidden until revealed,
// search never matches sensitive text, and edits / deletes work.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'siina-notes-'));
process.env.DATA_DIR = dir;
process.env.APP_SECRET = 'notes-test-secret-0123456789abcdefghij';

const { db } = require('../server/db');
const notes = require('../server/notes');
const u = require('../server/util');

const owner = { id: 'u-notes-owner', email: 'owner@example.com' };
const other = { id: 'u-notes-other', email: 'other@example.com' };
const now = u.nowIso();
for (const who of [owner, other]) {
  db.prepare('INSERT INTO users (id, email, display_name, created_at, updated_at) VALUES (?,?,?,?,?)').run(who.id, who.email, who.id, now, now);
}

const SECRET_TEXT = 'ลับมาก-รหัสห้อง-42';

test('a normal note keeps its text and shows in the list with a preview', () => {
  const n = notes.createNote(owner, { title: 'ห้องแชทหลัก', content: 'chat id -1001234567890', isSensitive: false });
  assert.equal(n.content, 'chat id -1001234567890');
  const list = notes.listNotes(owner);
  const item = list.find((x) => x.id === n.id);
  assert.equal(item.preview, 'chat id -1001234567890');
});

test('a sensitive note is encrypted in the database and hidden in the list', () => {
  const n = notes.createNote(owner, { title: 'รหัสห้อง VIP', content: SECRET_TEXT, isSensitive: true });
  const raw = db.prepare('SELECT content FROM notes WHERE id = ?').get(n.id).content;
  assert.ok(!raw.includes(SECRET_TEXT), 'stored text must not be plain');
  const item = notes.listNotes(owner).find((x) => x.id === n.id);
  assert.equal(item.isSensitive, true);
  assert.equal(item.content, null);
  assert.equal(item.preview, null);
  assert.equal(notes.getNote(owner, n.id, false).content, null);
  assert.equal(notes.getNote(owner, n.id, true).content, SECRET_TEXT);
});

test('search matches titles and ordinary text, never sensitive text', () => {
  const normal = notes.createNote(owner, { title: 'ลูกค้า', content: 'ดาวน์โหลดรายงานประจำเดือน', isSensitive: false });
  const hidden = notes.createNote(owner, { title: 'ข้อมูลลับ', content: 'คำค้นพิเศษ-XYZ', isSensitive: true });
  assert.ok(notes.listNotes(owner, { q: 'รายงานประจำเดือน' }).some((x) => x.id === normal.id));
  assert.ok(notes.listNotes(owner, { q: 'ลูกค้า' }).some((x) => x.id === normal.id), 'title search works');
  assert.equal(notes.listNotes(owner, { q: 'คำค้นพิเศษ' }).some((x) => x.id === hidden.id), false, 'sensitive text is not searched');
  assert.ok(notes.listNotes(owner, { q: 'ข้อมูลลับ' }).some((x) => x.id === hidden.id), 'sensitive title is searched');
});

test('another account cannot read, change or delete a note', () => {
  const n = notes.createNote(owner, { title: 'ของเจ้าของ', content: 'ส่วนตัว', isSensitive: false });
  assert.throws(() => notes.getNote(other, n.id), (err) => err.status === 404);
  assert.throws(() => notes.updateNote(other, n.id, { title: 'แก้ไข' }), (err) => err.status === 404);
  assert.throws(() => notes.deleteNote(other, n.id), (err) => err.status === 404);
  assert.equal(notes.listNotes(other).some((x) => x.id === n.id), false);
});

test('editing can switch a note between ordinary and sensitive, and keeps the text', () => {
  const n = notes.createNote(owner, { title: 'สลับประเภท', content: 'ข้อความเดิม', isSensitive: false });
  notes.updateNote(owner, n.id, { isSensitive: true });
  assert.equal(notes.getNote(owner, n.id, true).content, 'ข้อความเดิม');
  assert.ok(!db.prepare('SELECT content FROM notes WHERE id = ?').get(n.id).content.includes('ข้อความเดิม'));
  notes.updateNote(owner, n.id, { isSensitive: false, title: 'ชื่อใหม่' });
  const back = notes.getNote(owner, n.id, true);
  assert.equal(back.content, 'ข้อความเดิม');
  assert.equal(back.title, 'ชื่อใหม่');
});

test('delete removes the note and leaves other notes alone', () => {
  const keep = notes.createNote(owner, { title: 'เก็บไว้', content: '', isSensitive: false });
  const gone = notes.createNote(owner, { title: 'จะลบ', content: '', isSensitive: false });
  notes.deleteNote(owner, gone.id);
  const ids = notes.listNotes(owner).map((x) => x.id);
  assert.equal(ids.includes(gone.id), false);
  assert.equal(ids.includes(keep.id), true);
});

test('a note needs a title', () => {
  assert.throws(() => notes.createNote(owner, { title: '   ', content: 'x' }), (err) => err.status === 400);
});
