/* SIINA SYSTEM — boot, login (email OTP), app shell, router, notifications, global event delegation. */
'use strict';

const NAV = [
  { k: 'home', label: 'หน้าแรก', i: 'home' },
  { k: 'chat', label: 'ห้องแชท', i: 'chat' },
  { k: 'projects', label: 'โปรเจ็กต์', i: 'folder' },
  { k: 'calendar', label: 'ปฏิทิน', i: 'calendar' },
  { k: 'summary', label: 'สรุปสำคัญ', i: 'bell' },
  { k: 'settings', label: 'ตั้งค่า', i: 'settings' },
];
const PAGES = {
  home: renderHome, chat: renderChat, projects: renderProjects,
  calendar: renderCalendar, summary: renderSummary, settings: renderSettings,
};
const LOGIN_TILES = [
  ['n8n', 'Workflow'], ['Claude', 'AI'], ['GPT', 'AI'],
  ['Notion', 'Docs'], ['Slack', 'Chat'], ['Drive', 'Files'],
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------------------------------------------------------- boot */
async function loadMe() {
  const me = await apiGet('/api/me');
  S.user = me.user;
  S.settings = me.settings;
  S.tz = me.user.timezone || 'Asia/Bangkok';
}

function applyDisplaySettings() {
  const st = S.settings || {};
  document.documentElement.dataset.anim = st.animation || 'full';
  document.documentElement.style.fontSize = (st.fontScale || 100) + '%';
  const app = $('#app');
  if (app) app.classList.toggle('collapsed', !!st.sidebarCollapsed && !isNarrow());
}

const isNarrow = () => window.matchMedia('(max-width: 1023px)').matches;

async function boot() {
  try {
    await loadMe();
  } catch (err) {
    S.user = null;
    renderLogin();
    return;
  }
  applyDisplaySettings();
  renderShell();
  if (!location.hash) history.replaceState(null, '', '#/home');
  route();
  refreshBell();
  if (!S.bellTimer) S.bellTimer = setInterval(refreshBell, 30000);
}

/* ---------------------------------------------------------------- login (email + password) */
S.login = { email: '', mode: 'login' };

function renderLogin() {
  if (S.bellTimer) { clearInterval(S.bellTimer); S.bellTimer = null; }
  // The mockup scene is the background; the live form sits on top of the card area drawn in it.
  document.body.innerHTML = `
  <div class="login">
    <h1 class="sr-only">SIINA SYSTEM ศูนย์กลางการทำงานและจัดการระบบ</h1>
    <div class="login-stage">
      <img class="login-bg" src="/assets/login-scene.webp" alt="" aria-hidden="true" width="1672" height="941">
      <div class="login-card" id="loginCard">
        <div class="steps" id="loginSteps"></div>
        <div id="loginStage"></div>
      </div>
    </div>
  </div>`;
  showEmailStage(S.login.email);
}

function setSteps(n) {
  $('#loginSteps').innerHTML = `
    <div class="step ${n >= 1 ? 'active' : ''}"><i>1</i>เข้าสู่ระบบ</div>
    <span class="bar ${n >= 2 ? 'on' : ''}"></span>
    <div class="step ${n >= 2 ? 'active' : ''}"><i>2</i>${S.login.mode === 'setup' ? 'ตั้งรหัสผ่าน' : 'รหัสผ่าน'}</div>`;
}

function loginError(form, message) {
  const el = form.querySelector('[data-role="login-error"]');
  if (el) el.textContent = message;
}

function showEmailStage(prefill = '') {
  S.login.mode = 'login';
  setSteps(1);
  $('#loginStage').innerHTML = `
    <h2>เข้าสู่ระบบด้วยอีเมล</h2>
    <p class="sub">กรอกอีเมลและรหัสผ่านของคุณ</p>
    <form data-form="login-email" novalidate>
      <label class="field"><span class="sr-only">อีเมล</span>
        <input class="input" type="email" name="email" autocomplete="username" inputmode="email" placeholder="กรอกอีเมลของคุณ" required value="${esc(prefill)}"></label>
      <p class="small" data-role="login-error" role="alert" style="color:var(--danger);min-height:1.4em;margin-top:8px"></p>
      <button class="btn primary block" type="submit">${icon('send')} ถัดไป</button>
    </form>
    <div class="divider">หรือ</div>
    <div class="otp-info">${icon('shield', 'lg')}<span>ครั้งแรกที่เข้าระบบ ให้ตั้งรหัสผ่านหนึ่งครั้ง หลังจากนั้นเข้าสู่ระบบด้วยอีเมลและรหัสผ่านตามปกติ</span></div>`;
  setTimeout(() => { const i = $('#loginStage input[name="email"]'); if (i) i.focus(); }, 30);
}

function showPasswordStage() {
  S.login.mode = 'login';
  setSteps(2);
  $('#loginStage').innerHTML = `
    <h2>เข้าสู่ระบบ</h2>
    <p class="sub">${esc(S.login.email)}</p>
    <form data-form="login-password" novalidate>
      <label class="field"><span class="sr-only">รหัสผ่าน</span>
        <input class="input" type="password" name="password" autocomplete="current-password" placeholder="รหัสผ่าน" required></label>
      <p class="small" data-role="login-error" role="alert" style="color:var(--danger);min-height:1.4em;margin-top:8px"></p>
      <button class="btn primary block" type="submit">${icon('check')} เข้าสู่ระบบ</button>
      <div class="otp-meta"><button type="button" class="btn sm ghost" data-action="login-change-email">${icon('chevLeft', 'sm')} เปลี่ยนอีเมล</button></div>
    </form>`;
  setTimeout(() => { const i = $('#loginStage input[name="password"]'); if (i) i.focus(); }, 30);
}

function showSetupStage() {
  S.login.mode = 'setup';
  setSteps(2);
  $('#loginStage').innerHTML = `
    <h2>ตั้งรหัสผ่านครั้งแรก</h2>
    <p class="sub">${esc(S.login.email)} · อย่างน้อย 10 ตัวอักษร</p>
    <form data-form="login-setup" novalidate>
      <label class="field"><span class="sr-only">รหัสผ่านใหม่</span>
        <input class="input" type="password" name="password" autocomplete="new-password" placeholder="รหัสผ่านใหม่" required minlength="10"></label>
      <label class="field" style="margin-top:10px"><span class="sr-only">ยืนยันรหัสผ่าน</span>
        <input class="input" type="password" name="confirm" autocomplete="new-password" placeholder="ยืนยันรหัสผ่านอีกครั้ง" required minlength="10"></label>
      <p class="small" data-role="login-error" role="alert" style="color:var(--danger);min-height:1.4em;margin-top:8px"></p>
      <button class="btn primary block" type="submit">${icon('check')} บันทึกรหัสผ่านและเข้าสู่ระบบ</button>
      <div class="otp-meta"><button type="button" class="btn sm ghost" data-action="login-change-email">${icon('chevLeft', 'sm')} เปลี่ยนอีเมล</button></div>
    </form>`;
  setTimeout(() => { const i = $('#loginStage input[name="password"]'); if (i) i.focus(); }, 30);
}

async function enterAfterLogin(form) {
  $('#loginStage').innerHTML = `<div style="text-align:center">${eggHtml({ cheer: true, size: 150 })}<h2 style="margin-top:12px">เข้าสู่ระบบสำเร็จ</h2></div>`;
  toast('เข้าสู่ระบบสำเร็จ');
  await sleep(1400);
  await boot();
}

FORMS['login-email'] = async (form) => {
  const email = form.email.value.trim();
  const btn = form.querySelector('button[type="submit"]');
  try {
    const r = await busy(btn, () => apiPost('/api/auth/check', { email }));
    S.login.email = email;
    if (r.mode === 'setup') showSetupStage(); else showPasswordStage();
  } catch (err) {
    loginError(form, err.message);
  }
};

FORMS['login-password'] = async (form) => {
  const password = form.password.value;
  const btn = form.querySelector('button[type="submit"]');
  try {
    await busy(btn, () => apiPost('/api/auth/login', { email: S.login.email, password }));
    await enterAfterLogin(form);
  } catch (err) {
    if (err.code === 'SETUP_REQUIRED') { showSetupStage(); toast(err.message, 'err'); return; }
    loginError(form, err.message);
    form.password.value = '';
    form.password.focus();
  }
};

FORMS['login-setup'] = async (form) => {
  const password = form.password.value;
  const confirm = form.confirm.value;
  const btn = form.querySelector('button[type="submit"]');
  try {
    await busy(btn, () => apiPost('/api/auth/setup', { email: S.login.email, password, confirm }));
    await enterAfterLogin(form);
  } catch (err) {
    if (err.code === 'ALREADY_SET') { showPasswordStage(); toast(err.message, 'err'); return; }
    loginError(form, err.message);
  }
};

ACTIONS['login-change-email'] = () => showEmailStage(S.login.email);

/* ---------------------------------------------------------------- shell */
function renderShell() {
  const collapsed = !!S.settings.sidebarCollapsed && !isNarrow();
  document.body.innerHTML = `
  <div class="app${collapsed ? ' collapsed' : ''}" id="app">
    <aside class="sidebar" id="sidebar" aria-label="เมนูหลัก">
      <div class="brand-mini">${eggHtml({ size: 42 })}<span class="name">SIINA <span>SYSTEM</span></span></div>
      <nav class="nav" aria-label="เมนูหลัก">
        ${NAV.map((n) => `<a href="#/${n.k}" data-nav="${n.k}" title="${esc(n.label)}">${icon(n.i)}<span>${esc(n.label)}</span>${n.k === 'chat' ? '<span class="count" id="chatNavCount" hidden></span>' : ''}</a>`).join('')}
      </nav>
      <div class="side-foot">
        <div class="profile">${avatarHtml(S.user)}
          <div class="who"><b>${esc(S.user.displayName || S.user.email)}</b><small>${esc(S.user.email)}</small><span class="online">ออนไลน์</span></div>
        </div>
        <button class="btn sm" data-action="logout" aria-label="ออกจากระบบ">${icon('logout')}<span class="hide-collapsed">ออกจากระบบ</span></button>
      </div>
    </aside>
    <div class="scrim" id="scrim" hidden data-action="close-drawer"></div>
    <div class="main">
      <header class="topbar">
        <button class="btn icon menu-btn" data-action="toggle-sidebar" aria-label="ย่อ / ขยายเมนู">${icon('menu')}</button>
        <div class="title"><h1 id="topTitle"></h1><p id="topDesc"></p></div>
        <div class="pop-wrap" id="bellWrap">
          <button class="btn icon bell" id="bellBtn" data-action="bell" aria-label="การแจ้งเตือน" aria-expanded="false">${icon('bell')}<span class="count" id="bellCount" hidden></span></button>
          <div class="pop" id="bellPop" hidden></div>
        </div>
      </header>
      <div id="page" class="page"></div>
    </div>
  </div>`;
  applyDisplaySettings();
}

function setNavState(page) {
  $$('[data-nav]').forEach((a) => {
    if (a.dataset.nav === page) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

function closeDrawer() {
  const sb = $('#sidebar');
  if (sb) sb.classList.remove('open');
  const sc = $('#scrim');
  if (sc) sc.hidden = true;
}

ACTIONS['toggle-sidebar'] = async () => {
  if (isNarrow()) {
    $('#sidebar').classList.add('open');
    $('#scrim').hidden = false;
    return;
  }
  const app = $('#app');
  const collapsed = !app.classList.contains('collapsed');
  app.classList.toggle('collapsed', collapsed);
  S.settings.sidebarCollapsed = collapsed;
  apiPut('/api/settings', { sidebarCollapsed: collapsed }).catch(() => null);
};
ACTIONS['close-drawer'] = () => closeDrawer();
ACTIONS['close-modal'] = () => closeModal();
ACTIONS['logout'] = async () => {
  await apiPost('/api/auth/logout').catch(() => null);
  S.user = null;
  location.hash = '';
  renderLogin();
};

/* ---------------------------------------------------------------- router */
function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [name, qs = ''] = raw.split('?');
  return { name, params: Object.fromEntries(new URLSearchParams(qs)) };
}

function navigate(hash) {
  if (location.hash === hash) rerender();
  else location.hash = hash;
}

function rerender() {
  route();
}

function clearTimers() {
  (S.timers || []).forEach((t) => clearInterval(t));
  S.timers = [];
}

let routeSeq = 0;
async function route() {
  if (!S.user) return;
  clearTimers();
  closeAllModals();
  hidePop();
  let { name, params } = parseHash();
  if (!PAGES[name]) {
    name = 'home';
    history.replaceState(null, '', '#/home');
    params = {};
  }
  S.route = name;
  setNavState(name);
  closeDrawer();
  const seq = ++routeSeq;
  try {
    await PAGES[name](params);
  } catch (err) {
    if (seq !== routeSeq) return;
    if (err.status === 401) { renderLogin(); return; }
    fillPage(`<div class="card" style="text-align:center;padding:30px">
      <p style="margin-bottom:14px">${esc(err.message || 'โหลดหน้านี้ไม่สำเร็จ')}</p>
      <button class="btn" data-action="retry">${icon('refresh')} ลองอีกครั้ง</button></div>`);
  }
}
ACTIONS['retry'] = () => rerender();
window.addEventListener('hashchange', () => { if (S.user) route(); });

/* ---------------------------------------------------------------- notifications */
async function refreshBell() {
  if (!S.user) return;
  try {
    const { items } = await apiGet('/api/notifications?unread=1');
    const badge = $('#bellCount');
    if (badge) {
      badge.textContent = items.length > 9 ? '9+' : String(items.length);
      badge.hidden = items.length === 0;
    }
  } catch (_) { /* keep last value */ }
}

function hidePop() {
  const pop = $('#bellPop');
  if (pop) pop.hidden = true;
  const btn = $('#bellBtn');
  if (btn) btn.setAttribute('aria-expanded', 'false');
  S.popOpen = false;
}
S.closePop = hidePop;

ACTIONS['bell'] = async () => {
  const pop = $('#bellPop');
  if (!pop.hidden) { hidePop(); return; }
  const { items } = await apiGet('/api/notifications');
  pop.innerHTML = `
    <div class="row between" style="margin-bottom:10px"><b>การแจ้งเตือน</b>
      <button class="btn sm ghost" data-action="notif-read-all">อ่านทั้งหมด</button></div>
    ${items.length ? `<div class="list">${items.slice(0, 30).map((n) => `
      <div class="item" data-action="notif-open" data-id="${esc(n.id)}" data-source="${esc(n.sourceType)}" data-ref="${esc(n.sourceId)}" style="${n.readAt ? 'opacity:.6' : ''}">
        ${icon('bell', 'sm')}<div class="meta"><b class="ellipsis">${esc(n.title)}</b><small>${esc(fmtDateTime(n.remindAt))}</small></div>
      </div>`).join('')}</div>` : '<div class="empty">ยังไม่มีการแจ้งเตือน</div>'}`;
  pop.hidden = false;
  $('#bellBtn').setAttribute('aria-expanded', 'true');
  S.popOpen = true;
};

document.addEventListener('click', (e) => {
  if (S.popOpen && !e.target.closest('#bellWrap')) hidePop();
});

/* ---------------------------------------------------------------- global event wiring */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const fn = ACTIONS[el.dataset.action];
  if (!fn) return;
  Promise.resolve(fn(el, e)).catch((err) => toast(err.message || 'เกิดข้อผิดพลาด', 'err'));
});

document.addEventListener('keydown', (e) => {
  // Keyboard access for clickable cards and list items.
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[role="button"][data-action]')) {
    e.preventDefault();
    e.target.click();
  }
  if (e.key === 'Enter' && e.target.matches && e.target.matches('[data-action="cal-day"]')) e.target.click();
});

