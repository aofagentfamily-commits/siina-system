'use strict';
// Domain logic: profile/settings, projects, calendar events, notifications,
// important summary, dashboard, export. Every query is scoped to the signed-in user.
const { db } = require('./db');
const u = require('./util');
const mailer = require('./mailer');

const PROJECT_STATUSES = ['in_progress', 'live', 'needs_update', 'paused'];
const PROJECT_ICONS = ['folder', 'chart', 'megaphone', 'chair', 'users', 'box', 'send', 'bolt', 'globe', 'code'];
const EVENT_CATEGORIES = ['work', 'appointment', 'delivery', 'deadline', 'special', 'todo', 'notice', 'personal'];
const EVENT_SYMBOLS = ['briefcase', 'calendar', 'rocket', 'star', 'heart', 'bell', 'check', 'clock', 'note', 'truck'];
const DEFAULT_SYMBOL = {
  work: 'briefcase', appointment: 'calendar', delivery: 'rocket', deadline: 'clock',
  special: 'star', todo: 'check', notice: 'bell', personal: 'heart',
};
const SUMMARY_STATES = ['open', 'read', 'follow', 'done'];
const DEFAULT_SETTINGS = {
  notifyInApp: true,
  notifyEmail: false,
  defaultReminderMinutes: 30,
  animation: 'full',
  fontScale: 100,
  sidebarCollapsed: false,
  categoryNotify: { work: true, appointment: true, delivery: true, deadline: true, special: true, todo: true, notice: true, personal: true },
};

// ---------------------------------------------------------------- settings / profile
function getSettings(userId) {
  const row = db.prepare('SELECT data FROM user_settings WHERE user_id = ?').get(userId);
  const saved = row ? JSON.parse(row.data) : {};
  return { ...DEFAULT_SETTINGS, ...saved, categoryNotify: { ...DEFAULT_SETTINGS.categoryNotify, ...(saved.categoryNotify || {}) } };
}

function updateSettings(user, body) {
  const current = getSettings(user.id);
  const next = { ...current };
  if ('notifyInApp' in body) next.notifyInApp = u.bool(body.notifyInApp);
  if ('notifyEmail' in body) next.notifyEmail = u.bool(body.notifyEmail);
  if ('defaultReminderMinutes' in body) next.defaultReminderMinutes = u.int(body.defaultReminderMinutes, { min: 0, max: 525600, field: 'เวลาแจ้งเตือน' });
  if ('animation' in body) next.animation = u.oneOf(body.animation, ['full', 'reduced', 'off'], 'การตั้งค่า Animation');
  if ('fontScale' in body) next.fontScale = u.int(body.fontScale, { min: 90, max: 130, field: 'ขนาดตัวอักษร' });
  if ('sidebarCollapsed' in body) next.sidebarCollapsed = u.bool(body.sidebarCollapsed);
  if (body.categoryNotify && typeof body.categoryNotify === 'object') {
    for (const c of EVENT_CATEGORIES) {
      if (c in body.categoryNotify) next.categoryNotify[c] = u.bool(body.categoryNotify[c]);
    }
  }
  db.prepare(`INSERT INTO user_settings (user_id, data, updated_at) VALUES (?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`)
    .run(user.id, JSON.stringify(next), u.nowIso());
  u.activity(user.id, 'update', 'settings', null, 'ปรับการตั้งค่า');
  return next;
}

function userDto(user) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    avatarData: user.avatar_data,
    timezone: user.timezone,
    telegramUserId: user.telegram_user_id,
  };
}

