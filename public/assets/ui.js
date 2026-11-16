/* SIINA SYSTEM — shared UI helpers: icons (SVG, no emoji), egg mascot, API client, modal, toast. */
'use strict';

const S = { user: null, settings: null, tz: 'Asia/Bangkok', route: '', timers: [] };

const ICON_PATHS = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  chat: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  calendar: 'M4 5h16v15H4z M4 9h16 M8 3v4 M16 3v4',
  bell: 'M6 16V11a6 6 0 1 1 12 0v5l2 2H4z M10 20a2 2 0 0 0 4 0',
  settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9',
  plus: 'M12 5v14 M5 12h14',
  edit: 'M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  trash: 'M3 6h18 M8 6V4h8v2 M6 6l1 14h10l1-14',
  star: 'M12 3l2.8 5.8 6.2.9-4.5 4.4 1 6.3L12 17.3 6.5 20.4l1-6.3L3 9.7l6.2-.9z',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M21 21l-4.3-4.3',
  check: 'M4 12l5 5L20 6',
  external: 'M14 4h6v6 M20 4l-9 9 M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5',
  code: 'M8 8l-4 4 4 4 M16 8l4 4-4 4 M14 4l-4 16',
  archive: 'M3 4h18v4H3z M5 8v12h14V8 M10 12h4',
  close: 'M6 6l12 12 M18 6L6 18',
  menu: 'M3 6h18 M3 12h18 M3 18h18',
  chevLeft: 'M15 18l-6-6 6-6',
  chevRight: 'M9 18l6-6-6-6',
  chevDown: 'M6 9l6 6 6-6',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21a8 8 0 0 1 16 0',
  mail: 'M3 5h18v14H3z M3 6l9 7 9-7',
  send: 'M22 2L11 13 M22 2l-7 20-4-9-9-4z',
  refresh: 'M21 12a9 9 0 1 1-3-6.7 M21 4v5h-5',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5l3 2',
  briefcase: 'M3 7h18v13H3z M9 7V4h6v3 M3 13h18',
  rocket: 'M5 15c-1 2-1 4-1 4s2 0 4-1 M14 4c3 0 6 2 6 6l-6 6-4-4 4-8z M9 13l-2 2',
  heart: 'M12 20s-7-4.5-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.5-9 9-9 9z',
  truck: 'M2 6h12v10H2z M14 10h4l3 3v3h-7 M6 19a2 2 0 1 0 0-.01 M17 19a2 2 0 1 0 0-.01',
  note: 'M6 3h9l4 4v14H6z M15 3v4h4 M9 12h7 M9 16h7',
  check2: 'M9 12l2 2 4-4 M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  list: 'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01',
  download: 'M12 3v12 M7 10l5 5 5-5 M5 21h14',
  alert: 'M12 9v4 M12 17h.01 M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  reply: 'M9 17l-5-5 5-5 M4 12h11a5 5 0 0 1 5 5v2',
  bookmark: 'M6 3h12v18l-6-4-6 4z',
  image: 'M3 5h18v14H3z M3 16l5-5 4 4 3-3 6 6 M15 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  file: 'M6 3h9l4 4v14H6z M15 3v4h4',
  upload: 'M12 16V4 M7 9l5-5 5 5 M5 20h14',
  chart: 'M4 20V10 M10 20V4 M16 20v-7 M22 20H2',
  megaphone: 'M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1z M18 8a5 5 0 0 1 0 8',
  chair: 'M7 3h10v8H7z M5 11h14 M9 11v10 M15 11v10',
  users: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M2 20a7 7 0 0 1 14 0 M17 11a3 3 0 1 0 0-6 M22 20a6 6 0 0 0-5-6',
  box: 'M3 7l9-4 9 4v10l-9 4-9-4z M3 7l9 4 9-4 M12 11v10',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M3 12h18 M12 3c3 3.5 3 14.5 0 18 M12 3c-3 3.5-3 14.5 0 18',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
};

function icon(name, cls = '') {
  const d = ICON_PATHS[name];
  if (!d) return '';
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;
}

