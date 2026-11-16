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

/* ---------------------------------------------------------------- login */
S.login = { email: '', expiresAt: 0, resendAt: 0 };

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
  const stage = S.login.expiresAt && S.login.step === 'otp' ? 'otp' : 'email';
  stage === 'otp' ? showOtpStage() : showEmailStage();
}

function setSteps(n) {
  $('#loginSteps').innerHTML = `
    <div class="step ${n >= 1 ? 'active' : ''}"><i>1</i>เข้าสู่ระบบ</div>
    <span class="bar ${n >= 2 ? 'on' : ''}"></span>
    <div class="step ${n >= 2 ? 'active' : ''}"><i>2</i>ยืนยัน OTP</div>`;
}

function showEmailStage(prefill = '') {
  clearLoginTimer();
  S.login.step = 'email';
  setSteps(1);
  $('#loginStage').innerHTML = `
    <h2>เข้าสู่ระบบด้วยอีเมล</h2>
    <p class="sub">กรอกอีเมลเพื่อรับรหัส OTP</p>
    <form data-form="login-email" novalidate>
      <label class="field"><span class="sr-only">อีเมล</span>
        <input class="input" type="email" name="email" autocomplete="email" inputmode="email" placeholder="กรอกอีเมลของคุณ" required value="${esc(prefill)}"></label>
      <p class="small" data-role="login-error" role="alert" style="color:var(--danger);min-height:1.4em;margin-top:8px"></p>
      <button class="btn primary block" type="submit">${icon('send')} ส่งรหัส OTP ไปยังอีเมล</button>
    </form>
    <div class="divider">หรือ</div>
    <div class="otp-info">${icon('mail', 'lg')}<span>เราจะส่งรหัส OTP (6 หลัก) ไปยังอีเมลของคุณ เพื่อยืนยันตัวตนในการเข้าสู่ระบบ</span></div>`;
  setTimeout(() => { const i = $('#loginStage input[name="email"]'); if (i) i.focus(); }, 30);
}

function showOtpStage() {
  S.login.step = 'otp';
  setSteps(2);
  $('#loginStage').innerHTML = `
    <h2>ยืนยันรหัส OTP</h2>
    <p class="sub">ส่งรหัสไปที่ ${esc(S.login.email)} แล้ว</p>
    <form data-form="login-otp" novalidate>
      <div class="otp-boxes" role="group" aria-label="รหัส OTP 6 หลัก">
        ${[0, 1, 2, 3, 4, 5].map((i) => `<input class="otp-digit" data-otp-box inputmode="numeric" autocomplete="${i === 0 ? 'one-time-code' : 'off'}" aria-label="หลักที่ ${i + 1}">`).join('')}
      </div>
      <p class="small muted" id="otpTimer" style="text-align:center;margin-top:8px"></p>
      <p class="small" data-role="login-error" role="alert" style="color:var(--danger);min-height:1.4em;text-align:center"></p>
      <button class="btn primary block" type="submit">${icon('check')} ยืนยันเข้าสู่ระบบ</button>
      <div class="otp-meta">
        <button type="button" class="btn sm ghost" data-action="login-change-email">${icon('chevLeft', 'sm')} เปลี่ยนอีเมล</button>
        <button type="button" class="btn sm ghost" data-action="login-resend" id="resendBtn">ส่งรหัส OTP ใหม่</button>
      </div>
    </form>`;
  startLoginTimer();
  setTimeout(() => { const i = $('[data-otp-box]'); if (i) i.focus(); }, 30);
}

function clearLoginTimer() {
  if (S.loginTimer) { clearInterval(S.loginTimer); S.loginTimer = null; }
}
function startLoginTimer() {
  clearLoginTimer();
  const tick = () => {
    const timer = $('#otpTimer');
    const btn = $('#resendBtn');
    if (!timer || !btn) return clearLoginTimer();
    const left = Math.max(0, Math.ceil((S.login.expiresAt - Date.now()) / 1000));
    const cool = Math.max(0, Math.ceil((S.login.resendAt - Date.now()) / 1000));
    timer.textContent = left > 0
      ? `รหัสมีอายุอีก ${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')} นาที`
      : 'รหัสหมดอายุแล้ว กรุณาขอรหัสใหม่';
    btn.disabled = cool > 0;
    btn.textContent = cool > 0 ? `ส่งรหัสใหม่ได้ใน ${cool} วินาที` : 'ส่งรหัส OTP ใหม่';
  };
  tick();
  S.loginTimer = setInterval(tick, 1000);
}