document.addEventListener('submit', (e) => {
  const form = e.target;
  const name = form.dataset && form.dataset.form;
  if (!name) return;
  e.preventDefault();
  const fn = FORMS[name];
  if (!fn) return;
  Promise.resolve(fn(form)).catch((err) => toast(err.message || 'เกิดข้อผิดพลาด', 'err'));
});

document.addEventListener('change', (e) => {
  const name = e.target.dataset && e.target.dataset.change;
  if (!name || !CHANGES[name]) return;
  Promise.resolve(CHANGES[name](e.target)).catch((err) => toast(err.message || 'เกิดข้อผิดพลาด', 'err'));
});

let projSearchTimer = null;
document.addEventListener('input', (e) => {
  const t = e.target;
  if (!t.dataset) return;
  if (t.dataset.input === 'font-scale') {
    const label = $('#fontScaleVal');
    if (label) label.textContent = t.value;
    return;
  }
  if (t.dataset.input === 'proj-search') {
    clearTimeout(projSearchTimer);
    projSearchTimer = setTimeout(async () => {
      S.projQuery = t.value.trim();
      try {
        const q = new URLSearchParams({ filter: S.projFilter, q: S.projQuery });
        const { items } = await apiGet('/api/projects?' + q.toString());
        const grid = $('#projGrid');
        if (grid) grid.innerHTML = projectsGridHtml(items);
      } catch (err) { toast(err.message, 'err'); }
    }, 250);
  }
});

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
