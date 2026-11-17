'use strict';
// Credentials vault (ข้อมูลการเข้าสู่ระบบ): accounts, links and passwords in one private place.
// Passwords are encrypted at rest and returned only when explicitly asked (reveal). Passwords are never
// written to the activity log. Every call is scoped to the signed-in account.
const { db } = require('./db');
const u = require('./util');

const MAX_ITEMS = 1000;
const MAX_CATEGORIES = 20;
const AVATAR_MAX = 300 * 1024; // characters of the picture data URL (about 220 KB)
function avatarClean(value) {
  if (value === null || value === '') return null;
  const s = String(value);
  if (!/^data:image\/(png|jpeg|webp);base64,/.test(s)) throw new u.HttpError(400, 'รูปต้องเป็น PNG, JPG หรือ WebP', 'VALIDATION');
  if (s.length > AVATAR_MAX) throw new u.HttpError(400, 'รูปใหญ่เกินไป กรุณาเลือกรูปที่เล็กลง', 'TOO_LARGE');
  return s;
}
const COLORS = ['#FFD1E5', '#E4D4FF', '#C5EBD3', '#FFF0AD', '#B5E6FF', '#FFD5B5', '#FFC5DE', '#D8DEFF'];

function catRow(user, id) {
  return db.prepare('SELECT * FROM vault_categories WHERE id = ? AND user_id = ?').get(String(id), user.id);
}
function itemRow(user, id) {
  const row = db.prepare('SELECT * FROM vault_items WHERE id = ? AND user_id = ?').get(String(id), user.id);
  if (!row) throw new u.HttpError(404, 'ไม่พบรายการนี้', 'NOT_FOUND');
  return row;
}

function categoryDto(c) {
  return { id: c.id, name: c.name, color: c.color };
}
function itemDto(r, reveal = false) {
  return {
    id: r.id,
    title: r.title,
    login: r.login || '',
    url: r.url || '',
    note: r.note || '',
    categoryId: r.category_id || null,
    avatarData: r.avatar_data || null,
    starred: !!r.starred,
    hasPassword: !!r.secret_enc,
    password: reveal && r.secret_enc ? u.decrypt(r.secret_enc) : undefined,
    updatedAt: r.updated_at,
    createdAt: r.created_at,
  };
}

function listCategories(user) {
  return db.prepare('SELECT * FROM vault_categories WHERE user_id = ? ORDER BY sort_order, created_at').all(user.id).map(categoryDto);
}

function listItems(user, q = {}) {
  const term = String(q.q || '').trim().slice(0, 100);
  const cat = q.category && q.category !== 'all' ? String(q.category) : null;
  const like = term ? `%${term.replace(/[\\%_]/g, (c) => '\\' + c)}%` : null;
  const rows = db.prepare(`SELECT * FROM vault_items WHERE user_id = ?
      AND (? IS NULL OR category_id = ?)
      AND (? IS NULL OR title LIKE ? ESCAPE '\\' OR login LIKE ? ESCAPE '\\' OR url LIKE ? ESCAPE '\\')
      ORDER BY starred DESC, title COLLATE NOCASE LIMIT ?`)
    .all(user.id, cat, cat, like, like, like, like, MAX_ITEMS);
  return rows.map((r) => itemDto(r));
}

function getItem(user, id, reveal = false) {
  return itemDto(itemRow(user, id), reveal);
}

function checkItem(body, existing = null) {
  const title = u.str(body.title != null ? body.title : (existing && existing.title), { max: 120, required: true, field: 'ชื่อรายการ' });
  const login = u.str(body.login != null ? body.login : (existing && existing.login), { max: 200, field: 'อีเมล / ชื่อผู้ใช้' });
  const url = body.url != null ? u.httpUrlOpt(body.url, 'ลิงก์') : (existing ? existing.url : null);
  const note = u.str(body.note != null ? body.note : (existing && existing.note), { max: 2000, field: 'หมายเหตุ' });
  const categoryId = body.categoryId != null ? (body.categoryId || null) : (existing ? existing.category_id : null);
  return { title, login, url, note, categoryId };
}

