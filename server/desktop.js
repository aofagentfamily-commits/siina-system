'use strict';
// My Desktop: each account's own layout (icon grid, widgets, dock, wallpaper), stored in the database.
// Only modules that really exist in SIINA SYSTEM can be placed on the desktop. External shortcuts must be http(s).
// Layouts never hold passwords or note text; the quick note is referenced by id and its text is read through notes.js.
const { db } = require('./db');
const u = require('./util');

const COLS = 4;            // icon grid columns; a slot is row * COLS + col
const MAX_SLOT = 199;
const MAX_ICONS = 60;
const MAX_DOCK = 10;
const WIDGET_KINDS = ['clock', 'calendar', 'tasks', 'note', 'progress'];
const WALLPAPERS = ['default', 'couple', 'night', 'sea', 'sakura', 'nature', 'galaxy'];
const ICON_NAMES = ['globe', 'folder', 'star', 'heart', 'bookmark', 'bolt', 'briefcase', 'rocket', 'note', 'chart',
  'image', 'file', 'megaphone', 'users', 'shield', 'code', 'mail', 'cart', 'box', 'calendar'];
const MAX_ICON_DATA = 200000;      // characters of base64 image data for an app icon
const MAX_WALLPAPER_DATA = 700000; // characters of base64 image data for an uploaded wallpaper
const IMAGE_DATA_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

// Real modules of SIINA SYSTEM. `route` opens a page; `action` opens a popup the page already has.
const MODULES = {
  home: { label: 'หน้าแรก', icon: 'home', route: '#/home' },
  chat: { label: 'ห้องแชท', icon: 'chat', route: '#/chat' },
  projects: { label: 'โปรเจ็กต์', icon: 'folder', route: '#/projects' },
  calendar: { label: 'ปฏิทิน', icon: 'calendar', route: '#/calendar' },
  notes: { label: 'โน้ต', icon: 'notebook', action: 'notes' },
  summary: { label: 'สรุปสำคัญ', icon: 'bell', route: '#/summary' },
  vault: { label: 'ข้อมูลการเข้าสู่ระบบ', icon: 'lock', route: '#/vault' },
  settings: { label: 'ตั้งค่า', icon: 'settings', route: '#/settings' },
};
const MODULE_KEYS = Object.keys(MODULES);
const DEFAULT_MODULE_ORDER = ['chat', 'projects', 'calendar', 'notes', 'summary', 'vault', 'home', 'settings'];
const DEFAULT_DOCK = ['m-home', 'm-projects', 'm-chat', 'm-calendar', 'm-notes', 'm-settings'];

function defaultLayout() {
  return {
    wallpaper: { type: 'preset', key: 'default' },
    icons: DEFAULT_MODULE_ORDER.map((key, i) => ({ id: 'm-' + key, kind: 'module', key, slot: i, hidden: false })),
    widgets: [
      { kind: 'clock', size: 'lg' },
      { kind: 'calendar', size: 'sm' },
      { kind: 'tasks', size: 'sm' },
      { kind: 'note', size: 'sm' },
      { kind: 'progress', size: 'lg' },
    ],
    dock: DEFAULT_DOCK.slice(),
    animation: true,
  };
}

function fail(message) { throw new u.HttpError(400, message, 'BAD_DESKTOP'); }
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

function httpsUrl(value) {
  const text = String(value || '').trim();
  if (!text || text.length > 500) fail('ลิงก์ต้องไม่ว่างและยาวไม่เกิน 500 ตัวอักษร');
  let parsed;
  try { parsed = new URL(text); } catch (_) { fail('ลิงก์ไม่ถูกต้อง'); }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') fail('ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https:// เท่านั้น');
  return parsed.toString();
}

function cleanIcon(value) {
  if (ICON_NAMES.includes(value)) return value;
  if (typeof value === 'string' && value.length <= MAX_ICON_DATA && IMAGE_DATA_RE.test(value)) return value;
  fail('ไอคอนนี้ไม่รองรับ');
}