// Symbols used for calendar items and their colours.
const SYMBOLS = {
  briefcase: 'งาน / โปรเจ็กต์', calendar: 'นัดหมาย', rocket: 'ส่งมอบงาน', star: 'วันสำคัญ',
  heart: 'เรื่องส่วนตัว', bell: 'แจ้งเตือนทั่วไป', check: 'สิ่งที่ต้องทำ', clock: 'กำหนดส่ง',
  note: 'โน้ต', truck: 'จัดส่ง / พัสดุ',
};
const CATEGORIES = {
  work: 'งาน / โปรเจ็กต์', appointment: 'นัดหมาย', delivery: 'ส่งมอบงาน', deadline: 'กำหนดส่งโปรเจ็กต์',
  special: 'วันสำคัญ', todo: 'สิ่งที่ต้องทำ', notice: 'แจ้งเตือนทั่วไป', personal: 'โน้ตส่วนตัว',
};
const CATEGORY_SYMBOL = {
  work: 'briefcase', appointment: 'calendar', delivery: 'rocket', deadline: 'clock',
  special: 'star', todo: 'check', notice: 'bell', personal: 'heart',
};
const COLORS = ['#FF4F9A', '#FFB7D5', '#A77BFF', '#6EC5FF', '#7EE0B5', '#FFC86B', '#FFFFFF'];
const REMINDERS = [
  { v: '', label: 'ไม่ตั้งการแจ้งเตือน' },
  { v: '0', label: 'ตรงเวลา' },
  { v: '10', label: 'ก่อน 10 นาที' },
  { v: '30', label: 'ก่อน 30 นาที' },
  { v: '60', label: 'ก่อน 1 ชั่วโมง' },
  { v: '1440', label: 'ก่อน 1 วัน' },
  { v: 'custom', label: 'กำหนดเอง (นาที)' },
];
const PROJECT_STATUS = { in_progress: 'กำลังทำ', live: 'ใช้งานจริง', needs_update: 'รอปรับปรุง', paused: 'พักไว้' };
const PROJECT_STATUS_CLASS = { in_progress: 'warn', live: 'ok', needs_update: 'purple', paused: '' };
const PROJECT_ICON_KEYS = ['folder', 'chart', 'megaphone', 'chair', 'users', 'box', 'send', 'bolt', 'globe', 'code'];

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// Thai-friendly date helpers. Date-only strings (YYYY-MM-DD) are shown as-is in local calendar terms.
function dateOnly(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, m - 1, d);
}
function thaiDate(s, opts) {
  return dateOnly(s).toLocaleDateString('th-TH', opts || { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtDateTime(iso) {
  return new Date(iso).toLocaleString('th-TH', { timeZone: S.tz, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('th-TH', { timeZone: S.tz, hour: '2-digit', minute: '2-digit' });
}
function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function todayStr() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: S.tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function initials(name) {
  const t = String(name || '').trim();
  return t ? t.charAt(0).toUpperCase() : 'S';
}
function avatarHtml(user, cls = '') {
  if (user && user.avatarData) return `<div class="avatar ${cls}"><img src="${esc(user.avatarData)}" alt=""></div>`;
  return `<div class="avatar ${cls}">${esc(initials(user && (user.displayName || user.email)))}</div>`;
}

// ---------------------------------------------------------------- egg mascot (inline SVG)
function eggHtml({ cheer = false, size = 120 } = {}) {
  return `<div class="egg-wrap${cheer ? ' is-cheer' : ''}" style="--egg:${Number(size)}px" aria-hidden="true">
  <div class="egg-float">
    <svg class="egg" viewBox="0 0 200 200" role="img" aria-label="ไข่ดาว SIINA SYSTEM">
      <defs>
        <radialGradient id="yolkG" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#FFF3A3"/><stop offset=".45" stop-color="#FFD84D"/><stop offset="1" stop-color="#FFA726"/></radialGradient>
        <linearGradient id="cupG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF8DBE"/><stop offset="1" stop-color="#FF4F9A"/></linearGradient>
      </defs>
      <path d="M100 26c-36 0-64 12-80 38-13 21-9 52 8 74 15 19 39 30 72 30s57-11 72-30c17-22 21-53 8-74-16-26-44-38-80-38z" fill="#FFFFFF"/>
      <path d="M100 26c-36 0-64 12-80 38-13 21-9 52 8 74" fill="none" stroke="rgba(255,79,154,.18)" stroke-width="3"/>
      <circle cx="100" cy="98" r="40" fill="url(#yolkG)"/>
      <ellipse cx="86" cy="80" rx="10" ry="5" fill="#fff" opacity=".7" transform="rotate(-20 86 80)"/>
      <path d="M52 92C52 40 148 40 148 92" fill="none" stroke="#FF4F9A" stroke-width="8" stroke-linecap="round"/>
      <rect x="38" y="84" width="20" height="36" rx="9" fill="url(#cupG)"/>
      <rect x="142" y="84" width="20" height="36" rx="9" fill="url(#cupG)"/>
      <g class="eyes">
        <ellipse cx="84" cy="98" rx="5.5" ry="7.5" fill="#2A1D33"/>
        <ellipse cx="116" cy="98" rx="5.5" ry="7.5" fill="#2A1D33"/>
        <circle cx="86" cy="95" r="2" fill="#fff"/>
        <circle cx="118" cy="95" r="2" fill="#fff"/>
      </g>
      <g class="eyes-happy" fill="none" stroke="#2A1D33" stroke-width="3.5" stroke-linecap="round">
        <path d="M76 100q8-9 16 0"/><path d="M108 100q8-9 16 0"/>
      </g>
      <ellipse cx="72" cy="116" rx="9" ry="5" fill="#FF4F9A" opacity=".45"/>
      <ellipse cx="128" cy="116" rx="9" ry="5" fill="#FF4F9A" opacity=".45"/>
      <path d="M90 116q10 10 20 0" fill="none" stroke="#2A1D33" stroke-width="3" stroke-linecap="round"/>
      <path class="sparkle" d="M168 30l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill="#FFB7D5"/>
      <path class="sparkle" d="M30 46l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#FF4F9A"/>
    </svg>
  </div>
</div>`;
}

// ---------------------------------------------------------------- API client
async function api(method, path, body, headers = {}) {
  const init = { method, credentials: 'same-origin', headers: { ...headers } };
  if (body !== undefined) {
    init.headers['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(path, init);
  } catch (err) {
    throw Object.assign(new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่'), { status: 0, code: 'NETWORK' });
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!res.ok) {
    const message = (data && data.error) || 'เกิดข้อผิดพลาด กรุณาลองใหม่';
    const err = new Error(message);
    err.status = res.status;
    err.code = data && data.code;
    throw err;
  }
  return data;
}
const apiGet = (p) => api('GET', p);
const apiPost = (p, b, h) => api('POST', p, b === undefined ? {} : b, h);
const apiPatch = (p, b) => api('PATCH', p, b);
const apiPut = (p, b) => api('PUT', p, b);
const apiDelete = (p) => api('DELETE', p);

// ---------------------------------------------------------------- toast, modal, confirm
function toast(message, type = 'ok') {
  let box = $('#toasts');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toasts';
    box.className = 'toasts';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-live', 'polite');
    document.body.appendChild(box);
  }
  const el = document.createElement('div');
  el.className = `toast ${type === 'err' ? 'err' : 'ok'}`;
  el.textContent = message;
  box.appendChild(el);
  setTimeout(() => el.remove(), type === 'err' ? 5200 : 3200);
}

let modalStack = [];
function openModal({ title, body, footer = '', wide = false, onMount }) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `<div class="modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <header><h2>${esc(title)}</h2><button class="btn icon ghost" data-action="close-modal" aria-label="ปิด">${icon('close')}</button></header>
    <div class="modal-body">${body}</div>
    ${footer ? `<footer>${footer}</footer>` : ''}
  </div>`;
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) closeModal(overlay); });
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
  modalStack.push(overlay);
  if (onMount) onMount(overlay.querySelector('.modal'), overlay);
  const first = overlay.querySelector('input, select, textarea, button.primary, button');
  if (first) setTimeout(() => first.focus(), 30);
  return overlay;
}
function closeModal(overlay) {
  const el = overlay || modalStack[modalStack.length - 1];
  if (!el) return;
  el.remove();
  modalStack = modalStack.filter((m) => m !== el);
  if (!modalStack.length) document.body.style.overflow = '';
}
function closeAllModals() {
  while (modalStack.length) closeModal(modalStack[modalStack.length - 1]);
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (modalStack.length) closeModal();
    else if (S.popOpen) S.closePop && S.closePop();
  }
});