function updateProfile(user, body) {
  const displayName = u.str(body.displayName, { max: 60, field: 'ชื่อแสดงผล' });
  const timezone = body.timezone == null ? user.timezone : u.str(body.timezone, { max: 60, field: 'เขตเวลา' });
  if (timezone && !u.isValidTimezone(timezone)) throw new u.HttpError(400, 'เขตเวลาไม่ถูกต้อง', 'VALIDATION');
  let avatar = user.avatar_data;
  if ('avatarData' in body) {
    if (body.avatarData === null || body.avatarData === '') avatar = null;
    else avatar = imageDataOrThrow(body.avatarData, 300000, 'รูปโปรไฟล์');
  }
  const telegramUserId = 'telegramUserId' in body
    ? (body.telegramUserId === '' || body.telegramUserId == null ? null : String(u.int(body.telegramUserId, { min: 1, field: 'Telegram User ID' })))
    : user.telegram_user_id;
  db.prepare('UPDATE users SET display_name = ?, timezone = ?, avatar_data = ?, telegram_user_id = ?, updated_at = ? WHERE id = ?')
    .run(displayName || user.display_name, timezone || user.timezone, avatar, telegramUserId, u.nowIso(), user.id);
  u.activity(user.id, 'update', 'profile', user.id, 'แก้ไขโปรไฟล์');
  return userDto(db.prepare('SELECT * FROM users WHERE id = ?').get(user.id));
}

function imageDataOrThrow(value, maxLen, field) {
  const s = String(value);
  if (!/^data:image\/(png|jpeg|webp|gif);base64,/.test(s)) throw new u.HttpError(400, `${field}ต้องเป็นไฟล์รูปภาพ PNG, JPG, WEBP หรือ GIF`, 'VALIDATION');
  if (s.length > maxLen) throw new u.HttpError(400, `${field}มีขนาดใหญ่เกินไป`, 'VALIDATION');
  return s;
}