// Rebuilds the layout from scratch so that only known fields survive.
function sanitizeLayout(input) {
  if (!isObj(input)) fail('รูปแบบการจัดวางไม่ถูกต้อง');
  const base = defaultLayout();

  // wallpaper
  let wallpaper = base.wallpaper;
  if (isObj(input.wallpaper)) {
    if (input.wallpaper.type === 'custom') {
      const data = input.wallpaper.dataUrl;
      if (typeof data !== 'string' || data.length > MAX_WALLPAPER_DATA || !IMAGE_DATA_RE.test(data)) fail('ภาพพื้นหลังต้องเป็น PNG, JPEG หรือ WebP และไม่เกิน 500 KB');
      wallpaper = { type: 'custom', dataUrl: data };
    } else if (WALLPAPERS.includes(input.wallpaper.key)) {
      wallpaper = { type: 'preset', key: input.wallpaper.key };
    }
  }

  // icons
  if (!Array.isArray(input.icons) || input.icons.length > MAX_ICONS) fail('จำนวนไอคอนไม่ถูกต้อง');
  const seenSlots = new Set();
  const seenIds = new Set();
  const seenModules = new Set();
  const icons = input.icons.map((raw) => {
    if (!isObj(raw)) fail('ไอคอนไม่ถูกต้อง');
    const slot = Number(raw.slot);
    if (!Number.isInteger(slot) || slot < 0 || slot > MAX_SLOT) fail('ตำแหน่งไอคอนไม่ถูกต้อง');
    if (seenSlots.has(slot)) fail('มีไอคอนซ้อนทับกันอยู่');
    seenSlots.add(slot);
    const hidden = raw.hidden === true;
    const category = String(raw.category || '').trim().slice(0, 40);
    if (raw.kind === 'module') {
      if (!MODULE_KEYS.includes(raw.key)) fail('โมดูลนี้ไม่มีอยู่ในระบบ');
      if (seenModules.has(raw.key)) fail('โมดูลนี้ถูกวางซ้ำ');
      seenModules.add(raw.key);
      // A module keeps its real route; only the label and picture can be changed on the desktop.
      const name = raw.name == null || raw.name === '' ? null : String(raw.name).trim().slice(0, 40);
      const icon = raw.icon == null ? null : cleanIcon(raw.icon);
      return { id: 'm-' + raw.key, kind: 'module', key: raw.key, name, icon, category, slot, hidden };
    }
    if (raw.kind === 'link') {
      const id = String(raw.id || '');
      if (!/^[a-zA-Z0-9-]{1,64}$/.test(id) || seenIds.has(id)) fail('รหัสทางลัดไม่ถูกต้อง');
      seenIds.add(id);
      const name = String(raw.name || '').trim();
      if (!name || name.length > 40) fail('ชื่อทางลัดต้องไม่ว่างและไม่เกิน 40 ตัวอักษร');
      return { id, kind: 'link', name, url: httpsUrl(raw.url), icon: cleanIcon(raw.icon || 'globe'), category, slot, hidden };
    }
    return fail('ชนิดไอคอนไม่ถูกต้อง');
  });

  // widgets (order = display order)
  if (!Array.isArray(input.widgets) || input.widgets.length > WIDGET_KINDS.length) fail('จำนวน Widget ไม่ถูกต้อง');
  const widgetKinds = new Set();
  const widgets = input.widgets.map((raw) => {
    if (!isObj(raw) || !WIDGET_KINDS.includes(raw.kind) || widgetKinds.has(raw.kind)) fail('Widget ไม่ถูกต้อง');
    widgetKinds.add(raw.kind);
    return { kind: raw.kind, size: raw.size === 'lg' ? 'lg' : 'sm' };
  });

  // dock (icon ids, in order)
  if (!Array.isArray(input.dock) || input.dock.length > MAX_DOCK) fail('จำนวนไอคอนบน Dock ไม่ถูกต้อง');
  const iconIds = new Set(icons.map((i) => i.id));
  const dock = input.dock.map((id) => String(id));
  if (new Set(dock).size !== dock.length || dock.some((id) => !iconIds.has(id))) fail('Dock มีรายการที่ไม่มีอยู่จริง');

  return { wallpaper, icons, widgets, dock, animation: input.animation !== false };
}

function quickNoteRow(userId) {
  return db.prepare('SELECT * FROM desktop_layouts WHERE user_id = ?').get(userId);
}

