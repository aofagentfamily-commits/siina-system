/* SIINA SYSTEM — pages, popups and actions. All user-provided text goes through esc(). */
'use strict';

const ACTIONS = {};   // data-action="name" click handlers
const FORMS = {};     // <form data-form="name"> submit handlers
const CHANGES = {};   // data-change="name" change handlers
const PAGE_TITLES = {
  home: 'หน้าแรก', desktop: 'My Desktop', chat: 'ห้องแชท', projects: 'โปรเจ็กต์', calendar: 'ปฏิทิน', summary: 'สรุปสำคัญ', settings: 'ตั้งค่า',
};
const SUM_CATEGORY = { all: 'ทั้งหมด', urgent: 'เร่งด่วน', reply: 'ต้องตอบ', assigned: 'งานที่ได้รับมอบหมาย', info: 'เรื่องแจ้งให้ทราบ', follow: 'ติดตามภายหลัง', done: 'เสร็จแล้ว' };
const SUM_STATE = { open: ['ยังไม่ดำเนินการ', ''], read: ['อ่านแล้ว', 'ok'], follow: ['ติดตามภายหลัง', 'purple'], done: ['เสร็จสิ้น', 'ok'] };
const TZ_OPTIONS = ['Asia/Bangkok', 'Asia/Tokyo', 'Asia/Singapore', 'Asia/Shanghai', 'Europe/London', 'Europe/Paris', 'America/New_York', 'America/Los_Angeles', 'Australia/Sydney', 'UTC'];

