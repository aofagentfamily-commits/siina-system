'use strict';
// Chat themes (ธีมห้องแชท): a look for one Telegram room inside SIINA SYSTEM only. Telegram itself is not changed.
const { db } = require('./db');
const u = require('./util');

const THEMES = ['classic', 'couple', 'night', 'sea', 'sakura', 'nature', 'galaxy'];
const DEFAULTS = { theme: 'couple', options: { primary: true, textStyle: 'dark', background: 'auto', mascot: true, animation: true, opacity: 80 } };

function ownGroup(user, groupId) {
  const g = db.prepare('SELECT id FROM telegram_groups WHERE id = ? AND user_id = ?').get(String(groupId), user.id);
  if (!g) throw new u.HttpError(404, 'ไม่พบห้องแชทนี้', 'NOT_FOUND');
  return g.id;
}

function getTheme(user, groupId) {
  const id = ownGroup(user, groupId);
  const r = db.prepare('SELECT theme, options FROM chat_themes WHERE user_id = ? AND group_id = ?').get(user.id, id);
  if (!r) return { theme: DEFAULTS.theme, options: DEFAULTS.options, saved: false, themes: THEMES };
  return { theme: r.theme, options: { ...DEFAULTS.options, ...JSON.parse(r.options) }, saved: true, themes: THEMES };
}

function saveTheme(user, groupId, body = {}) {
  const id = ownGroup(user, groupId);
  if (!THEMES.includes(body.theme)) throw new u.HttpError(400, 'ไม่รู้จักธีมนี้', 'VALIDATION');
  const o = body.options || {};
  const options = {
    primary: !!o.primary,
    textStyle: o.textStyle === 'light' ? 'light' : 'dark',
    background: 'auto',
    mascot: !!o.mascot,
    animation: !!o.animation,
    opacity: Math.min(100, Math.max(0, Math.round(Number(o.opacity) || 0))),
  };
  db.prepare(`INSERT INTO chat_themes (user_id, group_id, theme, options, updated_at) VALUES (?,?,?,?,?)
    ON CONFLICT(user_id, group_id) DO UPDATE SET theme = excluded.theme, options = excluded.options, updated_at = excluded.updated_at`)
    .run(user.id, id, body.theme, JSON.stringify(options), u.nowIso());
  return { ok: true, theme: body.theme, options };
}

module.exports = { getTheme, saveTheme, THEMES, DEFAULTS };