function loginError(form, message) {
  const el = form.querySelector('[data-role="login-error"]');
  if (el) el.textContent = message;
}

async function requestOtp(email) {
  const r = await apiPost('/api/auth/otp/request', { email });
  S.login.email = email;
  S.login.expiresAt = new Date(r.expiresAt).getTime();
  S.login.resendAt = Date.now() + r.resendAfterSeconds * 1000;
  return r;
}

FORMS['login-email'] = async (form) => {
  const email = form.email.value.trim();
  const btn = form.querySelector('button[type="submit"]');
  try {
    await busy(btn, () => requestOtp(email));
    showOtpStage();
  } catch (err) {
    if (err.code === 'OTP_COOLDOWN' || err.code === 'OTP_LIMIT') {
      // The code was already sent recently: continue to the code step.
      S.login.email = email;
      showOtpStage();
      toast(err.message, 'err');
      return;
    }
    loginError(form, err.message);
  }
};

FORMS['login-otp'] = async (form) => {
  const code = Array.from(form.querySelectorAll('[data-otp-box]')).map((i) => i.value).join('');
  if (!/^\d{6}$/.test(code)) { loginError(form, 'กรุณากรอกรหัส OTP 6 หลัก'); return; }
  const btn = form.querySelector('button[type="submit"]');
  try {
    await busy(btn, () => apiPost('/api/auth/otp/verify', { email: S.login.email, code }));
    clearLoginTimer();
    $('#loginStage').innerHTML = `<div style="text-align:center">${eggHtml({ cheer: true, size: 150 })}<h2 style="margin-top:12px">เข้าสู่ระบบสำเร็จ</h2></div>`;
    toast('เข้าสู่ระบบสำเร็จ');
    await sleep(1600);
    await boot();
  } catch (err) {
    loginError(form, err.message);
    if (err.code === 'OTP_EXPIRED' || err.code === 'OTP_LOCKED') S.login.expiresAt = 0;
    form.querySelectorAll('[data-otp-box]').forEach((i) => { i.value = ''; });
    const first = form.querySelector('[data-otp-box]');
    if (first) first.focus();
  }
};

ACTIONS['login-change-email'] = () => showEmailStage(S.login.email);
ACTIONS['login-resend'] = async (el) => {
  try {
    await busy(el, () => requestOtp(S.login.email));
    startLoginTimer();
    toast('ส่งรหัส OTP ใหม่ไปยังอีเมลแล้ว');
  } catch (err) {
    toast(err.message, 'err');
    if (err.code === 'OTP_COOLDOWN') { S.login.resendAt = Date.now() + 60000; startLoginTimer(); }
  }
};

/* OTP boxes: digits only, auto-advance, backspace, and paste of the whole code. */
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.matches && t.matches('[data-otp-box]')) {
    const boxes = Array.from(t.closest('.otp-boxes').querySelectorAll('[data-otp-box]'));
    const digits = t.value.replace(/\D/g, '');
    if (digits.length > 1) {
      // Autofill or a fast multi-character insert: spread the digits across the boxes.
      const start = boxes.indexOf(t);
      digits.slice(0, boxes.length - start).split('').forEach((d, i) => { boxes[start + i].value = d; });
      boxes[Math.min(start + digits.length, boxes.length) - 1].focus();
      return;
    }
    t.value = digits.slice(-1);
    if (t.value) {
      const next = t.nextElementSibling;
      if (next && next.matches('[data-otp-box]')) next.focus();
    }
  }
});
document.addEventListener('keydown', (e) => {
  const t = e.target;
  if (t.matches && t.matches('[data-otp-box]') && e.key === 'Backspace' && !t.value) {
    const prev = t.previousElementSibling;
    if (prev && prev.matches('[data-otp-box]')) { prev.value = ''; prev.focus(); }
  }
});
document.addEventListener('paste', (e) => {
  const t = e.target;
  if (!(t.matches && t.matches('[data-otp-box]'))) return;
  e.preventDefault();
  const digits = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6);
  const boxes = Array.from(t.closest('.otp-boxes').querySelectorAll('[data-otp-box]'));
  digits.split('').forEach((d, i) => { if (boxes[i]) boxes[i].value = d; });
  const last = boxes[Math.min(digits.length, 6) - 1];
  if (last) (boxes[digits.length] || last).focus();
});

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