function publicCatalog() {
  return {
    modules: MODULE_KEYS.map((key) => ({ key, ...MODULES[key] })),
    widgets: WIDGET_KINDS,
    wallpapers: WALLPAPERS,
    iconNames: ICON_NAMES,
    cols: COLS,
    dockLimit: MAX_DOCK,
  };
}

function getDesktop(user) {
  const row = quickNoteRow(user.id);
  const stored = row && row.layout ? JSON.parse(row.layout) : null;
  let quickNote = null;
  if (row && row.quick_note_id) {
    const note = db.prepare('SELECT id, title, is_sensitive, updated_at FROM notes WHERE id = ? AND user_id = ?').get(row.quick_note_id, user.id);
    if (note) quickNote = { id: note.id, title: note.title, isSensitive: !!note.is_sensitive, updatedAt: note.updated_at };
  }
  return {
    layout: stored || defaultLayout(),
    isDefault: !stored,
    updatedAt: row ? row.updated_at : null,
    quickNote,
    catalog: publicCatalog(),
  };
}

function saveDesktop(user, body = {}) {
  const layout = sanitizeLayout(body.layout);
  const now = u.nowIso();
  db.prepare(`INSERT INTO desktop_layouts (user_id, layout, quick_note_id, updated_at) VALUES (?,?,NULL,?)
    ON CONFLICT(user_id) DO UPDATE SET layout = excluded.layout, updated_at = excluded.updated_at`)
    .run(user.id, JSON.stringify(layout), now);
  return getDesktop(user);
}

// Back to the default layout. The quick-note choice is kept.
function resetDesktop(user) {
  const now = u.nowIso();
  db.prepare(`INSERT INTO desktop_layouts (user_id, layout, quick_note_id, updated_at) VALUES (?,NULL,NULL,?)
    ON CONFLICT(user_id) DO UPDATE SET layout = NULL, updated_at = excluded.updated_at`).run(user.id, now);
  return getDesktop(user);
}

// The quick note is an ordinary note of this account. Sensitive notes are not allowed here, so the desktop never shows them.
function setQuickNote(user, noteId) {
  const now = u.nowIso();
  if (noteId == null) {
    db.prepare(`INSERT INTO desktop_layouts (user_id, layout, quick_note_id, updated_at) VALUES (?,NULL,NULL,?)
      ON CONFLICT(user_id) DO UPDATE SET quick_note_id = NULL, updated_at = excluded.updated_at`).run(user.id, now);
    return getDesktop(user);
  }
  const note = db.prepare('SELECT id, is_sensitive FROM notes WHERE id = ? AND user_id = ?').get(String(noteId), user.id);
  if (!note) throw new u.HttpError(404, 'ไม่พบโน้ตนี้', 'NOT_FOUND');
  if (note.is_sensitive) fail('โน้ตที่เป็นข้อมูลลับไม่สามารถใช้เป็นโน้ตด่วนบนหน้าโต๊ะทำงานได้');
  db.prepare(`INSERT INTO desktop_layouts (user_id, layout, quick_note_id, updated_at) VALUES (?,NULL,?,?)
    ON CONFLICT(user_id) DO UPDATE SET quick_note_id = excluded.quick_note_id, updated_at = excluded.updated_at`).run(user.id, note.id, now);
  return getDesktop(user);
}

// Project progress = events linked to the project that are done / all linked events. No data gives null, never a sample number.
function projectProgress(user) {
  const rows = db.prepare(`SELECT p.id, p.name, p.status, COUNT(e.id) AS total,
      COALESCE(SUM(CASE WHEN e.status = 'done' THEN 1 ELSE 0 END), 0) AS done
    FROM projects p LEFT JOIN calendar_events e ON e.project_id = p.id AND e.user_id = p.user_id
    WHERE p.user_id = ? AND p.archived = 0
    GROUP BY p.id ORDER BY p.is_favorite DESC, p.updated_at DESC LIMIT 12`).all(user.id);
  return {
    items: rows.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      total: r.total,
      done: r.done,
      percent: r.total ? Math.round((r.done / r.total) * 100) : null,
    })),
  };
}

module.exports = {
  MODULES, WIDGET_KINDS, WALLPAPERS, ICON_NAMES, COLS, defaultLayout, sanitizeLayout,
  getDesktop, saveDesktop, resetDesktop, setQuickNote, projectProgress, httpsUrl,
};
