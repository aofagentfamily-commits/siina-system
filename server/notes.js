'use strict';
// Personal quick notes. Every note belongs to one account and every call checks ownership here.
// Sensitive notes are encrypted at rest; their text is returned only when asked for with reveal.
// Note text is never written to the activity log.
const { db } = require('./db');
const u = require('./util');

const TITLE_MAX = 120;
const CONTENT_MAX = 5000;

function toDto(row, reveal = false) {
  const sensitive = !!row.is_sensitive;
  let content = null;
  if (!sensitive) content = row.content || '';
  else if (reveal && row.content) content = u.decrypt(row.content);
  return {
    id: row.id,
    title: row.title,
    isSensitive: sensitive,
    content,
    preview: sensitive ? null : (row.content || '').replace(/\s+/g, ' ').trim().slice(0, 80),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function ownRow(user, id) {
  const row = db.prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?').get(String(id), user.id);
  if (!row) throw new u.HttpError(404, 'ไม่พบโน้ตนี้', 'NOT_FOUND');
  return row;
}

// Search matches the title, and the text of ordinary notes only. Sensitive text is never searched.
function listNotes(user, q = {}) {
  const term = String(q.q || '').trim().slice(0, 100);
  if (!term) {
    return db.prepare('SELECT * FROM notes WHERE user_id = ? ORDER BY updated_at DESC').all(user.id).map((r) => toDto(r));
  }
  const like = `%${term.replace(/[\\%_]/g, (c) => '\\' + c)}%`;
  return db.prepare(`SELECT * FROM notes WHERE user_id = ?
      AND (title LIKE ? ESCAPE '\\' OR (is_sensitive = 0 AND content LIKE ? ESCAPE '\\'))
    ORDER BY updated_at DESC`).all(user.id, like, like).map((r) => toDto(r));
}

function getNote(user, id, reveal = false) {
  return toDto(ownRow(user, id), reveal);
}

function createNote(user, body = {}) {
  const title = u.str(body.title, { max: TITLE_MAX, required: true, field: 'ชื่อหัวข้อ' });
  const content = u.str(body.content, { max: CONTENT_MAX, field: 'รายละเอียด' });
  const sensitive = u.bool(body.isSensitive) ? 1 : 0;
  const id = u.uid();
  const now = u.nowIso();
  db.prepare(`INSERT INTO notes (id, user_id, title, content, is_sensitive, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`)
    .run(id, user.id, title, sensitive ? u.encrypt(content) : content, sensitive, now, now);
  u.activity(user.id, 'create', 'note', id, '');
  return toDto(ownRow(user, id), true);
}

function updateNote(user, id, body = {}) {
  const row = ownRow(user, id);
  const current = toDto(row, true);
  const title = body.title != null ? u.str(body.title, { max: TITLE_MAX, required: true, field: 'ชื่อหัวข้อ' }) : row.title;
  const content = body.content != null ? u.str(body.content, { max: CONTENT_MAX, field: 'รายละเอียด' }) : current.content;
  const sensitive = body.isSensitive != null ? (u.bool(body.isSensitive) ? 1 : 0) : row.is_sensitive;
  db.prepare('UPDATE notes SET title = ?, content = ?, is_sensitive = ?, updated_at = ? WHERE id = ? AND user_id = ?')
    .run(title, sensitive ? u.encrypt(content) : content, sensitive, u.nowIso(), row.id, user.id);
  u.activity(user.id, 'update', 'note', row.id, '');
  return toDto(ownRow(user, id), true);
}

function deleteNote(user, id) {
  const row = ownRow(user, id);
  db.prepare('DELETE FROM notes WHERE id = ? AND user_id = ?').run(row.id, user.id);
  u.activity(user.id, 'delete', 'note', row.id, '');
  return { ok: true };
}

module.exports = { listNotes, getNote, createNote, updateNote, deleteNote };