function confirmBox(message, { okText = 'ยืนยัน', danger = true } = {}) {
  return new Promise((resolve) => {
    const overlay = openModal({
      title: 'ยืนยันการทำรายการ',
      body: `<p>${esc(message)}</p>`,
      footer: `<button class="btn ghost" data-action="close-modal">ยกเลิก</button>
               <button class="btn ${danger ? 'danger' : 'primary'}" data-confirm="1">${esc(okText)}</button>`,
    });
    overlay.addEventListener('click', (e) => {
      const b = e.target.closest('[data-confirm]');
      if (b) { closeModal(overlay); resolve(true); }
    });
    overlay.addEventListener('click', (e) => { if (e.target.closest('[data-action="close-modal"]')) resolve(false); }, { once: true });
  });
}

// Keeps a button busy while an async action runs, and prevents double submits.
async function busy(btn, fn) {
  if (!btn) return fn();
  if (btn.dataset.busy) return undefined;
  btn.dataset.busy = '1';
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner" aria-hidden="true"></span>';
  try {
    return await fn();
  } finally {
    delete btn.dataset.busy;
    btn.disabled = false;
    btn.innerHTML = original;
  }
}

// Each new client key makes a new send; retries of the same attempt reuse the key.
function newKey() {
  return (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
}
