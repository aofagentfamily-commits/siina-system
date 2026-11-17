'use strict';
// Message templates (rich text) and sticker file ids.
// Rich text from the editor is never trusted: it is reduced to a small whitelist and
// converted to Telegram's HTML subset (b, i, u, s, a) with every other character escaped.
const { db } = require('./db');
const u = require('./util');

const FORMAT_MAP = { b: 'b', strong: 'b', i: 'i', em: 'i', u: 'u', ins: 'u', s: 's', strike: 's', del: 's' };
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
const MAX_RICH_CHARS = 20000;

function decodeEntities(text) {
  return String(text).replace(/&(#39|amp|lt|gt|quot|apos|nbsp);/g, (_, name) => NAMED[name]);
}
function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function safeHref(attrs) {
  const m = /href\s*=\s*"([^"]*)"/i.exec(attrs) || /href\s*=\s*'([^']*)'/i.exec(attrs);
  if (!m) return null;
  try {
    const url = new URL(decodeEntities(m[1]));
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch (_) {
    return null;
  }
}

function tokenize(html) {
  const src = String(html || '').slice(0, MAX_RICH_CHARS);
  const tokens = [];
  const re = /<(\/?)([a-zA-Z0-9]+)([^>]*)>|([^<]+)|</g;
  let m;
  while ((m = re.exec(src))) {
    if (m[4] !== undefined) tokens.push({ t: 'text', v: decodeEntities(m[4]) });
    else if (m[2] === undefined) tokens.push({ t: 'text', v: '<' });
    else tokens.push({ t: m[1] ? 'close' : 'open', tag: m[2].toLowerCase(), attrs: m[3] || '' });
  }
  return tokens;
}

// mode 'store' keeps a sanitized HTML copy for the editor; mode 'telegram' builds the message text.
function render(html, mode) {
  const out = [];
  const plain = [];
  const stack = []; // open inline tags, innermost last
  const lists = []; // open lists
  const newline = () => {
    if (mode === 'store') { out.push('<br>'); return; }
    out.push('\n');
    plain.push('\n');
  };
  const put = (text) => { out.push(mode === 'store' ? escapeHtml(text) : escapeHtml(text)); plain.push(text); };

  for (const tok of tokenize(html)) {
    if (tok.t === 'text') { put(tok.v); continue; }
    if (tok.t === 'open') {
      if (FORMAT_MAP[tok.tag]) {
        const name = FORMAT_MAP[tok.tag];
        stack.push({ tag: 'fmt', name });
        out.push(`<${name}>`);
      } else if (tok.tag === 'a') {
        const href = safeHref(tok.attrs);
        stack.push({ tag: 'a', name: href ? 'a' : null });
        if (href) out.push(`<a href="${escapeHtml(href)}">`);
      } else if (tok.tag === 'ul' || tok.tag === 'ol') {
        lists.push({ kind: tok.tag, n: 0 });
        if (mode === 'store') out.push(`<${tok.tag}>`);
      } else if (tok.tag === 'li') {
        const list = lists[lists.length - 1];
        if (mode === 'store') out.push('<li>');
        else {
          const n = list ? ++list.n : 1;
          const bullet = list && list.kind === 'ol' ? `${n}. ` : '• ';
          out.push(bullet);
          plain.push(bullet);
        }
      } else if (tok.tag === 'br' || tok.tag === 'p' || tok.tag === 'div') {
        newline();
      }
      continue;
    }
    // close
    if (FORMAT_MAP[tok.tag] || tok.tag === 'a') {
      const want = tok.tag === 'a' ? 'a' : 'fmt';
      const idx = stack.map((s) => s.tag).lastIndexOf(want);
      if (idx === -1) continue;
      while (stack.length > idx) {
        const item = stack.pop();
        if (item.name) out.push(`</${item.name}>`);
      }
    } else if (tok.tag === 'ul' || tok.tag === 'ol') {
      if (lists.length) lists.pop();
      if (mode === 'store') out.push(`</${tok.tag}>`);
      else newline();
    } else if (tok.tag === 'li') {
      if (mode === 'store') out.push('</li>');
      else newline();
    } else if (tok.tag === 'p' || tok.tag === 'div') {
      newline();
    }
  }
  while (stack.length) {
    const item = stack.pop();
    if (item.name) out.push(`</${item.name}>`);
  }
  return { html: out.join(''), plain: plain.join('').replace(/\n{3,}/g, '\n\n').trim() };
}

// Returns Telegram-ready HTML and plain text. Used when a message is sent with formatting.
function telegramHtml(richHtml) {
  return render(richHtml, 'telegram').html.replace(/\n{3,}/g, '\n\n').trim();
}
function plainFromHtml(richHtml) {
  return render(richHtml, 'telegram').plain;
}
function storedHtml(richHtml) {
  return render(richHtml, 'store').html;
}

// ---------------------------------------------------------------- templates
const KINDS = ['notice', 'event', 'promo', 'reminder', 'info', 'update', 'thanks'];
function templateDto(t) {
  return { id: t.id, title: t.title, content: t.content, formatted: t.formatted_html || null, kind: t.kind || 'info',
    buttons: t.buttons ? JSON.parse(t.buttons) : [], updatedAt: t.updated_at };
}

// Inline buttons: a web link (https/http only) or a Telegram username (becomes a t.me link). At most 8.
function buttonsInput(list) {
  if (list == null || list === '') return [];
  if (!Array.isArray(list)) throw new u.HttpError(400, 'รูปแบบปุ่มไม่ถูกต้อง', 'VALIDATION');
  if (list.length > 8) throw new u.HttpError(400, 'เพิ่มปุ่มได้มากที่สุด 8 ปุ่ม', 'VALIDATION');
  return list.map((b) => {
    const label = u.str(b && b.label, { max: 40, required: true, field: 'ชื่อปุ่ม' });
    if (b.type === 'url') return { label, type: 'url', url: u.httpUrlOpt(b.target, 'ลิงก์ของปุ่ม') };
    if (b.type === 'ack') return { label, type: 'ack' };
    if (b.type === 'username') {
      const name = String(b.target || '').trim().replace(/^@/, '');
      if (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(name)) throw new u.HttpError(400, 'Telegram Username ไม่ถูกต้อง', 'VALIDATION');
      return { label, type: 'username', url: 'https://t.me/' + name, username: '@' + name };
    }
    throw new u.HttpError(400, 'ประเภทปุ่มไม่ถูกต้อง', 'VALIDATION');
  });
}

function templateInput(body, existing) {
  const title = u.str(body.title != null ? body.title : existing && existing.title, { max: 80, required: true, field: 'ชื่อหัวข้อเทมเพลต' });
  const rawHtml = body.formatted != null ? String(body.formatted) : (existing && existing.formatted_html) || '';
  const contentIn = body.content != null ? body.content : null;
  let formatted = null;
  let content;
  if (rawHtml && contentIn == null) {
    const rich = render(rawHtml, 'store');
    formatted = rich.html;
    content = plainFromHtml(rawHtml);
  } else {
    content = u.str(contentIn != null ? contentIn : (existing && existing.content) || '', { max: 4000, required: true, field: 'รายละเอียด (ข้อความเทมเพลต)' });
    if (rawHtml && plainFromHtml(rawHtml) === content) formatted = storedHtml(rawHtml);
  }
  if (!content) throw new u.HttpError(400, 'กรุณากรอกรายละเอียดข้อความ', 'VALIDATION');
  return { title, content, formatted };
}

function listTemplates(user, q) {
  const search = u.str(q.q || '', { max: 100 }).toLowerCase();
  return db.prepare('SELECT * FROM telegram_templates WHERE user_id = ? ORDER BY updated_at DESC').all(user.id)
    .filter((t) => !search || (t.title + ' ' + t.content).toLowerCase().includes(search))
    .map(templateDto);
}

function getTemplate(user, id) {
  const t = db.prepare('SELECT * FROM telegram_templates WHERE id = ? AND user_id = ?').get(id, user.id);
  if (!t) throw new u.HttpError(404, 'ไม่พบเทมเพลต', 'NOT_FOUND');
  return t;
}

function createTemplate(user, body) {
  const v = templateInput(body, null);
  const id = u.uid();
  const now = u.nowIso();
  const kind = KINDS.includes(body.kind) ? body.kind : 'info';
  const buttons = buttonsInput(body.buttons);
  db.prepare('INSERT INTO telegram_templates (id, user_id, title, content, formatted_html, created_at, updated_at, kind, buttons) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(id, user.id, v.title, v.content, v.formatted, now, now, kind, buttons.length ? JSON.stringify(buttons) : null);
  u.activity(user.id, 'create', 'telegram_template', id, v.title);
  return templateDto(getTemplate(user, id));
}

function updateTemplate(user, id, body) {
  const existing = getTemplate(user, id);
  const v = templateInput(body, existing);
  db.prepare('UPDATE telegram_templates SET title = ?, content = ?, formatted_html = ?, updated_at = ? WHERE id = ? AND user_id = ?')
    .run(v.title, v.content, v.formatted, u.nowIso(), id, user.id);
  u.activity(user.id, 'update', 'telegram_template', id, v.title);
  return templateDto(getTemplate(user, id));
}

function deleteTemplate(user, id) {
  const t = getTemplate(user, id);
  db.prepare('DELETE FROM telegram_templates WHERE id = ? AND user_id = ?').run(id, user.id);
  u.activity(user.id, 'delete', 'telegram_template', id, t.title);
  return { ok: true };
}

// ---------------------------------------------------------------- stickers
function listStickers(user) {
  return db.prepare('SELECT * FROM telegram_stickers WHERE user_id = ? ORDER BY created_at DESC').all(user.id)
    .map((s) => ({ id: s.id, fileId: s.file_id, label: s.label }));
}

function addSticker(user, body) {
  const fileId = u.str(body.fileId, { max: 200, required: true, field: 'Sticker File ID' });
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(fileId)) throw new u.HttpError(400, 'Sticker File ID ไม่ถูกต้อง', 'VALIDATION');
  const label = u.str(body.label, { max: 40, field: 'ชื่อสติกเกอร์' });
  const dup = db.prepare('SELECT 1 FROM telegram_stickers WHERE user_id = ? AND file_id = ?').get(user.id, fileId);
  if (dup) throw new u.HttpError(409, 'สติกเกอร์นี้มีอยู่แล้ว', 'DUPLICATE');
  const id = u.uid();
  db.prepare('INSERT INTO telegram_stickers (id, user_id, file_id, label, created_at) VALUES (?,?,?,?,?)').run(id, user.id, fileId, label, u.nowIso());
  return { id, fileId, label };
}

function deleteSticker(user, id) {
  const r = db.prepare('DELETE FROM telegram_stickers WHERE id = ? AND user_id = ?').run(id, user.id);
  if (!r.changes) throw new u.HttpError(404, 'ไม่พบสติกเกอร์', 'NOT_FOUND');
  return { ok: true };
}

function getSticker(user, id) {
  const s = db.prepare('SELECT * FROM telegram_stickers WHERE id = ? AND user_id = ?').get(id, user.id);
  if (!s) throw new u.HttpError(404, 'ไม่พบสติกเกอร์', 'NOT_FOUND');
  return s;
}

module.exports = {
  buttonsInput,
  telegramHtml, plainFromHtml, storedHtml, render,
  listTemplates, createTemplate, updateTemplate, deleteTemplate,
  listStickers, addSticker, deleteSticker, getSticker,
};