// ---------------------------------------------------------------- projects
function projectDto(r) {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    description: r.description,
    icon: r.icon,
    imageData: r.image_data,
    status: r.status,
    openUrl: r.open_url,
    editorUrl: r.editor_url,
    startDate: r.start_date,
    notes: r.notes,
    isFavorite: !!r.is_favorite,
    archived: !!r.archived,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function parseProject(body, existing) {
  const get = (k, fallback) => (k in body ? body[k] : fallback);
  const data = {
    name: u.str(get('name', existing && existing.name), { max: 120, required: true, field: 'ชื่อโปรเจ็กต์' }),
    category: u.str(get('category', existing && existing.category), { max: 60, field: 'หมวดหมู่' }),
    description: u.str(get('description', existing && existing.description), { max: 500, field: 'คำอธิบาย' }),
    icon: u.oneOf(get('icon', existing ? existing.icon : 'folder'), PROJECT_ICONS, 'ไอคอน'),
    imageData: existing ? existing.image_data : null,
    status: u.oneOf(get('status', existing ? existing.status : 'in_progress'), PROJECT_STATUSES, 'สถานะ'),
    openUrl: u.httpUrlOpt(get('openUrl', existing && existing.open_url) || '', 'URL สำหรับเปิดโปรเจ็กต์'),
    editorUrl: u.httpUrlOpt(get('editorUrl', existing && existing.editor_url) || '', 'URL สำหรับแก้ไขโค้ด'),
    startDate: u.dateOpt(get('startDate', existing && existing.start_date) || null, 'วันที่เริ่มต้น'),
    notes: u.str(get('notes', existing && existing.notes), { max: 2000, field: 'หมายเหตุ' }),
    isFavorite: u.bool(get('isFavorite', existing ? !!existing.is_favorite : false)) ? 1 : 0,
    archived: u.bool(get('archived', existing ? !!existing.archived : false)) ? 1 : 0,
  };
  if ('imageData' in body) {
    data.imageData = body.imageData ? imageDataOrThrow(body.imageData, 400000, 'รูปภาพโปรเจ็กต์') : null;
  }
  return data;
}

function listProjects(user, q) {
  const rows = db.prepare('SELECT * FROM projects WHERE user_id = ? ORDER BY is_favorite DESC, updated_at DESC').all(user.id);
  const search = u.str(q.q || '', { max: 100 }).toLowerCase();
  const filter = u.str(q.filter || 'all', { max: 20 });
  return rows
    .filter((r) => (search ? (r.name + ' ' + r.category + ' ' + r.description).toLowerCase().includes(search) : true))
    .filter((r) => {
      if (filter === 'favorite') return r.is_favorite && !r.archived;
      if (filter === 'archived') return r.archived;
      if (r.archived) return false;
      if (filter === 'all') return true;
      return r.status === filter;
    })
    .map(projectDto);
}

function getProject(user, id) {
  const r = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(id, user.id);
  if (!r) throw new u.HttpError(404, 'ไม่พบโปรเจ็กต์', 'NOT_FOUND');
  return r;
}

function createProject(user, body) {
  const d = parseProject(body, null);
  const id = u.uid();
  const now = u.nowIso();
  db.prepare(`INSERT INTO projects (id, user_id, name, category, description, icon, image_data, status, open_url, editor_url,
    start_date, notes, is_favorite, archived, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, user.id, d.name, d.category, d.description, d.icon, d.imageData, d.status, d.openUrl, d.editorUrl,
      d.startDate, d.notes, d.isFavorite, d.archived, now, now);
  u.activity(user.id, 'create', 'project', id, d.name);
  return projectDto(getProject(user, id));
}

function updateProject(user, id, body) {
  const existing = getProject(user, id);
  const d = parseProject(body, existing);
  db.prepare(`UPDATE projects SET name=?, category=?, description=?, icon=?, image_data=?, status=?, open_url=?, editor_url=?,
    start_date=?, notes=?, is_favorite=?, archived=?, updated_at=? WHERE id=? AND user_id=?`)
    .run(d.name, d.category, d.description, d.icon, d.imageData, d.status, d.openUrl, d.editorUrl, d.startDate,
      d.notes, d.isFavorite, d.archived, u.nowIso(), id, user.id);
  u.activity(user.id, 'update', 'project', id, d.name);
  return projectDto(getProject(user, id));
}

function deleteProject(user, id) {
  getProject(user, id);
  db.prepare('DELETE FROM projects WHERE id = ? AND user_id = ?').run(id, user.id);
  u.activity(user.id, 'delete', 'project', id);
  return { ok: true };
}

// ---------------------------------------------------------------- calendar events
function eventDto(r, tz) {
  return {
    id: r.id,
    title: r.title,
    symbol: r.symbol,
    color: r.color,
    category: r.category,
    startDate: r.start_date,
    startTime: r.start_time,
    endDate: r.end_date,
    endTime: r.end_time,
    startAt: r.start_at,
    endAt: r.end_at,
    details: r.details,
    projectId: r.project_id,
    reminderMinutes: r.reminder_minutes,
    reminderDueAt: r.reminder_due_at,
    reminderSentAt: r.reminder_sent_at,
    status: r.status,
    timezone: tz,
  };
}

function parseEvent(user, body, existing) {
  const get = (k, fallback) => (k in body ? body[k] : fallback);
  const category = u.oneOf(get('category', existing ? existing.category : 'notice'), EVENT_CATEGORIES, 'ประเภทเหตุการณ์');
  const symbol = u.oneOf(get('symbol', existing ? existing.symbol : DEFAULT_SYMBOL[category]), EVENT_SYMBOLS, 'สัญลักษณ์');
  const color = get('color', existing ? existing.color : '#FF4F9A');
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new u.HttpError(400, 'สีไม่ถูกต้อง', 'VALIDATION');
  const startDate = u.dateReq(get('startDate', existing && existing.start_date), 'วันที่เริ่มต้น');
  const startTime = u.timeOpt(get('startTime', existing && existing.start_time), 'เวลาเริ่มต้น');
  const endDate = u.dateOpt(get('endDate', existing && existing.end_date), 'วันที่สิ้นสุด');
  const endTime = u.timeOpt(get('endTime', existing && existing.end_time), 'เวลาสิ้นสุด');
  const status = u.oneOf(get('status', existing ? existing.status : 'pending'), ['pending', 'done'], 'สถานะ');
  const reminder = get('reminderMinutes', existing ? existing.reminder_minutes : null);
  const reminderMinutes = reminder === null || reminder === '' || reminder === undefined
    ? null : u.int(reminder, { min: 0, max: 525600, field: 'การแจ้งเตือน' });
  let projectId = get('projectId', existing ? existing.project_id : null) || null;
  if (projectId) getProject(user, projectId); // ownership check

  const tz = user.timezone || 'Asia/Bangkok';
  const startAt = u.zonedToIso(startDate, startTime || '09:00', tz);
  const endAt = endDate ? u.zonedToIso(endDate, endTime || '23:59', tz) : null;
  const reminderDueAt = reminderMinutes == null ? null : new Date(new Date(startAt).getTime() - reminderMinutes * 60000).toISOString();
  return {
    title: u.str(get('title', existing && existing.title), { max: 120, required: true, field: 'ชื่อรายการ' }),
    symbol, color, category, startDate, startTime, endDate, endTime, startAt, endAt,
    details: u.str(get('details', existing && existing.details), { max: 5000, field: 'รายละเอียด' }),
    projectId, reminderMinutes, reminderDueAt, status,
  };
}

function listEvents(user, q) {
  const from = u.dateOpt(q.from, 'วันที่เริ่มต้นช่วง');
  const to = u.dateOpt(q.to, 'วันที่สิ้นสุดช่วง');
  const rows = db.prepare(`SELECT * FROM calendar_events WHERE user_id = ?
    AND (? IS NULL OR COALESCE(end_date, start_date) >= ?)
    AND (? IS NULL OR start_date <= ?)
    ORDER BY start_at ASC LIMIT 2000`).all(user.id, from, from, to, to);
  return rows.map((r) => eventDto(r, user.timezone));
}

function getEvent(user, id) {
  const r = db.prepare('SELECT * FROM calendar_events WHERE id = ? AND user_id = ?').get(id, user.id);
  if (!r) throw new u.HttpError(404, 'ไม่พบรายการ', 'NOT_FOUND');
  return r;
}

function getEventDto(user, id) {
  return eventDto(getEvent(user, id), user.timezone);
}

function createEvent(user, body) {
  const d = parseEvent(user, body, null);
  const id = u.uid();
  const now = u.nowIso();
  db.prepare(`INSERT INTO calendar_events (id, user_id, title, symbol, color, category, start_date, start_time, end_date, end_time,
    start_at, end_at, details, project_id, reminder_minutes, reminder_due_at, status, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, user.id, d.title, d.symbol, d.color, d.category, d.startDate, d.startTime, d.endDate, d.endTime,
      d.startAt, d.endAt, d.details, d.projectId, d.reminderMinutes, d.reminderDueAt, d.status, now, now);
  u.activity(user.id, 'create', 'event', id, d.title);
  return eventDto(getEvent(user, id), user.timezone);
}

function updateEvent(user, id, body) {
  const existing = getEvent(user, id);
  const d = parseEvent(user, body, existing);
  db.prepare(`UPDATE calendar_events SET title=?, symbol=?, color=?, category=?, start_date=?, start_time=?, end_date=?, end_time=?,
    start_at=?, end_at=?, details=?, project_id=?, reminder_minutes=?, reminder_due_at=?, reminder_sent_at=NULL, status=?, updated_at=?
    WHERE id=? AND user_id=?`)
    .run(d.title, d.symbol, d.color, d.category, d.startDate, d.startTime, d.endDate, d.endTime, d.startAt, d.endAt,
      d.details, d.projectId, d.reminderMinutes, d.reminderDueAt, d.status, u.nowIso(), id, user.id);
  u.activity(user.id, 'update', 'event', id, d.title);
  return eventDto(getEvent(user, id), user.timezone);
}

function deleteEvent(user, id) {
  getEvent(user, id);
  db.prepare('DELETE FROM calendar_events WHERE id = ? AND user_id = ?').run(id, user.id);
  u.activity(user.id, 'delete', 'event', id);
  return { ok: true };
}

// Upcoming list under the calendar with the spec's filter tabs.
function upcomingEvents(user, q) {
  const tab = u.oneOf(q.tab || 'all', ['all', 'mine', 'appointment', 'delivery', 'due', 'done'], 'แท็บ');
  const today = u.todayIn(user.timezone);
  const rows = db.prepare(`SELECT * FROM calendar_events WHERE user_id = ?
    AND COALESCE(end_date, start_date) >= ? ORDER BY start_at ASC LIMIT 500`).all(user.id, today);
  const weekLimit = u.addDays(today, 7);
  return rows
    .filter((r) => {
      if (tab === 'done') return r.status === 'done';
      if (r.status === 'done') return false;
      if (tab === 'all') return true;
      if (tab === 'mine') return ['work', 'todo', 'personal'].includes(r.category);
      if (tab === 'appointment') return r.category === 'appointment';
      if (tab === 'delivery') return r.category === 'delivery';
      if (tab === 'due') return r.category === 'deadline' && r.start_date <= weekLimit;
      return true;
    })
    .slice(0, u.int(q.limit || 50, { min: 1, max: 200, field: 'จำนวนรายการ' }))
    .map((r) => eventDto(r, user.timezone));
}

// ---------------------------------------------------------------- reminders
function reminderBody(ev) {
  const time = ev.start_time ? ` เวลา ${ev.start_time} น.` : '';
  return `${ev.start_date}${time}`;
}

// Called by the scheduler: turns due reminders into in-app notifications (and optional email).
async function runReminders(now = new Date()) {
  const due = db.prepare(`SELECT e.*, u.email AS user_email, u.timezone AS user_tz
    FROM calendar_events e JOIN users u ON u.id = e.user_id
    WHERE e.status = 'pending' AND e.reminder_due_at IS NOT NULL AND e.reminder_sent_at IS NULL AND e.reminder_due_at <= ?
    LIMIT 200`).all(now.toISOString());
  for (const ev of due) {
    const settings = getSettings(ev.user_id);
    const sentAt = u.nowIso();
    db.prepare('UPDATE calendar_events SET reminder_sent_at = ? WHERE id = ?').run(sentAt, ev.id);
    if (!settings.categoryNotify[ev.category]) continue;
    const title = `แจ้งเตือน: ${ev.title}`;
    const body = reminderBody(ev);
    let notifId = null;
    if (settings.notifyInApp) {
      notifId = u.uid();
      db.prepare(`INSERT OR IGNORE INTO notifications (id, user_id, source_type, source_id, title, body, remind_at, created_at)
        VALUES (?,?,?,?,?,?,?,?)`).run(notifId, ev.user_id, 'event', ev.id, title, body, ev.reminder_due_at, sentAt);
    }
    if (settings.notifyEmail && mailer.isConfigured()) {
      try {
        await mailer.sendReminder(ev.user_email, title, body);
        db.prepare('UPDATE notifications SET email_sent_at = ? WHERE user_id = ? AND source_type = ? AND source_id = ? AND remind_at = ?')
          .run(u.nowIso(), ev.user_id, 'event', ev.id, ev.reminder_due_at);
      } catch (err) {
        u.logError('reminder email failed: ' + err.message, 'scheduler.reminders');
      }
    }
  }
  return due.length;
}

function listNotifications(user, q) {
  const onlyUnread = u.bool(q.unread);
  return db.prepare(`SELECT * FROM notifications WHERE user_id = ? ${onlyUnread ? 'AND read_at IS NULL' : ''}
    ORDER BY remind_at DESC LIMIT 100`).all(user.id).map((n) => ({
    id: n.id, sourceType: n.source_type, sourceId: n.source_id, title: n.title, body: n.body,
    remindAt: n.remind_at, readAt: n.read_at, createdAt: n.created_at,
  }));
}

function markNotificationRead(user, id) {
  const r = db.prepare('UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE id = ? AND user_id = ?').run(u.nowIso(), id, user.id);
  if (!r.changes) throw new u.HttpError(404, 'ไม่พบการแจ้งเตือน', 'NOT_FOUND');
  return { ok: true };
}

function markAllNotificationsRead(user) {
  db.prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL').run(u.nowIso(), user.id);
  return { ok: true };
}

function unreadCount(userId) {
  return db.prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read_at IS NULL').get(userId).c;
}

// ---------------------------------------------------------------- important summary
function summaryItems(user, tabParam) {
  const tab = u.oneOf(tabParam || 'all', ['all', 'urgent', 'reply', 'assigned', 'info', 'follow', 'done'], 'แท็บ');
  const nowMs = Date.now();
  const items = [];

  // Telegram messages that matched a filter (direct mention, keyword, sender, reply to me).
  const msgs = db.prepare(`SELECT m.*, g.title AS group_title FROM telegram_messages m
    JOIN telegram_groups g ON g.id = m.group_id
    WHERE m.user_id = ? AND m.is_outgoing = 0 AND m.matched != '[]' AND m.sent_at > ?
    ORDER BY m.sent_at DESC LIMIT 200`).all(user.id, new Date(nowMs - 30 * 86400000).toISOString());
  for (const m of msgs) {
    const matched = JSON.parse(m.matched);
    let category = 'info';
    if (matched.includes('mention') || matched.includes('reply_to_me')) category = 'reply';
    else if (/ด่วน|รบกวน/.test(m.text)) category = 'urgent';
    else if (/ส่งงาน|ต้องการ|ตรวจสอบ|แก้ไข/.test(m.text)) category = 'assigned';
    items.push({
      sourceType: 'telegram', sourceId: m.id,
      source: `Telegram · ${m.group_title}`,
      title: `${m.sender_name || 'ไม่ทราบชื่อ'}${matched.includes('mention') ? ' แท็กคุณ' : matched.includes('reply_to_me') ? ' ตอบกลับคุณ' : ''}`,
      summary: m.text.slice(0, 160) || '(ไฟล์แนบ)',
      at: m.sent_at,
      priority: category === 'urgent' || matched.includes('mention') ? 'high' : 'normal',
      category,
      target: { type: 'chat', groupId: m.group_id, messageId: m.message_id },
    });
  }

  // Calendar: overdue, due within 24h, upcoming in 7 days, and tasks/deadlines.
  const evs = db.prepare(`SELECT * FROM calendar_events WHERE user_id = ? AND status = 'pending'
    AND start_at < ? ORDER BY start_at ASC LIMIT 400`).all(user.id, new Date(nowMs + 7 * 86400000).toISOString());
  for (const e of evs) {
    const endMs = new Date(e.end_at || e.start_at).getTime();
    const overdue = endMs < nowMs && ['todo', 'deadline', 'delivery', 'work'].includes(e.category);
    const soon = !overdue && new Date(e.start_at).getTime() - nowMs < 86400000;
    if (!overdue && endMs < nowMs) continue; // past appointments are not "important"
    let category = 'info';
    if (overdue || soon) category = 'urgent';
    else if (['todo', 'work'].includes(e.category)) category = 'assigned';
    items.push({
      sourceType: 'event', sourceId: e.id,
      source: 'ปฏิทิน',
      title: e.title + (overdue ? ' (เลยกำหนด)' : ''),
      summary: `${e.start_date}${e.start_time ? ' ' + e.start_time : ''}${e.details ? ' · ' + e.details.slice(0, 100) : ''}`,
      at: e.start_at,
      priority: overdue || soon ? 'high' : 'normal',
      category,
      target: { type: 'event', id: e.id },
    });
  }

  // Attach persisted state. Unfinished items stay listed even when new data arrives.
  const states = new Map(db.prepare('SELECT source_type, source_id, state FROM summary_states WHERE user_id = ?').all(user.id)
    .map((s) => [s.source_type + ':' + s.source_id, s.state]));
  let out = items.map((it) => ({ ...it, key: `${it.sourceType}:${it.sourceId}`, state: states.get(`${it.sourceType}:${it.sourceId}`) || 'open' }));
  out.sort((a, b) => (a.priority === b.priority ? new Date(b.at) - new Date(a.at) : a.priority === 'high' ? -1 : 1));

  if (tab === 'done') return out.filter((i) => i.state === 'done');
  out = out.filter((i) => i.state !== 'done');
  if (tab === 'follow') return out.filter((i) => i.state === 'follow');
  if (tab === 'all') return out;
  return out.filter((i) => i.category === tab);
}

function setSummaryState(user, body) {
  const sourceType = u.oneOf(body.sourceType, ['telegram', 'event'], 'ประเภทแหล่งข้อมูล');
  const sourceId = u.str(body.sourceId, { max: 64, required: true, field: 'รหัสรายการ' });
  const state = u.oneOf(body.state, SUMMARY_STATES, 'สถานะ');
  if (sourceType === 'telegram') {
    const exists = db.prepare('SELECT 1 FROM telegram_messages WHERE id = ? AND user_id = ?').get(sourceId, user.id);
    if (!exists) throw new u.HttpError(404, 'ไม่พบข้อความ', 'NOT_FOUND');
  } else {
    getEvent(user, sourceId);
  }
  db.prepare(`INSERT INTO summary_states (id, user_id, source_type, source_id, state, updated_at) VALUES (?,?,?,?,?,?)
    ON CONFLICT(user_id, source_type, source_id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at`)
    .run(u.uid(), user.id, sourceType, sourceId, state, u.nowIso());
  return { ok: true };
}

// ---------------------------------------------------------------- dashboard
function dashboard(user) {
  const tz = user.timezone;
  const today = u.todayIn(tz);
  const weekEnd = u.addDays(today, 7);
  const projects = db.prepare('SELECT status, archived FROM projects WHERE user_id = ?').all(user.id);
  const active = projects.filter((p) => !p.archived);
  const summary = summaryItems(user, 'all');
  const events = db.prepare(`SELECT * FROM calendar_events WHERE user_id = ? AND status = 'pending'
    AND start_date <= ? AND COALESCE(end_date, start_date) >= ? ORDER BY start_at`).all(user.id, weekEnd, today);
  const todayEvents = events.filter((e) => e.start_date <= today && (e.end_date || e.start_date) >= today);
  const upcomingAppointments = events.filter((e) => e.category === 'appointment' && e.start_date >= today).length;
  const nearDue = events.filter((e) => ['deadline', 'todo', 'delivery'].includes(e.category) && (e.end_date || e.start_date) <= weekEnd).length;
  const followCount = summary.filter((s) => s.state === 'follow').length;
  const dueToday = todayEvents.filter((e) => ['deadline', 'todo', 'delivery'].includes(e.category));
  const replyNeeded = summary.filter((s) => s.category === 'reply' && s.state === 'open');
  return {
    today,
    unreadImportant: summary.filter((s) => s.state === 'open').length,
    projectsTotal: active.length,
    projectsInProgress: active.filter((p) => p.status === 'in_progress').length,
    upcomingAppointments,
    nearDue,
    followCount,
    todayEvents: todayEvents.map((e) => eventDto(e, tz)),
    dueToday: dueToday.map((e) => eventDto(e, tz)),
    replyNeeded: replyNeeded.slice(0, 5),
    notifications: listNotifications(user, { unread: '1' }).slice(0, 5),
    unreadNotifications: unreadCount(user.id),
  };
}

// ---------------------------------------------------------------- export
function exportData(user) {
  const all = (sql) => db.prepare(sql).all(user.id);
  return {
    exportedAt: u.nowIso(),
    profile: userDto(user),
    settings: getSettings(user.id),
    projects: all('SELECT * FROM projects WHERE user_id = ?'),
    calendarEvents: all('SELECT * FROM calendar_events WHERE user_id = ?'),
    notifications: all('SELECT * FROM notifications WHERE user_id = ?'),
    telegramBots: all('SELECT id, name, username, token_hint, mode, status, created_at FROM telegram_bots WHERE user_id = ?'),
    telegramGroups: all('SELECT * FROM telegram_groups WHERE user_id = ?'),
    telegramMessages: all('SELECT * FROM telegram_messages WHERE user_id = ?'),
    telegramFilters: all('SELECT * FROM telegram_filters WHERE user_id = ?'),
    summaryStates: all('SELECT * FROM summary_states WHERE user_id = ?'),
    activityLogs: all('SELECT action, entity, entity_id, detail, created_at FROM activity_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 5000'),
  };
}

function activityLogs(user) {
  return db.prepare('SELECT action, entity, entity_id, detail, created_at FROM activity_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 200').all(user.id);
}

module.exports = {
  PROJECT_ICONS, EVENT_CATEGORIES, EVENT_SYMBOLS, DEFAULT_SYMBOL,
  getSettings, updateSettings, userDto, updateProfile,
  listProjects, getProject, projectDto, createProject, updateProject, deleteProject,
  listEvents, getEventDto, createEvent, updateEvent, deleteEvent, upcomingEvents, eventDto,
  runReminders, listNotifications, markNotificationRead, markAllNotificationsRead,
  summaryItems, setSummaryState, dashboard, exportData, activityLogs,
};