const safeColor = (c) => (/^#[0-9a-fA-F]{6}$/.test(c || '') ? c : '#FF4F9A');
const reminderLabel = (m) => {
  if (m == null) return 'ไม่มีการแจ้งเตือน';
  const f = REMINDERS.find((r) => r.v === String(m));
  return f ? f.label : `ก่อน ${m} นาที`;
};
function symBubble(symbol, color) {
  return `<span class="sym-bubble" style="color:${safeColor(color)}">${icon(symbol, 'lg')}</span>`;
}
function statCard(href, ico, label, value) {
  return `<a class="card hoverable card-link stat" href="${href}">
    <span class="ico">${icon(ico)}</span>
    <span class="num">${Number(value) || 0}</span>
    <span class="lbl">${esc(label)}</span>
  </a>`;
}
function emptyBox(text) {
  return `<div class="empty">${esc(text)}</div>`;
}
function setPageHead(title, desc) {
  const h = $('#topTitle');
  if (h) h.textContent = title;
  const p = $('#topDesc');
  if (p) p.textContent = desc || '';
}
function fillPage(html) {
  const root = $('#page');
  root.innerHTML = html;
  return root;
}
function fmtRange(ev) {
  const date = ev.startDate === (ev.endDate || ev.startDate)
    ? thaiDate(ev.startDate)
    : `${thaiDate(ev.startDate)} – ${thaiDate(ev.endDate || ev.startDate)}`;
  const time = ev.startTime ? ` · ${ev.startTime}${ev.endTime ? ' – ' + ev.endTime : ''} น.` : ' · ทั้งวัน';
  return date + time;
}
function reminderStatus(ev) {
  if (ev.reminderMinutes == null) return '<span class="badge">ไม่มีการเตือน</span>';
  if (ev.reminderSentAt) return '<span class="badge ok dot">แจ้งเตือนแล้ว</span>';
  return `<span class="badge pink dot">${esc(reminderLabel(ev.reminderMinutes))}</span>`;
}

/* ================================================================ HOME */
async function renderHome() {
  setPageHead(PAGE_TITLES.home, 'ภาพรวมงานและข้อความสำคัญ');
  const d = await apiGet('/api/dashboard');
  const todays = d.todayEvents || [];
  const todoToday = todays.filter((e) => ['todo', 'work'].includes(e.category));
  const apptToday = todays.filter((e) => e.category === 'appointment');
  const dueToday = d.dueToday || [];
  const notes = d.notifications || [];
  const replies = d.replyNeeded || [];
  const dateText = thaiDate(d.today, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  fillPage(`
    <section class="hero">
      ${eggHtml({ size: 96 })}
      <div class="grow">
        <p class="date">${esc(dateText)}</p>
        <h2>ยินดีต้อนรับสู่ SIINA SYSTEM</h2>
        <p class="muted">${esc(S.user.displayName || S.user.email)} · ศูนย์กลางงานและข้อความของคุณ</p>
      </div>
    </section>

    <section class="grid-stats">
      ${statCard('#/summary', 'bell', 'ข้อความสำคัญที่ยังไม่ได้อ่าน', d.unreadImportant)}
      ${statCard('#/projects', 'folder', 'โปรเจ็กต์ทั้งหมด', d.projectsTotal)}
      ${statCard('#/projects?filter=in_progress', 'chart', 'โปรเจ็กต์ที่กำลังดำเนินการ', d.projectsInProgress)}
      ${statCard('#/calendar?tab=appointment', 'calendar', 'นัดหมายที่กำลังจะมาถึง (7 วัน)', d.upcomingAppointments)}
      ${statCard('#/calendar?tab=due', 'clock', 'งานที่ใกล้ครบกำหนด (7 วัน)', d.nearDue)}
      ${statCard('#/summary?tab=follow', 'bookmark', 'รายการที่ติดตามภายหลัง', d.followCount)}
    </section>

    <section>
      <div class="page-head"><div><h2>งานสำคัญวันนี้</h2><p>${esc(thaiDate(d.today))}</p></div></div>
      <div class="grid-2" style="margin-top:14px">
        <div class="card"><div class="head"><h3>งานที่ต้องทำวันนี้</h3><a href="#/calendar?tab=mine">ดูทั้งหมด</a></div>
          ${todoToday.length ? `<div class="list">${todoToday.map(todayItem).join('')}</div>` : emptyBox('ไม่มีงานที่ต้องทำวันนี้')}</div>
        <div class="card"><div class="head"><h3>นัดหมายวันนี้</h3><a href="#/calendar?tab=appointment">ดูทั้งหมด</a></div>
          ${apptToday.length ? `<div class="list">${apptToday.map(todayItem).join('')}</div>` : emptyBox('ไม่มีนัดหมายวันนี้')}</div>
        <div class="card"><div class="head"><h3>งานที่ครบกำหนดส่ง</h3><a href="#/calendar?tab=due">ดูทั้งหมด</a></div>
          ${dueToday.length ? `<div class="list">${dueToday.map(todayItem).join('')}</div>` : emptyBox('ไม่มีงานครบกำหนดวันนี้')}</div>
        <div class="card"><div class="head"><h3>ข้อความ Telegram ที่ต้องตอบ</h3><a href="#/summary?tab=reply">ดูทั้งหมด</a></div>
          ${replies.length ? `<div class="list">${replies.map((r) => `
            <div class="item" data-action="summary-open" data-type="${esc(r.sourceType)}" data-id="${esc(r.sourceId)}" data-target='${esc(JSON.stringify(r.target))}'>
              ${icon('reply')}<div class="meta"><b class="ellipsis">${esc(r.title)}</b><small class="ellipsis">${esc(r.source)} · ${esc(r.summary)}</small></div>
            </div>`).join('')}</div>` : emptyBox('ไม่มีข้อความที่รอการตอบ')}</div>
        <div class="card"><div class="head"><h3>รายการแจ้งเตือน</h3><button class="btn sm ghost" data-action="notif-read-all">อ่านทั้งหมด</button></div>
          ${notes.length ? `<div class="list">${notes.map((n) => `
            <div class="item" data-action="notif-open" data-id="${esc(n.id)}" data-source="${esc(n.sourceType)}" data-ref="${esc(n.sourceId)}">
              ${icon('bell')}<div class="meta"><b class="ellipsis">${esc(n.title)}</b><small>${esc(fmtDateTime(n.remindAt))}</small></div>
            </div>`).join('')}</div>` : emptyBox('ไม่มีการแจ้งเตือนที่ยังไม่ได้อ่าน')}</div>
      </div>
    </section>

    <section>
      <h3 style="margin-bottom:12px">ทางลัด</h3>
      <div class="quick">
        <button class="btn" data-action="project-new">${icon('plus')} เพิ่มโปรเจ็กต์</button>
        <button class="btn" data-action="event-new">${icon('calendar')} เพิ่มนัดหมาย</button>
        <a class="btn" href="#/chat">${icon('chat')} เปิดห้องแชท</a>
        <a class="btn" href="#/summary">${icon('bell')} ดูสรุปสำคัญ</a>
      </div>
    </section>`);
}

function todayItem(e) {
  return `<div class="item" data-action="event-detail" data-id="${esc(e.id)}">
    ${symBubble(e.symbol, e.color)}
    <div class="meta"><b class="ellipsis">${esc(e.title)}</b><small>${esc(e.startTime ? e.startTime + ' น.' : 'ทั้งวัน')} · ${esc(CATEGORIES[e.category] || '')}</small></div>
  </div>`;
}

/* ================================================================ PROJECTS */
S.projFilter = 'all';
S.projQuery = '';
const PROJECT_FILTERS = [
  ['all', 'ทั้งหมด'], ['in_progress', 'กำลังทำ'], ['live', 'ใช้งานจริง'], ['needs_update', 'รอปรับปรุง'],
  ['paused', 'พักไว้'], ['favorite', 'รายการโปรด'], ['archived', 'คลังจัดเก็บ'],
];

async function renderProjects(params) {
  setPageHead(PAGE_TITLES.projects, 'โปรเจ็กต์และเว็บไซต์ทั้งหมดที่คุณสร้างไว้');
  if (params && params.filter) S.projFilter = params.filter;
  const q = new URLSearchParams({ filter: S.projFilter, q: S.projQuery });
  const { items } = await apiGet('/api/projects?' + q.toString());
  fillPage(`
    <div class="page-head">
      <div><h2>โปรเจ็กต์</h2><p>รวมโปรเจ็กต์ทั้งหมดที่กำลังทำและใช้งาน</p></div>
      <button class="btn primary" data-action="project-new">${icon('plus')} เพิ่มโปรเจ็กต์</button>
    </div>
    <div class="row wrap">
      <label class="search">${icon('search')}<span class="sr-only">ค้นหาชื่อโปรเจ็กต์</span>
        <input class="input" type="search" placeholder="ค้นหาโปรเจ็กต์..." value="${esc(S.projQuery)}" data-input="proj-search"></label>
    </div>
    <div class="tabs" role="tablist">
      ${PROJECT_FILTERS.map(([k, label]) => `<button class="tab" role="tab" aria-selected="${S.projFilter === k}" data-action="proj-filter" data-filter="${k}">${esc(label)}</button>`).join('')}
    </div>
    <div id="projGrid">${projectsGridHtml(items)}</div>
  `);
}

function projectsGridHtml(items) {
  return items.length
    ? `<div class="proj-grid">${items.map(projectCard).join('')}</div>`
    : emptyBox('ยังไม่มีโปรเจ็กต์ในหมวดนี้');
}

function projectCard(p) {
  const img = p.imageData ? `<img src="${esc(p.imageData)}" alt="">` : icon(PROJECT_ICON_KEYS.includes(p.icon) ? p.icon : 'folder', 'lg');
  const cls = PROJECT_STATUS_CLASS[p.status] || '';
  return `<article class="card hoverable proj">
    <div class="top">
      <div class="ico-box">${img}</div>
      <div class="title"><h3>${esc(p.name)}</h3><small>${esc(p.category || 'ไม่ระบุหมวดหมู่')}</small></div>
      <button class="star" data-action="proj-fav" data-id="${esc(p.id)}" aria-pressed="${p.isFavorite}" aria-label="รายการโปรด">${icon('star')}</button>
    </div>
    <p class="desc">${esc(p.description)}</p>
    <div class="foot">
      <span class="badge ${cls} dot">${esc(PROJECT_STATUS[p.status] || p.status)}</span>
      <span>อัปเดต ${esc(new Date(p.updatedAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }))}</span>
    </div>
    <div class="actions">
      <button class="btn sm" data-action="proj-open" data-id="${esc(p.id)}" title="เปิดโปรเจ็กต์" ${p.openUrl ? '' : 'disabled'}>${icon('external')}<span>เปิด</span></button>
      <button class="btn sm" data-action="proj-code" data-id="${esc(p.id)}" title="เปิดหน้าแก้ไขโค้ด" ${p.editorUrl ? '' : 'disabled'}>${icon('code')}<span>แก้โค้ด</span></button>
      <button class="btn sm" data-action="proj-edit" data-id="${esc(p.id)}" title="แก้ไขข้อมูลโปรเจ็กต์">${icon('edit')}<span>แก้ไข</span></button>
      <button class="btn sm" data-action="proj-detail" data-id="${esc(p.id)}" title="ตั้งค่า">${icon('settings')}<span>ตั้งค่า</span></button>
      <button class="btn sm" data-action="proj-archive" data-id="${esc(p.id)}" data-archived="${p.archived}" title="${p.archived ? 'นำกลับมาใช้งาน' : 'จัดเก็บ / ย้ายไปคลัง'}">${icon('archive')}<span>${p.archived ? 'คืนค่า' : 'คลัง'}</span></button>
    </div>
  </article>`;
}

// ---------------------------------------------------------------- project form (add / edit)
function pjCurrentImage() {
  return S.pendingImage !== undefined ? S.pendingImage : S.pjCurrentImage;
}
function pjRefreshPreview() {
  const box = $('#pjPreview');
  const form = document.querySelector('form[data-form="project"]');
  if (!box || !form) return;
  const img = pjCurrentImage();
  const iconKey = form.querySelector('[name="icon"]').value;
  box.innerHTML = img
    ? `<img src="${esc(img)}" alt="ไอคอนโปรเจ็กต์ที่อัปโหลด">`
    : `<span class="pj-preview-icon">${icon(PROJECT_ICON_KEYS.includes(iconKey) ? iconKey : 'folder', 'lg')}</span>`;
}

async function openProjectForm(id) {
  const p = id ? await apiGet('/api/projects/' + id) : {
    name: '', category: '', description: '', icon: 'folder', status: 'in_progress',
    openUrl: '', editorUrl: '', isFavorite: false, imageData: null,
  };
  S.pendingImage = undefined; // undefined = unchanged, null = removed, string = new picture
  S.pjCurrentImage = p.imageData || null;
  const overlay = openModal({
    title: id ? 'แก้ไขโปรเจ็กต์' : 'เพิ่มโปรเจ็กต์',
    wide: true,
    body: `<form data-form="project" data-id="${esc(id || '')}" class="pj-form" novalidate>
      <section class="pj-section">
        <h4>ไอคอนโปรเจ็กต์</h4>
        <div class="pj-icon-row">
          <div class="pj-preview" id="pjPreview"></div>
          <div class="pj-icon-choices">
            <div class="icon-pick" role="group" aria-label="ไอคอนสำเร็จรูป">
              ${PROJECT_ICON_KEYS.map((k) => `<button type="button" aria-label="${k}" aria-pressed="${p.icon === k}" data-action="pick-icon" data-value="${k}">${icon(k)}</button>`).join('')}
            </div>
            <div class="pj-upload-row">
              <button type="button" class="btn sm primary" data-action="pj-upload">${icon('upload', 'sm')} อัปโหลดไอคอน</button>
              <button type="button" class="btn sm ghost" data-action="project-image-clear">${icon('trash2', 'sm')} ลบรูป</button>
            </div>
            <small class="muted">รองรับ PNG, JPG, WebP ไม่เกิน 300 KB ระบบครอบเป็นสี่เหลี่ยมจัตุรัสให้ได้ รูปที่อัปโหลดจะแทนไอคอนสำเร็จรูป</small>
          </div>
        </div>
        <input type="hidden" name="icon" value="${esc(p.icon)}">
      </section>
      <section class="pj-section">
        <div class="form-grid">
          <label class="field full"><span>ชื่อโปรเจ็กต์ *</span><input class="input" name="name" required maxlength="120" value="${esc(p.name)}"></label>
          <label class="field"><span>หมวดหมู่</span><input class="input" name="category" maxlength="60" list="cat-list" value="${esc(p.category)}"></label>
          <datalist id="cat-list"><option value="ภายในองค์กร AOF"></option><option value="ระบบภายใน"></option><option value="แดชบอร์ด / รายงาน"></option><option value="ประกาศ / สื่อสารภายใน"></option><option value="งานธุรการ / พัสดุ"></option></datalist>
          <label class="field"><span>สถานะโปรเจ็กต์</span><select class="select" name="status">
            ${Object.entries(PROJECT_STATUS).map(([k, v]) => `<option value="${k}" ${p.status === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}
          </select></label>
          <label class="field full"><span>คำอธิบาย</span><textarea class="textarea" name="description" maxlength="500" rows="2">${esc(p.description)}</textarea></label>
          <label class="field full"><span>URL สำหรับเปิดโปรเจ็กต์</span><input class="input" name="openUrl" type="url" placeholder="https://..." value="${esc(p.openUrl || '')}"></label>
          <label class="field full"><span>URL สำหรับแก้ไขโค้ด</span><input class="input" name="editorUrl" type="url" placeholder="https://..." value="${esc(p.editorUrl || '')}"></label>
        </div>
      </section>
      <input type="hidden" name="isFavorite" value="${p.isFavorite ? 1 : 0}">
      <div class="full small" data-role="form-error" role="alert"></div>
      <div class="pj-actions">
        <button type="button" class="btn ghost" data-action="close-modal">ยกเลิก</button>
        <button type="submit" class="btn primary">${icon('save', 'sm')} บันทึกการเปลี่ยนแปลง</button>
      </div>
    </form>`,
    onMount: (modal) => {
      // Favorite star sits in the header, left of the close button. It is saved only with the form.
      const header = modal.querySelector('header');
      const close = header.querySelector('[data-action="close-modal"]');
      const star = document.createElement('button');
      const form = modal.querySelector('form[data-form="project"]');
      const fav = form.querySelector('[name="isFavorite"]');
      star.type = 'button';
      star.className = 'pj-star' + (fav.value === '1' ? ' on' : '');
      star.setAttribute('aria-pressed', fav.value === '1' ? 'true' : 'false');
      star.setAttribute('aria-label', 'รายการโปรด');
      star.title = 'รายการโปรด';
      star.innerHTML = icon('star');
      star.addEventListener('click', () => {
        const on = fav.value !== '1';
        fav.value = on ? '1' : '0';
        star.classList.toggle('on', on);
        star.setAttribute('aria-pressed', String(on));
      });
      header.insertBefore(star, close);
      pjRefreshPreview();
    },
  });
  return overlay;
}

FORMS.project = async (form) => {
  const fd = new FormData(form);
  const id = form.dataset.id;
  // startDate and notes are no longer shown; they are not sent, so the stored values stay as they are.
  const body = {
    name: fd.get('name'),
    category: fd.get('category'),
    description: fd.get('description'),
    icon: fd.get('icon'),
    status: fd.get('status'),
    openUrl: fd.get('openUrl'),
    editorUrl: fd.get('editorUrl'),
    isFavorite: fd.get('isFavorite') === '1',
  };
  if (S.pendingImage !== undefined) body.imageData = S.pendingImage;
  const btn = form.querySelector('[type="submit"]');
  try {
    await busy(btn, () => (id ? apiPatch('/api/projects/' + id, body) : apiPost('/api/projects', body)));
    projectNameCache = null;
    closeAllModals();
    toast(id ? 'บันทึกการแก้ไขโปรเจ็กต์แล้ว' : 'เพิ่มโปรเจ็กต์แล้ว');
    rerender();
  } catch (err) {
    setFormError(form, err.message);
  }
};

function setFormError(form, message) {
  const el = form.querySelector('[data-role="form-error"]');
  if (el) { el.textContent = message; el.style.color = 'var(--danger)'; }
}

CHANGES['project-image'] = (el) => {
  const file = el.files && el.files[0];
  if (!file) return;
  if (file.size > 300 * 1024) { toast('รูปภาพใหญ่เกินไป (ไม่เกิน 300 KB)', 'err'); el.value = ''; return; }
  const reader = new FileReader();
  reader.onload = () => { S.pendingImage = reader.result; toast('เลือกรูปภาพแล้ว กดบันทึกเพื่อยืนยัน'); };
  reader.readAsDataURL(file);
};
ACTIONS['project-image-clear'] = () => { S.pendingImage = null; pjRefreshPreview(); toast('จะลบรูปภาพเมื่อกดบันทึก'); };
ACTIONS['pick-icon'] = (el) => {
  const form = el.closest('form');
  form.querySelector('[name="icon"]').value = el.dataset.value;
  $$('.icon-pick button', form).forEach((b) => b.setAttribute('aria-pressed', String(b === el)));
  S.pendingImage = null; // a preset icon replaces an uploaded picture
  pjRefreshPreview();
};
ACTIONS['pj-upload'] = () => {
  openAvatarEditor({
    title: 'ไอคอนโปรเจ็กต์',
    current: pjCurrentImage(),
    fallback: icon('folder', 'lg'),
    onSave: async (data) => {
      S.pendingImage = data; // null removes the picture
      pjRefreshPreview();
    },
  });
};

ACTIONS['project-new'] = () => openProjectForm();
ACTIONS['proj-edit'] = (el) => openProjectForm(el.dataset.id);
ACTIONS['proj-filter'] = (el) => { S.projFilter = el.dataset.filter; navigate('#/projects?filter=' + S.projFilter); };
ACTIONS['proj-open'] = async (el) => {
  const p = await apiGet('/api/projects/' + el.dataset.id);
  if (p.openUrl) window.open(p.openUrl, '_blank', 'noopener,noreferrer');
};
ACTIONS['proj-code'] = async (el) => {
  const p = await apiGet('/api/projects/' + el.dataset.id);
  if (p.editorUrl) window.open(p.editorUrl, '_blank', 'noopener,noreferrer');
};
ACTIONS['proj-fav'] = async (el) => {
  const p = await apiGet('/api/projects/' + el.dataset.id);
  await apiPatch('/api/projects/' + el.dataset.id, { isFavorite: !p.isFavorite });
  rerender();
};
ACTIONS['proj-archive'] = async (el) => {
  const archived = el.dataset.archived === 'true';
  if (!archived && !(await confirmBox('จัดเก็บโปรเจ็กต์นี้ไว้ในคลัง? (นำกลับมาได้ภายหลัง)', { okText: 'จัดเก็บ', danger: false }))) return;
  await apiPatch('/api/projects/' + el.dataset.id, { archived: !archived });
  toast(archived ? 'นำโปรเจ็กต์กลับมาแล้ว' : 'ย้ายโปรเจ็กต์ไปคลังแล้ว');
  rerender();
};
ACTIONS['proj-detail'] = async (el) => {
  const p = await apiGet('/api/projects/' + el.dataset.id);
  openModal({
    title: p.name,
    body: `<div class="detail-head">
        <span class="sym-bubble">${p.imageData ? `<img src="${esc(p.imageData)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:14px">` : icon(p.icon, 'lg')}</span>
        <div><p class="muted">${esc(p.category || 'ไม่ระบุหมวดหมู่')}</p><span class="badge ${PROJECT_STATUS_CLASS[p.status] || ''} dot">${esc(PROJECT_STATUS[p.status])}</span></div>
      </div>
      <p style="margin:16px 0">${esc(p.description || 'ไม่มีคำอธิบาย')}</p>
      <dl class="kv">
        <dt>URL เปิดโปรเจ็กต์</dt><dd>${p.openUrl ? `<a href="${esc(p.openUrl)}" target="_blank" rel="noopener noreferrer">${esc(p.openUrl)}</a>` : '<span class="muted">ยังไม่ได้กรอก</span>'}</dd>
        <dt>URL แก้ไขโค้ด</dt><dd>${p.editorUrl ? `<a href="${esc(p.editorUrl)}" target="_blank" rel="noopener noreferrer">${esc(p.editorUrl)}</a>` : '<span class="muted">ยังไม่ได้กรอก</span>'}</dd>
        <dt>วันที่เริ่มต้น</dt><dd>${p.startDate ? esc(thaiDate(p.startDate)) : '-'}</dd>
        <dt>อัปเดตล่าสุด</dt><dd>${esc(fmtDateTime(p.updatedAt))}</dd>
        <dt>หมายเหตุ</dt><dd style="white-space:pre-wrap">${esc(p.notes || '-')}</dd>
      </dl>`,
    footer: `<button class="btn danger" data-action="proj-delete" data-id="${esc(p.id)}">${icon('trash')} ลบโปรเจ็กต์</button>
             <button class="btn ghost" data-action="close-modal">ปิด</button>`,
  });
};
ACTIONS['proj-delete'] = async (el) => {
  if (!(await confirmBox('ลบโปรเจ็กต์นี้ถาวร? ไม่สามารถกู้คืนได้'))) return;
  await apiDelete('/api/projects/' + el.dataset.id);
  projectNameCache = null;
  closeAllModals();
  toast('ลบโปรเจ็กต์แล้ว');
  rerender();
};

/* ================================================================ CALENDAR */
S.cal = { view: 'month', cursor: new Date(), filter: new Set(Object.keys(CATEGORIES)), tab: 'all', events: [], byDate: {} };
const UPCOMING_TABS = [['all', 'ทั้งหมด'], ['mine', 'งานของฉัน'], ['appointment', 'นัดหมาย'], ['delivery', 'ส่งมอบงาน'], ['due', 'ใกล้ครบกำหนด'], ['done', 'เสร็จแล้ว']];

function monthDates(cursor) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
}
function weekDates(cursor) {
  const s = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
  s.setDate(s.getDate() - s.getDay());
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(s); d.setDate(s.getDate() + i); return d; });
}
function eventsByDate(events) {
  const map = {};
  for (const ev of events) {
    if (!S.cal.filter.has(ev.category)) continue;
    const start = dateOnly(ev.startDate);
    const end = dateOnly(ev.endDate || ev.startDate);
    let guard = 0;
    for (let d = new Date(start); d <= end && guard < 62; d.setDate(d.getDate() + 1), guard++) {
      const k = isoDate(d);
      (map[k] = map[k] || []).push(ev);
    }
  }
  for (const k of Object.keys(map)) map[k].sort((a, b) => (a.startTime || '00:00').localeCompare(b.startTime || '00:00'));
  return map;
}
function calRange() {
  const c = S.cal.cursor;
  if (S.cal.view === 'month') {
    const dates = monthDates(c);
    return [isoDate(dates[0]), isoDate(dates[41])];
  }
  if (S.cal.view === 'week') {
    const dates = weekDates(c);
    return [isoDate(dates[0]), isoDate(dates[6])];
  }
  return [isoDate(c), isoDate(c)];
}
function calTitle() {
  const c = S.cal.cursor;
  if (S.cal.view === 'month') return c.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
  if (S.cal.view === 'week') {
    const d = weekDates(c);
    return `${d[0].toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })} – ${d[6].toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }
  return c.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
function shiftCursor(dir) {
  const c = S.cal.cursor;
  if (S.cal.view === 'month') S.cal.cursor = new Date(c.getFullYear(), c.getMonth() + dir, 1);
  else if (S.cal.view === 'week') S.cal.cursor = new Date(c.getFullYear(), c.getMonth(), c.getDate() + 7 * dir);
  else S.cal.cursor = new Date(c.getFullYear(), c.getMonth(), c.getDate() + dir);
}

async function renderCalendar(params) {
  setPageHead(PAGE_TITLES.calendar, 'บันทึกนัดหมาย งาน และเรื่องสำคัญทุกประเภท');
  if (params && params.tab) S.cal.tab = params.tab;
  const [from, to] = calRange();
  const [{ items: events }, { items: upcoming }] = await Promise.all([
    apiGet(`/api/events?from=${from}&to=${to}`),
    apiGet(`/api/events/upcoming?tab=${S.cal.tab}&limit=60`),
  ]);
  S.cal.events = events;
  S.cal.byDate = eventsByDate(events);
  const today = todayStr();

  let grid = '';
  if (S.cal.view === 'month') {
    const dates = monthDates(S.cal.cursor);
    grid = `<div class="cal-grid" role="grid" aria-label="ปฏิทินรายเดือน">
      ${['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].map((d, i) => `<div class="cal-dow ${i === 0 ? 'sun' : ''}">${d}</div>`).join('')}
      ${dates.map((d) => calCell(d, S.cal.cursor.getMonth(), today)).join('')}
    </div>`;
  } else if (S.cal.view === 'week') {
    grid = `<div class="week-grid">${weekDates(S.cal.cursor).map((d) => {
      const k = isoDate(d);
      const list = S.cal.byDate[k] || [];
      return `<div class="week-col"><h4 class="${k === today ? 'today' : ''}">${esc(d.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric' }))}</h4>
        ${list.map(chipHtml).join('') || '<span class="muted small">ไม่มีรายการ</span>'}
        <button class="chip" data-action="cal-day" data-date="${k}">${icon('plus', 'sm')}<span>เพิ่มรายการ</span></button></div>`;
    }).join('')}</div>`;
  } else {
    const k = isoDate(S.cal.cursor);
    const list = S.cal.byDate[k] || [];
    grid = `<div class="card">${list.length ? `<div class="list">${list.map((e) => `
      <div class="item" data-action="event-detail" data-id="${esc(e.id)}">${symBubble(e.symbol, e.color)}
        <div class="meta"><b>${esc(e.title)}</b><small>${esc(e.startTime ? e.startTime + ' – ' + (e.endTime || '') + ' น.' : 'ทั้งวัน')} · ${esc(CATEGORIES[e.category])}</small></div>
        ${reminderStatus(e)}</div>`).join('')}</div>` : emptyBox('ไม่มีรายการในวันนี้')}
      <div style="margin-top:14px"><button class="btn primary" data-action="cal-day" data-date="${k}">${icon('plus')} เพิ่มรายการ</button></div></div>`;
  }

  fillPage(`
    <div class="cal-theme"><div class="cal-layout">
      <aside class="cal-side">
        <div class="card">
          <h3 style="margin-bottom:10px">มุมมองปฏิทิน</h3>
          <div class="mode">
            ${[['month', 'รายเดือน', 'calendar'], ['week', 'รายสัปดาห์', 'list'], ['day', 'รายวัน', 'note']].map(([k, l, i]) =>
              `<button aria-pressed="${S.cal.view === k}" data-action="cal-view" data-view="${k}">${icon(i)} ${l}</button>`).join('')}
          </div>
        </div>
        <div class="card">
          <h3 style="margin-bottom:10px">ประเภทเหตุการณ์</h3>
          ${Object.entries(CATEGORIES).map(([k, l]) => `<label><input type="checkbox" data-change="cal-filter" value="${k}" ${S.cal.filter.has(k) ? 'checked' : ''}>
            <span style="color:${k === 'special' ? '#FFC86B' : k === 'personal' ? '#FF8FB9' : '#FFB7D5'}">${icon(CATEGORY_SYMBOL[k], 'sm')}</span> ${esc(l)}</label>`).join('')}
        </div>
      </aside>
      <section class="cal-main">
        <div class="cal-toolbar">
          <button class="btn icon" data-action="cal-nav" data-dir="-1" aria-label="เดือนก่อนหน้า">${icon('chevLeft')}</button>
          <h2>${esc(calTitle())}</h2>
          <button class="btn icon" data-action="cal-nav" data-dir="1" aria-label="ถัดไป">${icon('chevRight')}</button>
          <button class="btn" data-action="cal-today">วันนี้</button>
          <button class="btn primary" data-action="event-new">${icon('plus')} เพิ่มรายการ</button>
        </div>
        ${grid}
        <div class="card">
          <div class="head"><h3>รายการที่กำลังจะมาถึง</h3></div>
          <div class="tabs" role="tablist" style="margin-bottom:14px">
            ${UPCOMING_TABS.map(([k, l]) => `<button class="tab" role="tab" aria-selected="${S.cal.tab === k}" data-action="cal-tab" data-tab="${k}">${esc(l)}</button>`).join('')}
          </div>
          ${upcoming.length ? `<div class="table-wrap"><table class="table">
            <thead><tr><th>วันที่</th><th>สัญลักษณ์</th><th>ชื่อรายการ</th><th>เวลา</th><th>หมวดหมู่</th><th>การแจ้งเตือน</th><th></th></tr></thead>
            <tbody>${upcoming.map((e) => `<tr class="clickable" data-action="event-detail" data-id="${esc(e.id)}">
              <td>${esc(thaiDate(e.startDate, { day: 'numeric', month: 'short' }))}</td>
              <td><span class="sym-bubble" style="width:34px;height:34px;color:${safeColor(e.color)}">${icon(e.symbol)}</span></td>
              <td><b>${esc(e.title)}</b></td>
              <td>${esc(e.startTime ? e.startTime + (e.endTime ? ' – ' + e.endTime : '') : 'ทั้งวัน')}</td>
              <td>${esc(CATEGORIES[e.category])}</td>
              <td>${reminderStatus(e)}</td>
              <td><button class="btn sm ghost" data-action="event-detail" data-id="${esc(e.id)}">รายละเอียด</button></td>
            </tr>`).join('')}</tbody></table></div>` : emptyBox('ไม่มีรายการในแท็บนี้')}
        </div>
      </section>
    </div></div>`);
}

function calCell(d, month, today) {
  const k = isoDate(d);
  const list = S.cal.byDate[k] || [];
  const shown = list.slice(0, 2);
  const more = list.length - shown.length;
  const weekend = d.getDay() === 0 || d.getDay() === 6;
  return `<div class="cal-cell ${d.getMonth() !== month ? 'other' : ''} ${k === today ? 'today' : ''} ${weekend ? 'weekend' : ''} ${k === (S.cal.selected || '') ? 'selected' : ''}"
      role="gridcell" tabindex="0" data-action="cal-day" data-date="${k}" aria-label="${esc(thaiDate(k, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}, ${list.length} รายการ">
    <span class="num">${d.getDate()}</span>
    <div class="cal-bars">${shown.map((e) => `<button class="cal-bar cat-${esc(e.category)}" data-action="event-detail" data-id="${esc(e.id)}" title="${esc(e.title)}" aria-label="${esc(e.title)}">${icon(e.symbol, 'sm')}<span>${esc(e.title)}</span></button>`).join('')}</div>
    ${more > 0 ? `<span class="cal-more">+${more} รายการ</span>` : ''}
  </div>`;
}
function chipHtml(e) {
  return `<button class="chip" style="color:${safeColor(e.color)}" data-action="event-detail" data-id="${esc(e.id)}">${icon(e.symbol)}<span style="color:var(--text)">${esc(e.title)}</span></button>`;
}

ACTIONS['cal-view'] = (el) => { S.cal.view = el.dataset.view; rerender(); };
ACTIONS['cal-nav'] = (el) => { shiftCursor(Number(el.dataset.dir)); rerender(); };
ACTIONS['cal-today'] = () => { S.cal.cursor = new Date(); rerender(); };
ACTIONS['cal-tab'] = (el) => { S.cal.tab = el.dataset.tab; navigate('#/calendar?tab=' + S.cal.tab); };
CHANGES['cal-filter'] = (el) => {
  if (el.checked) S.cal.filter.add(el.value); else S.cal.filter.delete(el.value);
  rerender();
};

ACTIONS['cal-day'] = (el, e) => {
  if (e && e.target.closest('[data-action="event-detail"]')) return;
  const date = el.dataset.date;
  S.cal.selected = date;
  const list = S.cal.byDate[date] || [];
  if (!list.length) { openEventForm({ startDate: date }); return; }
  openModal({
    title: thaiDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    body: `<div class="list">${list.map((ev) => `
      <div class="item" data-action="event-detail" data-id="${esc(ev.id)}">${symBubble(ev.symbol, ev.color)}
        <div class="meta"><b>${esc(ev.title)}</b><small>${esc(ev.startTime ? ev.startTime + ' น.' : 'ทั้งวัน')} · ${esc(CATEGORIES[ev.category])}</small></div>
        ${reminderStatus(ev)}</div>`).join('')}</div>`,
    footer: `<button class="btn ghost" data-action="close-modal">ปิด</button>
             <button class="btn primary" data-action="event-new" data-date="${date}">${icon('plus')} เพิ่มรายการ</button>`,
  });
};

ACTIONS['event-new'] = (el) => openEventForm({ startDate: el.dataset.date || S.cal.selected || todayStr() });
ACTIONS['event-detail'] = async (el) => {
  closeAllModals();
  openEventDetail(el.dataset.id);
};

let projectNameCache = null;
async function projectOptions() {
  if (!projectNameCache) {
    const { items } = await apiGet('/api/projects');
    projectNameCache = items;
  }
  return projectNameCache;
}

async function openEventForm(initial, existing) {
  const projects = await projectOptions();
  const ev = existing || { title: '', category: 'notice', symbol: 'bell', color: '#FF4F9A', startDate: initial.startDate || todayStr(),
    startTime: '', endDate: '', endTime: '', details: '', projectId: '', reminderMinutes: S.settings.defaultReminderMinutes, status: 'pending' };
  const isCustom = ev.reminderMinutes != null && !REMINDERS.some((r) => r.v === String(ev.reminderMinutes));
  const remValue = ev.reminderMinutes == null ? '' : isCustom ? 'custom' : String(ev.reminderMinutes);
  openModal({
    title: existing ? 'แก้ไขรายการ' : 'เพิ่มรายการ',
    wide: true,
    body: `<form data-form="event" data-id="${esc(existing ? existing.id : '')}" class="form-grid" novalidate>
      <label class="field full"><span>ชื่อรายการ *</span><input class="input" name="title" maxlength="120" required value="${esc(ev.title)}"></label>
      <div class="field full"><span>เลือกสัญลักษณ์</span>
        <input type="hidden" name="symbol" value="${esc(ev.symbol)}">
        <div class="icon-pick">${Object.keys(SYMBOLS).map((k) => `<button type="button" aria-label="${esc(SYMBOLS[k])}" aria-pressed="${ev.symbol === k}" data-action="pick-symbol" data-value="${k}">${icon(k)}</button>`).join('')}</div>
      </div>
      <div class="field full"><span>สีสัญลักษณ์</span>
        <input type="hidden" name="color" value="${esc(ev.color)}">
        <div class="swatches">${COLORS.map((c) => `<button type="button" class="swatch" style="background:${c};color:${c}" aria-label="สี ${c}" aria-checked="${ev.color === c}" data-action="pick-color" data-value="${c}"></button>`).join('')}</div>
      </div>
      <label class="field"><span>หมวดหมู่</span><select class="select" name="category" data-change="event-category">
        ${Object.entries(CATEGORIES).map(([k, l]) => `<option value="${k}" ${ev.category === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}
      </select></label>
      <label class="field"><span>เชื่อมโยงโปรเจ็กต์ (ไม่บังคับ)</span><select class="select" name="projectId">
        <option value="">ไม่เชื่อมโยง</option>
        ${projects.map((p) => `<option value="${esc(p.id)}" ${ev.projectId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
      </select></label>
      <label class="field"><span>วันที่เริ่มต้น *</span><input class="input" type="date" name="startDate" required value="${esc(ev.startDate)}"></label>
      <label class="field"><span>เวลาเริ่มต้น</span><input class="input" type="time" name="startTime" value="${esc(ev.startTime || '')}"></label>
      <label class="field"><span>วันที่สิ้นสุด (ไม่บังคับ)</span><input class="input" type="date" name="endDate" value="${esc(ev.endDate || '')}"></label>
      <label class="field"><span>เวลาสิ้นสุด (ไม่บังคับ)</span><input class="input" type="time" name="endTime" value="${esc(ev.endTime || '')}"></label>
      <label class="field"><span>ตั้งค่าการแจ้งเตือน</span><select class="select" name="reminder" data-change="event-reminder">
        ${REMINDERS.map((r) => `<option value="${r.v}" ${remValue === r.v ? 'selected' : ''}>${esc(r.label)}</option>`).join('')}
      </select></label>
      <label class="field" data-role="custom-minutes" ${remValue === 'custom' ? '' : 'hidden'}><span>จำนวนนาทีก่อนเริ่ม</span><input class="input" type="number" min="0" max="525600" name="customMinutes" value="${esc(isCustom ? ev.reminderMinutes : '')}"></label>
      <label class="field"><span>สถานะรายการ</span><select class="select" name="status">
        <option value="pending" ${ev.status === 'pending' ? 'selected' : ''}>กำลังดำเนินการ</option>
        <option value="done" ${ev.status === 'done' ? 'selected' : ''}>เสร็จแล้ว</option>
      </select></label>
      <label class="field full"><span>รายละเอียด / โน้ต</span><textarea class="textarea" name="details" maxlength="5000" rows="3">${esc(ev.details)}</textarea></label>
      <div class="full small" data-role="form-error" role="alert"></div>
      <div class="full" style="display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap">
        <button type="button" class="btn ghost" data-action="close-modal">ยกเลิก</button>
        <button type="submit" class="btn primary">บันทึก</button>
      </div>
    </form>`,
  });
}

ACTIONS['pick-symbol'] = (el) => {
  const form = el.closest('form');
  form.querySelector('[name="symbol"]').value = el.dataset.value;
  $$('[data-action="pick-symbol"]', form).forEach((b) => b.setAttribute('aria-pressed', String(b === el)));
};
ACTIONS['pick-color'] = (el) => {
  const form = el.closest('form');
  form.querySelector('[name="color"]').value = el.dataset.value;
  $$('[data-action="pick-color"]', form).forEach((b) => b.setAttribute('aria-checked', String(b === el)));
};
CHANGES['event-category'] = (el) => {
  const form = el.closest('form');
  const symbol = CATEGORY_SYMBOL[el.value];
  form.querySelector('[name="symbol"]').value = symbol;
  $$('[data-action="pick-symbol"]', form).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === symbol)));
};
CHANGES['event-reminder'] = (el) => {
  const box = el.closest('form').querySelector('[data-role="custom-minutes"]');
  box.hidden = el.value !== 'custom';
};

FORMS.event = async (form) => {
  const fd = new FormData(form);
  const id = form.dataset.id;
  const rem = fd.get('reminder');
  const reminderMinutes = rem === '' ? null : rem === 'custom' ? (fd.get('customMinutes') === '' ? null : Number(fd.get('customMinutes'))) : Number(rem);
  if (rem === 'custom' && reminderMinutes == null) { setFormError(form, 'กรุณากรอกจำนวนนาทีที่ต้องการแจ้งเตือน'); return; }
  const body = {
    title: fd.get('title'),
    symbol: fd.get('symbol'),
    color: fd.get('color'),
    category: fd.get('category'),
    projectId: fd.get('projectId') || null,
    startDate: fd.get('startDate'),
    startTime: fd.get('startTime') || null,
    endDate: fd.get('endDate') || null,
    endTime: fd.get('endTime') || null,
    reminderMinutes,
    status: fd.get('status'),
    details: fd.get('details'),
  };
  const btn = form.querySelector('[type="submit"]');
  try {
    await busy(btn, () => (id ? apiPatch('/api/events/' + id, body) : apiPost('/api/events', body)));
    closeAllModals();
    toast(id ? 'บันทึกการแก้ไขแล้ว' : 'เพิ่มรายการในปฏิทินแล้ว');
    rerender();
  } catch (err) {
    setFormError(form, err.message);
  }
};

async function openEventDetail(id) {
  let ev;
  try { ev = await apiGet('/api/events/' + id); } catch (err) { toast(err.message, 'err'); return; }
  const projects = await projectOptions();
  const proj = projects.find((p) => p.id === ev.projectId);
  const done = ev.status === 'done';
  openModal({
    title: 'รายละเอียดรายการ',
    body: `<div class="detail-head">${symBubble(ev.symbol, ev.color)}
        <div><h3>${esc(ev.title)}</h3><span class="badge pink">${esc(CATEGORIES[ev.category])}</span> ${done ? '<span class="badge ok dot">เสร็จแล้ว</span>' : ''}</div></div>
      <dl class="kv" style="margin-top:18px">
        <dt>วันที่</dt><dd>${esc(fmtRange(ev))}</dd>
        <dt>การแจ้งเตือน</dt><dd>${reminderStatus(ev)}</dd>
        <dt>โปรเจ็กต์ที่เกี่ยวข้อง</dt><dd>${proj ? esc(proj.name) : '<span class="muted">ไม่มี</span>'}</dd>
        <dt>สถานะ</dt><dd>${done ? 'เสร็จแล้ว' : 'กำลังดำเนินการ'}</dd>
        <dt>รายละเอียด</dt><dd style="white-space:pre-wrap">${esc(ev.details || '-')}</dd>
      </dl>`,
    footer: `<button class="btn danger" data-action="event-delete" data-id="${esc(ev.id)}">${icon('trash')} ลบ</button>
             <button class="btn" data-action="event-toggle-done" data-id="${esc(ev.id)}" data-done="${done}">${icon('check')} ${done ? 'ยกเลิกการทำเครื่องหมาย' : 'ทำเครื่องหมายว่าเสร็จแล้ว'}</button>
             <button class="btn" data-action="event-edit" data-id="${esc(ev.id)}">${icon('edit')} แก้ไข</button>
             <button class="btn ghost" data-action="close-modal">ปิด</button>`,
  });
}
ACTIONS['event-edit'] = async (el) => {
  const ev = await apiGet('/api/events/' + el.dataset.id);
  closeAllModals();
  openEventForm({}, ev);
};
ACTIONS['event-toggle-done'] = async (el) => {
  const done = el.dataset.done === 'true';
  await apiPatch('/api/events/' + el.dataset.id, { status: done ? 'pending' : 'done' });
  closeAllModals();
  toast(done ? 'เปิดรายการอีกครั้งแล้ว' : 'ทำเครื่องหมายว่าเสร็จแล้ว');
  rerender();
};
ACTIONS['event-delete'] = async (el) => {
  if (!(await confirmBox('ลบรายการนี้ถาวร? ไม่สามารถกู้คืนได้'))) return;
  await apiDelete('/api/events/' + el.dataset.id);
  closeAllModals();
  toast('ลบรายการแล้ว');
  rerender();
};

/* ================================================================ SUMMARY */
S.sumTab = 'all';
// Card colours by kind (pastel background, coloured edge). Telegram and reply items use their own colour.
const SUM_TONE = {
  urgent: ['#FFF0F6', '#FF376C'], telegram: ['#EAF3FF', '#2987FF'], reply: ['#FFF9E7', '#FFCC24'],
  assigned: ['#F0E8FF', '#9B6DE5'], info: ['#EAF9F0', '#38B67B'], follow: ['#FFF0E5', '#FF9B52'],
};
const SUM_PILLS = [['all', 'ทั้งหมด', 'grid'], ['urgent', 'เร่งด่วน', 'bolt'], ['reply', 'ต้องตอบ', 'reply'],
  ['assigned', 'งานที่ได้รับมอบหมาย', 'briefcase'], ['info', 'เรื่องแจ้งให้ทราบ', 'megaphone'],
  ['follow', 'ติดตามภายหลัง', 'bookmark'], ['done', 'เสร็จแล้ว', 'check2']];
const SUM_STATE_LABEL = { open: 'ยังไม่ได้อ่าน', read: 'อ่านแล้ว', follow: 'ติดตามภายหลัง', done: 'เสร็จสิ้น' };

async function renderSummary(params) {
  setPageHead(PAGE_TITLES.summary, 'สิ่งที่ไม่ควรพลาดจาก Telegram, นัดหมาย และงาน');
  if (params && params.tab) S.sumTab = params.tab;
  const { items } = await apiGet('/api/summary?tab=' + S.sumTab);
  fillPage(`
    <div class="sum-head">
      <div class="sum-title">
        <span class="sum-icon">${icon('notebook')}</span>
        <div><h2>สรุปสำคัญ</h2><p>รวมสิ่งที่ต้องรู้ไว้ในที่เดียว รายการที่ยังไม่เสร็จจะไม่หายไป</p></div>
      </div>
      <button class="sum-ai" disabled title="ฟังก์ชันสรุปด้วย AI ยังไม่ได้เปิดใช้งาน">${icon('star', 'sm')} สรุปด้วย AI (ยังไม่เปิดใช้งาน)</button>
    </div>
    <nav class="sum-pills" role="tablist" aria-label="กรองรายการ">
      ${SUM_PILLS.map(([k, l, ic]) => `<button class="sum-pill" role="tab" aria-selected="${S.sumTab === k}" data-action="sum-tab" data-tab="${k}">${icon(ic, 'sm')} ${esc(l)}</button>`).join('')}
    </nav>
    ${items.length ? `<div class="sum-list">${items.map(sumCard).join('')}</div>` : `<div class="sum-empty">${icon('check2')}<b>ไม่มีรายการในหมวดนี้</b><small>รายการจากข้อความ Telegram และปฏิทินจะปรากฏที่นี่</small></div>`}
  `);
}

function sumTone(it) {
  if (it.state === 'follow') return 'follow';
  if (it.category === 'reply') return 'reply';
  if (it.sourceType === 'telegram') return 'telegram';
  if (it.category === 'urgent') return 'urgent';
  if (it.category === 'assigned') return 'assigned';
  return 'info';
}

function sumCard(it) {
  const tone = sumTone(it);
  const [bg, edge] = SUM_TONE[tone];
  const catLabel = (SUM_PILLS.find(([k]) => k === it.category) || [, 'ทั่วไป'])[1];
  const isTelegram = it.sourceType === 'telegram';
  const type = esc(it.sourceType);
  const id = esc(it.sourceId);
  const action = (state, label, ic) => `<button class="sum-btn ${it.state === state ? 'is-on' : ''}" data-action="sum-state" data-type="${type}" data-id="${id}" data-state="${state}" aria-pressed="${it.state === state}">${icon(ic, 'sm')} ${label}</button>`;
  return `<article class="sum-card tone-${tone} ${it.state === 'done' ? 'is-done' : ''}" style="--sum-bg:${bg};--sum-edge:${edge}">
    <div class="sum-main">
      <div class="sum-tags">
        ${it.priority === 'high' ? `<span class="sum-tag tag-high">${icon('alert', 'sm')} สำคัญสูง</span>` : ''}
        <span class="sum-tag tag-cat">${esc(catLabel)}</span>
        <span class="sum-src">${icon(isTelegram ? 'chat' : 'calendar', 'sm')} ${esc(it.source)}</span>
        <span class="sum-when">${esc(fmtDateTime(it.at))}</span>
        <span class="sum-state st-${esc(it.state)}">${esc(SUM_STATE_LABEL[it.state] || SUM_STATE_LABEL.open)}</span>
      </div>
      <h3 class="sum-name">${esc(it.title)}</h3>
      <p class="sum-text">${esc(it.summary)}</p>
    </div>
    <div class="sum-actions">
      <button class="sum-btn primary" data-action="summary-open" data-type="${type}" data-id="${id}" data-target='${esc(JSON.stringify(it.target))}'>${icon('external', 'sm')} เปิดต้นทาง</button>
      ${action('read', 'อ่านแล้ว', 'check')}
      ${action('follow', 'ติดตามภายหลัง', 'bookmark')}
      ${action('done', 'เสร็จสิ้น', 'check2')}
    </div>
  </article>`;
}

ACTIONS['sum-tab'] = (el) => { S.sumTab = el.dataset.tab; navigate('#/summary?tab=' + S.sumTab); };
ACTIONS['sum-state'] = async (el) => {
  await apiPost('/api/summary/state', { sourceType: el.dataset.type, sourceId: el.dataset.id, state: el.dataset.state });
  toast('บันทึกสถานะแล้ว');
  rerender();
};
ACTIONS['summary-open'] = async (el) => {
  const type = el.dataset.type;
  let target = {};
  try { target = JSON.parse(el.dataset.target || '{}'); } catch (_) { target = {}; }
  if (type === 'telegram' && target.groupId) {
    S.chat.groupId = target.groupId;
    S.chat.replyTo = null;
    navigate(`#/chat?group=${target.groupId}&view=chat&msg=${target.messageId}`);
    return;
  }
  if (type === 'event') openEventDetail(el.dataset.id);
};
ACTIONS['notif-read-all'] = async () => {
  await apiPost('/api/notifications/read-all');
  toast('อ่านการแจ้งเตือนทั้งหมดแล้ว');
  rerender();
  refreshBell();
};
ACTIONS['notif-open'] = async (el) => {
  await apiPost(`/api/notifications/${el.dataset.id}/read`).catch(() => null);
  const type = el.dataset.source;
  if (type === 'event') { openEventDetail(el.dataset.ref); }
  else if (type === 'telegram') { navigate('#/summary?tab=all'); }
  refreshBell();
};

/* ================================================================ SETTINGS */
S.settingsTab = 'profile';
const SETTINGS_TABS = [
  ['profile', 'โปรไฟล์', 'user'], ['telegram', 'Telegram', 'chat'], ['notify', 'การแจ้งเตือน', 'bell'],
  ['display', 'การแสดงผล', 'settings'], ['security', 'ความปลอดภัย', 'shield'], ['data', 'ข้อมูลระบบ', 'download'],
];

async function renderSettings(params) {
  setPageHead(PAGE_TITLES.settings, 'บัญชี การเชื่อมต่อ การแจ้งเตือน และข้อมูลของคุณ');
  if (params && params.tab) S.settingsTab = params.tab;
  if (params && params.sub) S.tgSub = params.sub;
  fillPage(`
    <div class="settings-layout">
      <nav class="settings-tabs card" role="tablist" aria-label="หมวดตั้งค่า" style="padding:10px">
        ${SETTINGS_TABS.map(([k, l, i]) => `<button role="tab" aria-selected="${S.settingsTab === k}" data-action="set-tab" data-tab="${k}">${icon(i)} ${esc(l)}</button>`).join('')}
      </nav>
      <div class="settings-body" id="settingsBody"><div class="card"><span class="spinner"></span></div></div>
    </div>`);
  const body = $('#settingsBody');
  const fn = { profile: settingsProfile, telegram: settingsTelegram, notify: settingsNotify, display: settingsDisplay, security: settingsSecurity, data: settingsData }[S.settingsTab];
  try { await fn(body); } catch (err) { body.innerHTML = `<div class="card">${esc(err.message)}</div>`; }
}
ACTIONS['set-tab'] = (el) => { S.settingsTab = el.dataset.tab; navigate('#/settings?tab=' + S.settingsTab); };

async function settingsProfile(body) {
  const { user } = await apiGet('/api/me');
  body.innerHTML = `
    <div class="card">
      <div class="profile-head" style="margin-bottom:18px">${avatarHtml(user)}
        <div class="grow"><h3>${esc(user.displayName)}</h3><p class="muted">${esc(user.email)}</p></div>
        <div class="row wrap">
          <label class="btn sm" style="cursor:pointer">${icon('upload', 'sm')} อัปโหลดรูป<input type="file" hidden accept="image/png,image/jpeg,image/webp,image/gif" data-change="avatar"></label>
          <button class="btn sm ghost" data-action="avatar-clear">ลบรูป</button>
        </div>
      </div>
      <form data-form="profile" class="form-grid">
        <label class="field"><span>ชื่อแสดงผล</span><input class="input" name="displayName" maxlength="60" value="${esc(user.displayName)}"></label>
        <label class="field"><span>เขตเวลา</span><select class="select" name="timezone">
          ${TZ_OPTIONS.map((z) => `<option value="${z}" ${user.timezone === z ? 'selected' : ''}>${esc(z)}</option>`).join('')}
        </select></label>
        <label class="field"><span>Telegram User ID ของคุณ (ใช้ตรวจการตอบกลับ)</span><input class="input" name="telegramUserId" inputmode="numeric" maxlength="20" value="${esc(user.telegramUserId || '')}" placeholder="เช่น 123456789"></label>
        <label class="field"><span>อีเมล</span><input class="input" value="${esc(user.email)}" disabled></label>
        <div class="full small" data-role="form-error"></div>
        <div class="full row wrap" style="justify-content:space-between">
          <button type="submit" class="btn primary">บันทึกโปรไฟล์</button>
          <button type="button" class="btn danger" data-action="logout">${icon('logout')} ออกจากระบบ</button>
        </div>
      </form>
    </div>`;
}
CHANGES['avatar'] = (el) => {
  const file = el.files && el.files[0];
  if (!file) return;
  if (file.size > 220 * 1024) { toast('รูปโปรไฟล์ใหญ่เกินไป (ไม่เกิน 220 KB)', 'err'); el.value = ''; return; }
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      await apiPatch('/api/me', { avatarData: reader.result });
      toast('อัปเดตรูปโปรไฟล์แล้ว');
      await loadMe();
      rerender();
    } catch (err) { toast(err.message, 'err'); }
  };
  reader.readAsDataURL(file);
};
ACTIONS['avatar-clear'] = async () => {
  await apiPatch('/api/me', { avatarData: null });
  await loadMe();
  toast('ลบรูปโปรไฟล์แล้ว');
  rerender();
};
FORMS.profile = async (form) => {
  const fd = new FormData(form);
  const btn = form.querySelector('[type="submit"]');
  try {
    await busy(btn, () => apiPatch('/api/me', {
      displayName: fd.get('displayName'),
      timezone: fd.get('timezone'),
      telegramUserId: fd.get('telegramUserId') || null,
    }));
    await loadMe();
    toast('บันทึกโปรไฟล์แล้ว');
    rerender();
  } catch (err) { setFormError(form, err.message); }
};

async function settingsNotify(body) {
  const s = await apiGet('/api/settings');
  const st = s.settings;
  body.innerHTML = `
    <div class="card">
      <h3 style="margin-bottom:6px">การแจ้งเตือน</h3>
      <p class="muted small" style="margin-bottom:12px">การแจ้งเตือนตามเวลาทำงานบนเซิร์ฟเวอร์ ไม่ต้องเปิดหน้าเว็บค้างไว้</p>
      <form data-form="notify">
        ${switchRow('notifyInApp', 'แจ้งเตือนในระบบ', 'แสดงจำนวนที่ยังไม่อ่านบนกระดิ่ง', st.notifyInApp)}
        ${switchRow('notifyEmail', 'ส่งอีเมลแจ้งเตือน (ช่องทางเสริม)', 'ต้องตั้งค่า SMTP โดยผู้ดูแลระบบก่อน', st.notifyEmail)}
        <div class="setting-row"><div class="lbl"><b>เวลาแจ้งเตือนเริ่มต้น</b><small>ใช้เมื่อสร้างรายการใหม่</small></div>
          <select class="select" name="defaultReminderMinutes" style="max-width:200px">
            ${REMINDERS.filter((r) => r.v !== '' && r.v !== 'custom').map((r) => `<option value="${r.v}" ${String(st.defaultReminderMinutes) === r.v ? 'selected' : ''}>${esc(r.label)}</option>`).join('')}
          </select></div>
        <h4 style="margin:18px 0 4px">ตั้งค่าการแจ้งเตือนตามหมวด</h4>
        ${Object.entries(CATEGORIES).map(([k, l]) => switchRow('cat_' + k, l, '', st.categoryNotify[k])).join('')}
        <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn primary" type="submit">บันทึกการแจ้งเตือน</button></div>
      </form>
    </div>`;
}
function switchRow(name, label, desc, on) {
  return `<div class="setting-row"><div class="lbl"><b>${esc(label)}</b>${desc ? `<small>${esc(desc)}</small>` : ''}</div>
    <label class="switch"><input type="checkbox" name="${name}" ${on ? 'checked' : ''}><span></span></label></div>`;
}
FORMS.notify = async (form) => {
  const fd = new FormData(form);
  const categoryNotify = {};
  for (const k of Object.keys(CATEGORIES)) categoryNotify[k] = fd.get('cat_' + k) === 'on';
  try {
    await apiPut('/api/settings', {
      notifyInApp: fd.get('notifyInApp') === 'on',
      notifyEmail: fd.get('notifyEmail') === 'on',
      defaultReminderMinutes: Number(fd.get('defaultReminderMinutes')),
      categoryNotify,
    });
    await loadMe();
    toast('บันทึกการแจ้งเตือนแล้ว');
  } catch (err) { toast(err.message, 'err'); }
};

async function settingsDisplay(body) {
  const { settings: st } = await apiGet('/api/settings');
  body.innerHTML = `
    <div class="card">
      <h3 style="margin-bottom:12px">การแสดงผล</h3>
      <form data-form="display">
        <div class="setting-row"><div class="lbl"><b>การตั้งค่า Animation</b><small>ลด Animation ตามการตั้งค่า Reduce Motion ของเครื่องได้</small></div>
          <select class="select" name="animation" style="max-width:220px">
            <option value="full" ${st.animation === 'full' ? 'selected' : ''}>เต็มรูปแบบ</option>
            <option value="reduced" ${st.animation === 'reduced' ? 'selected' : ''}>ลดการเคลื่อนไหว</option>
            <option value="off" ${st.animation === 'off' ? 'selected' : ''}>ปิด Animation</option>
          </select></div>
        <div class="setting-row" style="display:block"><div class="lbl" style="margin-bottom:8px"><b>ขนาดตัวอักษร</b> <small>(<span id="fontScaleVal">${st.fontScale}</span>%)</small></div>
          <input class="range" type="range" min="90" max="130" step="5" name="fontScale" value="${st.fontScale}" data-input="font-scale"></div>
        <div class="setting-row"><div class="lbl"><b>ซ่อนแถบเมนูด้านซ้ายเมื่อเริ่มต้น</b><small>ย่อ / ขยาย Sidebar ได้จากปุ่มบนแถบเมนู</small></div>
          <label class="switch"><input type="checkbox" name="sidebarCollapsed" ${st.sidebarCollapsed ? 'checked' : ''}><span></span></label></div>
        <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn primary" type="submit">บันทึกการแสดงผล</button></div>
      </form>
    </div>`;
}
FORMS.display = async (form) => {
  const fd = new FormData(form);
  try {
    await apiPut('/api/settings', {
      animation: fd.get('animation'),
      fontScale: Number(fd.get('fontScale')),
      sidebarCollapsed: fd.get('sidebarCollapsed') === 'on',
    });
    await loadMe();
    applyDisplaySettings();
    toast('บันทึกการแสดงผลแล้ว');
  } catch (err) { toast(err.message, 'err'); }
};

async function settingsData(body) {
  const { items: logs } = await apiGet('/api/logs');
  body.innerHTML = `
    <div class="card">
      <h3>ส่งออกและสำรองข้อมูล</h3>
      <p class="muted small" style="margin:6px 0 14px">ดาวน์โหลดข้อมูลทั้งหมดของคุณเป็นไฟล์ JSON (ไม่รวม Bot Token)</p>
      <button class="btn primary" data-action="export">${icon('download')} ส่งออกข้อมูล (JSON)</button>
    </div>
    <div class="card">
      <h3 style="margin-bottom:12px">ประวัติการทำงานที่สำคัญ</h3>
      ${logs.length ? `<div class="list">${logs.slice(0, 60).map((l) => `<div class="item" style="cursor:default">
        <span class="sym-bubble">${icon('clock')}</span>
        <div class="meta"><b>${esc(l.detail || l.action)}</b><small>${esc(l.entity)} · ${esc(fmtDateTime(l.created_at))}</small></div></div>`).join('')}</div>`
        : emptyBox('ยังไม่มีประวัติ')}
    </div>`;
}
ACTIONS['export'] = async (el) => {
  await busy(el, async () => {
    const res = await fetch('/api/export', { credentials: 'same-origin' });
    if (!res.ok) throw new Error('ส่งออกข้อมูลไม่สำเร็จ');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `siina-export-${todayStr()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }).catch((err) => toast(err.message, 'err'));
};