function createItem(user, body = {}) {
  const count = db.prepare('SELECT COUNT(*) AS c FROM vault_items WHERE user_id = ?').get(user.id).c;
  if (count >= MAX_ITEMS) throw new u.HttpError(400, `เก็บได้มากที่สุด ${MAX_ITEMS} รายการ`, 'LIMIT');
  const f = checkItem(body);
  if (f.categoryId && !catRow(user, f.categoryId)) throw new u.HttpError(400, 'ไม่พบหมวดนี้', 'VALIDATION');
  const password = u.str(body.password, { max: 500, field: 'รหัสผ่าน' });
  const id = u.uid();
  const now = u.nowIso();
  db.prepare(`INSERT INTO vault_items (id, user_id, category_id, title, login, url, note, secret_enc, starred, avatar_data, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, user.id, f.categoryId, f.title, f.login, f.url, f.note,
    password ? u.encrypt(password) : null, u.bool(body.starred) ? 1 : 0, avatarClean(body.avatarData || null), now, now);
  u.activity(user.id, 'create', 'vault_item', id, '');
  return getItem(user, id, false);
}

function updateItem(user, id, body = {}) {
  const row = itemRow(user, id);
  const f = checkItem(body, row);
  if (f.categoryId && !catRow(user, f.categoryId)) throw new u.HttpError(400, 'ไม่พบหมวดนี้', 'VALIDATION');
  let secret = row.secret_enc;
  if (body.password != null) {
    const pw = u.str(body.password, { max: 500, field: 'รหัสผ่าน' });
    secret = pw ? u.encrypt(pw) : null; // an empty field clears the password; leaving it out keeps it
  }
  const starred = body.starred != null ? (u.bool(body.starred) ? 1 : 0) : row.starred;
  // the picture: leaving it out keeps it; null removes it
  const avatar = body.avatarData !== undefined ? avatarClean(body.avatarData) : row.avatar_data;
  db.prepare(`UPDATE vault_items SET category_id = ?, title = ?, login = ?, url = ?, note = ?, secret_enc = ?, starred = ?, avatar_data = ?, updated_at = ?
    WHERE id = ? AND user_id = ?`).run(f.categoryId, f.title, f.login, f.url, f.note, secret, starred, avatar, u.nowIso(), row.id, user.id);
  u.activity(user.id, 'update', 'vault_item', row.id, '');
  return getItem(user, row.id, false);
}

function deleteItem(user, id) {
  const row = itemRow(user, id);
  db.prepare('DELETE FROM vault_items WHERE id = ? AND user_id = ?').run(row.id, user.id);
  u.activity(user.id, 'delete', 'vault_item', row.id, '');
  return { ok: true };
}

function createCategory(user, body = {}) {
  const name = u.str(body.name, { max: 30, required: true, field: 'ชื่อหมวด' });
  const count = db.prepare('SELECT COUNT(*) AS c FROM vault_categories WHERE user_id = ?').get(user.id).c;
  if (count >= MAX_CATEGORIES) throw new u.HttpError(400, `สร้างหมวดได้มากที่สุด ${MAX_CATEGORIES} หมวด`, 'LIMIT');
  const color = COLORS.includes(body.color) ? body.color : COLORS[count % COLORS.length];
  const id = u.uid();
  const now = u.nowIso();
  db.prepare('INSERT INTO vault_categories (id, user_id, name, color, sort_order, created_at, updated_at) VALUES (?,?,?,?,?,?,?)')
    .run(id, user.id, name, color, count, now, now);
  return categoryDto(catRow(user, id));
}

function updateCategory(user, id, body = {}) {
  const row = catRow(user, id);
  if (!row) throw new u.HttpError(404, 'ไม่พบหมวดนี้', 'NOT_FOUND');
  const name = body.name != null ? u.str(body.name, { max: 30, required: true, field: 'ชื่อหมวด' }) : row.name;
  const color = COLORS.includes(body.color) ? body.color : row.color;
  db.prepare('UPDATE vault_categories SET name = ?, color = ?, updated_at = ? WHERE id = ? AND user_id = ?')
    .run(name, color, u.nowIso(), row.id, user.id);
  return categoryDto(catRow(user, row.id));
}

// Deleting a category keeps its accounts; they move to "ไม่มีหมวด".
function deleteCategory(user, id) {
  const row = catRow(user, id);
  if (!row) throw new u.HttpError(404, 'ไม่พบหมวดนี้', 'NOT_FOUND');
  db.exec('BEGIN');
  try {
    db.prepare('UPDATE vault_items SET category_id = NULL WHERE category_id = ? AND user_id = ?').run(row.id, user.id);
    db.prepare('DELETE FROM vault_categories WHERE id = ? AND user_id = ?').run(row.id, user.id);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return { ok: true };
}

module.exports = { listCategories, listItems, getItem, createItem, updateItem, deleteItem, createCategory, updateCategory, deleteCategory, COLORS };
