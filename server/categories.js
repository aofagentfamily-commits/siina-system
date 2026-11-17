'use strict';
// Chat categories: a named group of Telegram rooms with an icon and a colour. A room can be in many categories.
// Changing a category touches only its own rows; rooms, bots, messages and tags are never changed here.
const { db } = require('./db');
const u = require('./util');

const MAX_CATEGORIES = 20;
const ICONS = ['star', 'zap', 'chat', 'users', 'calendar', 'megaphone', 'bookmark', 'check2', 'briefcase', 'heart', 'shield', 'file', 'bell', 'note'];
const COLORS = ['#FFD86B', '#FF7A59', '#FF5AA5', '#B57BFF', '#6FB7FF', '#5CE1B0', '#FFA3C7', '#9AA0FF'];

function ownGroupIds(user, ids) {
  const list = Array.isArray(ids) ? [...new Set(ids.map(String))] : [];
  if (list.length > 200) throw new u.HttpError(400, 'เลือกห้องได้มากที่สุด 200 ห้องต่อหมวด', 'VALIDATION');
  for (const id of list) {
    const row = db.prepare('SELECT 1 FROM telegram_groups WHERE id = ? AND user_id = ?').get(id, user.id);
    if (!row) throw new u.HttpError(400, 'ไม่พบห้องแชทที่เลือก', 'VALIDATION');
  }
  return list;
}

function setLinks(user, categoryId, groupIds) {
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM telegram_category_groups WHERE category_id = ? AND user_id = ?').run(categoryId, user.id);
    const add = db.prepare('INSERT INTO telegram_category_groups (category_id, group_id, user_id) VALUES (?,?,?)');
    for (const gid of groupIds) add.run(categoryId, gid, user.id);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function checkFields(body) {
  const name = u.str(body.name, { max: 30, required: true, field: 'ชื่อหมวด' });
  if (!ICONS.includes(body.icon)) throw new u.HttpError(400, 'ไอคอนหมวดไม่ถูกต้อง', 'VALIDATION');
  if (!COLORS.includes(body.color)) throw new u.HttpError(400, 'สีหมวดไม่ถูกต้อง', 'VALIDATION');
  return { name, icon: body.icon, color: body.color };
}

function listCategories(user) {
  const links = new Map();
  for (const r of db.prepare('SELECT category_id, group_id FROM telegram_category_groups WHERE user_id = ?').all(user.id)) {
    if (!links.has(r.category_id)) links.set(r.category_id, []);
    links.get(r.category_id).push(r.group_id);
  }
  return db.prepare('SELECT * FROM telegram_categories WHERE user_id = ? ORDER BY created_at, name').all(user.id).map((c) => ({
    id: c.id, name: c.name, icon: c.icon, color: c.color, groupIds: links.get(c.id) || [],
  }));
}

function createCategory(user, body = {}) {
  const fields = checkFields(body);
  const count = db.prepare('SELECT COUNT(*) AS c FROM telegram_categories WHERE user_id = ?').get(user.id).c;
  if (count >= MAX_CATEGORIES) throw new u.HttpError(400, `สร้างหมวดได้มากที่สุด ${MAX_CATEGORIES} หมวด`, 'LIMIT');
  const groupIds = ownGroupIds(user, body.groupIds);
  const id = u.uid();
  const now = u.nowIso();
  db.prepare('INSERT INTO telegram_categories (id, user_id, name, icon, color, created_at, updated_at) VALUES (?,?,?,?,?,?,?)')
    .run(id, user.id, fields.name, fields.icon, fields.color, now, now);
  setLinks(user, id, groupIds);
  u.activity(user.id, 'create', 'telegram_category', id, fields.name);
  return { id, ...fields, groupIds };
}

function ownCategory(user, id) {
  const row = db.prepare('SELECT * FROM telegram_categories WHERE id = ? AND user_id = ?').get(String(id), user.id);
  if (!row) throw new u.HttpError(404, 'ไม่พบหมวดนี้', 'NOT_FOUND');
  return row;
}

// Sent fields replace the old ones. groupIds, when sent, replaces the room list of this category only.
function updateCategory(user, id, body = {}) {
  const row = ownCategory(user, id);
  const fields = checkFields({ name: body.name ?? row.name, icon: body.icon ?? row.icon, color: body.color ?? row.color });
  db.prepare('UPDATE telegram_categories SET name = ?, icon = ?, color = ?, updated_at = ? WHERE id = ? AND user_id = ?')
    .run(fields.name, fields.icon, fields.color, u.nowIso(), row.id, user.id);
  if (Array.isArray(body.groupIds)) setLinks(user, row.id, ownGroupIds(user, body.groupIds));
  u.activity(user.id, 'update', 'telegram_category', row.id, fields.name);
  return listCategories(user).find((c) => c.id === row.id);
}

// Deletes the category and its links only. Rooms, their history and tags stay.
function deleteCategory(user, id) {
  const row = ownCategory(user, id);
  db.prepare('DELETE FROM telegram_categories WHERE id = ? AND user_id = ?').run(row.id, user.id);
  u.activity(user.id, 'delete', 'telegram_category', row.id, row.name);
  return { ok: true };
}

module.exports = { listCategories, createCategory, updateCategory, deleteCategory, ICONS, COLORS };
