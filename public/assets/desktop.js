/* SIINA SYSTEM — My Desktop (โต๊ะทำงานส่วนตัว). A personal desktop: app icons on a grid, widgets, a dock and a wallpaper.
   The layout is saved per account on the server (GET/PUT /api/desktop). Icons open real modules or external https links.
   Widgets read real data only: weather from /api/dashboard/weather, events from the calendar, tasks from the dashboard,
   quick note from the notes module, project progress from the events linked to each project. Nothing is made up. */
'use strict';

const DSK = {
  data: null,        // last server response: { layout, isDefault, quickNote, catalog }
  layout: null,      // working copy (edit mode changes this)
  saved: '',         // JSON of the last saved layout
  edit: false,
  day: '',           // day shown by the calendar widget
  w: {},             // widget data cache: weather, events, tasks, note, progress
  noteDirty: false,
  noteTimer: 0,
  drag: null,
};
const DSK_TONES = ['pink', 'lilac', 'peach', 'mint', 'sky', 'butter'];
const DSK_WIDGET_TITLE = { clock: 'เวลาและสภาพอากาศ', calendar: 'วันนี้', tasks: 'งานที่ต้องทำ', note: 'โน้ตด่วน', progress: 'ความคืบหน้าโปรเจ็กต์' };
const DSK_WIDGET_ICON = { clock: 'globe', calendar: 'calendar', tasks: 'check2', note: 'note', progress: 'chart' };
const DSK_WALL_PRESETS = [
  { k: 'default', label: 'ค่าเริ่มต้น (ชมพูพาสเทล)' },
  { k: 'couple', label: 'คู่รัก' }, { k: 'night', label: 'กลางคืน' }, { k: 'sea', label: 'ทะเล' },
  { k: 'sakura', label: 'ซากุระ' }, { k: 'nature', label: 'ธรรมชาติ' }, { k: 'galaxy', label: 'กาแล็กซี' },
];
const DSK_ICON_LABEL = {
  globe: 'โลก', folder: 'โฟลเดอร์', star: 'ดาว', heart: 'หัวใจ', bookmark: 'บุ๊กมาร์ก', bolt: 'สายฟ้า', briefcase: 'งาน',
  rocket: 'จรวด', note: 'โน้ต', chart: 'กราฟ', image: 'รูปภาพ', file: 'ไฟล์', megaphone: 'ประกาศ', users: 'ทีม',
  shield: 'โล่', code: 'โค้ด', mail: 'อีเมล', cart: 'ตะกร้า', box: 'กล่อง', calendar: 'ปฏิทิน',
};
const DSK_EDIT_TASK_CATEGORIES = ['todo', 'work', 'deadline'];

// ---------------------------------------------------------------- helpers
const dskClone = (v) => JSON.parse(JSON.stringify(v));
const dskDirty = () => !!DSK.layout && JSON.stringify(DSK.layout) !== DSK.saved;
const dskCols = () => (DSK.data && DSK.data.catalog.cols) || 4;
const dskModule = (key) => DSK.data.catalog.modules.find((m) => m.key === key);
const dskIconById = (id) => DSK.layout.icons.find((i) => i.id === id);
const dskHasImage = (v) => typeof v === 'string' && v.startsWith('data:image/');
function dskSet(id, html) { const el = document.getElementById(id); if (el) el.innerHTML = html; }
function dskAddDays(day, n) {
  const d = new Date(day + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function dskDayLabel(day) {
  try {
    return new Intl.DateTimeFormat('th-TH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(day + 'T00:00:00Z'));
  } catch (_) { return day; }
}
function dskName(ic) {
  if (ic.name) return ic.name;
  if (ic.kind === 'module') { const m = dskModule(ic.key); return m ? m.label : ic.key; }
  return 'ทางลัด';
}
function dskArt(ic) {
  if (dskHasImage(ic.icon)) return `<img src="${ic.icon}" alt="" draggable="false">`;
  if (ic.kind === 'module') { const m = dskModule(ic.key); return icon(ic.icon || (m && m.icon) || 'box'); }
  return icon(ic.icon || 'globe');
}
// Occupied slots are those of visible icons; hidden icons do not take a cell.
function dskOccupied(exceptId) {
  return new Set(DSK.layout.icons.filter((i) => !i.hidden && i.id !== exceptId).map((i) => i.slot));
}
function dskNearestFree(target, exceptId) {
  const taken = dskOccupied(exceptId);
  const cols = dskCols();
  const tr = Math.floor(target / cols);
  const tc = target % cols;
  let best = null;
  let bestD = Infinity;
  for (let s = 0; s <= 199; s += 1) {
    if (taken.has(s)) continue;
    const d = Math.abs(Math.floor(s / cols) - tr) + Math.abs((s % cols) - tc);
    if (d < bestD) { best = s; bestD = d; }
  }
  return best == null ? 0 : best;
}
function dskNewId(prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function dskReadImage(file, maxChars, cb) {
  if (!file) return;
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { toast('รองรับเฉพาะไฟล์ PNG, JPEG หรือ WebP', 'err'); return; }
  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result || '');
    if (text.length > maxChars) { toast('ไฟล์นี้ใหญ่เกินไป กรุณาเลือกภาพขนาดเล็กลง', 'err'); return; }
    cb(text);
  };
  reader.readAsDataURL(file);
}
function dskCheckUrl(value) {
  try {
    const p = new URL(String(value || '').trim());
    if (p.protocol === 'https:' || p.protocol === 'http:') return p.toString();
  } catch (_) { /* fall through */ }
  return null;
}

// ---------------------------------------------------------------- page
async function renderDesktop() {
  setPageHead(PAGE_TITLES.desktop || 'My Desktop', 'โต๊ะทำงานของฉัน จัดวางแอป วิดเจ็ต และทางลัดได้ตามต้องการ');
  const data = await apiGet('/api/desktop');
  DSK.data = data;
  DSK.layout = dskClone(data.layout);
  DSK.saved = JSON.stringify(data.layout);
  DSK.edit = false;
  DSK.day = todayStr();
  DSK.w = {};
  dskPaint();
  dskLoadWeather();
  dskLoadDay();
  dskLoadTasks();
  dskLoadNote();
  dskLoadProgress();
  dskTick();
  S.timers = S.timers || [];
  S.timers.push(setInterval(dskTick, 1000));
}

function dskWidgetHtml(kind) {
  const w = DSK.w;
  const skel = '<div class="hw-skel"><span></span><span></span><span></span></div>';
  if (kind === 'clock') {
    return `<div class="dsk-clock">
        <div class="dsk-clock-time"><b id="dskTime">--:--</b><span id="dskDate"></span></div>
        <button type="button" class="dsk-weather" data-action="dsk-weather-detail" aria-label="ดูรายละเอียดสภาพอากาศ">
          <span class="dsk-sun" aria-hidden="true"></span>
          <span id="dskWeatherBox">${dskWeatherInner(w.weather)}</span>
        </button>
      </div>`;
  }
  if (kind === 'calendar') {
    return `<div class="dsk-day-nav">
        <button type="button" class="dsk-iconbtn" data-action="dsk-day" data-d="-1" aria-label="วันก่อนหน้า">${icon('chevLeft', 'sm')}</button>
        <b>${esc(dskDayLabel(DSK.day))}</b>
        <button type="button" class="dsk-iconbtn" data-action="dsk-day" data-d="1" aria-label="วันถัดไป">${icon('chevRight', 'sm')}</button>
      </div>
      <div id="dskCalList" class="dsk-list">${w.events === undefined ? skel : dskEventsInner(w.events)}</div>
      <button type="button" class="dsk-add" data-action="dsk-event-new">${icon('plus', 'sm')} เพิ่มนัดหมาย</button>`;
  }
  if (kind === 'tasks') {
    return `<div class="dsk-count"><span>ยังไม่เสร็จ</span><b id="dskTaskCount">${w.tasks ? w.tasks.length : '–'}</b></div>
      <div id="dskTaskList" class="dsk-list">${w.tasks === undefined ? skel : dskTasksInner(w.tasks)}</div>
      <button type="button" class="dsk-add" data-action="dsk-task-new">${icon('plus', 'sm')} เพิ่มงาน</button>`;
  }
  if (kind === 'note') {
    return `<div id="dskNoteBody">${dskNoteInner()}</div>`;
  }
  if (kind === 'progress') {
    return `<div id="dskProgList" class="dsk-list">${w.progress === undefined ? skel : dskProgressInner(w.progress)}</div>
      <button type="button" class="dsk-add" data-action="dsk-open-projects">${icon('folder', 'sm')} เปิดโปรเจ็กต์</button>`;
  }
  return '';
}

function dskWeatherInner(w) {
  if (w === undefined) return '<span class="dsk-muted">กำลังโหลดอากาศ…</span>';
  if (!w || !w.ok) return `<span class="dsk-muted">${esc((w && w.error) || 'ดึงข้อมูลอากาศไม่สำเร็จ')}</span>`;
  return `<b>${Math.round(w.temperature)}°C</b><span>${esc(w.condition)}</span><small>${esc(w.place)}</small>`;
}
function dskEventsInner(items) {
  if (!items.length) return '<p class="dsk-muted">วันนี้ยังไม่มีนัดหมาย</p>';
  return items.map((e) => `<button type="button" class="dsk-ev" style="--ev:${esc(e.color || '#FF4F9A')}" data-action="dsk-event" data-id="${esc(e.id)}">
      <span class="dsk-ev-time">${esc(e.startTime || 'ทั้งวัน')}${e.endTime ? ' – ' + esc(e.endTime) : ''}</span>
      <b class="ellipsis">${esc(e.title)}</b></button>`).join('');
}
function dskTasksInner(items) {
  if (!items.length) return '<p class="dsk-muted">วันนี้ไม่มีงานที่ค้างอยู่</p>';
  return items.map((e) => `<label class="dsk-task">
      <input type="checkbox" data-change="dsk-task" data-id="${esc(e.id)}">
      <button type="button" class="dsk-task-title ellipsis" data-action="dsk-event" data-id="${esc(e.id)}">${esc(e.title)}</button>
      <small>${esc(e.startTime || '')}</small></label>`).join('');
}
function dskProgressInner(p) {
  const items = (p.items || []).slice(0, 3);
  if (!items.length) return '<p class="dsk-muted">ยังไม่มีโปรเจ็กต์ที่กำลังดำเนินการ</p>';
  return items.map((it) => `<div class="dsk-pj">
      <div class="dsk-pj-top"><b class="ellipsis">${esc(it.name)}</b>
        <span>${it.percent == null ? 'ยังไม่มีข้อมูล' : it.percent + '%'}</span></div>
      <div class="dsk-bar"><i style="width:${it.percent == null ? 0 : it.percent}%"></i></div>
      <small>${it.total ? `เสร็จ ${it.done} จาก ${it.total} งาน` : 'ยังไม่มีงานที่ผูกกับโปรเจ็กต์นี้'}</small>
    </div>`).join('');
}
function dskNoteInner() {
  const n = DSK.w.note;
  if (n === undefined) return '<div class="hw-skel"><span></span><span></span></div>';
  if (!DSK.data.quickNote) {
    return `<p class="dsk-muted">ยังไม่มีโน้ตด่วน</p>
      <div class="dsk-row2"><button type="button" class="dsk-add" data-action="dsk-note-new">${icon('plus', 'sm')} สร้างโน้ตด่วน</button>
      <button type="button" class="dsk-add" data-action="dsk-note-pick">เลือกโน้ต</button></div>`;
  }
  if (DSK.data.quickNote.isSensitive || (n && n.sensitive)) {
    return `<div class="dsk-secret">${icon('lock', 'sm')} <span>โน้ตนี้เป็นข้อมูลลับ จึงไม่แสดงบนหน้า My Desktop</span></div>
      <button type="button" class="dsk-add" data-action="dsk-note-pick">เลือกโน้ตอื่น</button>`;
  }
  if (!n || n.error) return `<p class="dsk-muted">${esc((n && n.error) || 'โหลดโน้ตไม่สำเร็จ')}</p>`;
  return `<div class="dsk-note-head"><span class="dsk-pin" title="โน้ตที่ปักหมุด">${icon('bookmark', 'sm')}</span>
      <small id="dskNoteStatus">บันทึกอัตโนมัติหลังหยุดพิมพ์</small>
      <button type="button" class="dsk-mini" data-action="dsk-note-expand" aria-label="ขยายโน้ต">${icon('zoom', 'sm')}</button>
      <button type="button" class="dsk-mini" data-action="dsk-note-pick" aria-label="เปลี่ยนโน้ต">${icon('list', 'sm')}</button></div>
    <textarea id="dskNoteText" class="dsk-note-text" maxlength="5000" placeholder="พิมพ์โน้ตที่นี่…" aria-label="เนื้อหาโน้ตด่วน">${esc(n.content || '')}</textarea>
    <small class="dsk-muted">${esc(n.title)}</small>`;
}

function dskPaint() {
  dskNoteFlush();
  const L = DSK.layout;
  const edit = DSK.edit;
  const cols = dskCols();
  const visible = L.icons.filter((i) => !i.hidden);
  const occupied = new Set(visible.map((i) => i.slot));
  const maxSlot = visible.length ? Math.max(...visible.map((i) => i.slot)) : 0;
  let slots = '';
  if (edit) {
    const rows = Math.floor(Math.max(maxSlot, 7) / cols) + 2;
    for (let s = 0; s < rows * cols; s += 1) {
      if (occupied.has(s)) continue;
      slots += `<div class="dsk-slot" data-slot="${s}" style="grid-column:${(s % cols) + 1};grid-row:${Math.floor(s / cols) + 1}" aria-hidden="true"></div>`;
    }
  }
  const apps = visible.map((ic) => {
    const idx = L.icons.indexOf(ic);
    const name = dskName(ic);
    const tone = DSK_TONES[idx % DSK_TONES.length];
    return `<div class="dsk-app" data-id="${esc(ic.id)}" style="grid-column:${(ic.slot % cols) + 1};grid-row:${Math.floor(ic.slot / cols) + 1}">
        <button type="button" class="dsk-app-btn" data-action="dsk-open" data-id="${esc(ic.id)}" aria-label="เปิด ${esc(name)}">
          <span class="dsk-app-ic tone-${tone}">${dskArt(ic)}</span><span class="dsk-app-name">${esc(name)}</span></button>
        ${edit ? `<div class="dsk-app-tools">
          <button type="button" class="dsk-mini" data-action="dsk-icon-edit" data-id="${esc(ic.id)}" aria-label="แก้ไข ${esc(name)}">${icon('edit', 'sm')}</button>
          <button type="button" class="dsk-mini" data-action="dsk-icon-hide" data-id="${esc(ic.id)}" aria-label="ซ่อน ${esc(name)}">${icon('close', 'sm')}</button></div>` : ''}
      </div>`;
  }).join('');
  const dock = L.dock.map((id) => {
    const ic = dskIconById(id);
    if (!ic || ic.hidden) return '';
    const name = dskName(ic);
    return `<button type="button" class="dsk-dock-btn" data-action="dsk-open" data-id="${esc(id)}" title="${esc(name)}" aria-label="${esc(name)}"><span class="dsk-dock-ic">${dskArt(ic)}</span></button>`;
  }).join('');
  const widgets = L.widgets.map((w, idx) => `<section class="dsk-w dsk-w-${w.kind} ${w.size === 'lg' ? 'is-lg' : ''}" data-kind="${w.kind}">
      <header class="dsk-w-head">${icon(DSK_WIDGET_ICON[w.kind] || 'box', 'sm')}<h3>${esc(DSK_WIDGET_TITLE[w.kind])}</h3>
      ${edit ? `<div class="dsk-w-tools">
        <button type="button" class="dsk-mini" data-action="dsk-w-move" data-kind="${w.kind}" data-dir="-1" ${idx === 0 ? 'disabled' : ''} aria-label="เลื่อนขึ้น">↑</button>
        <button type="button" class="dsk-mini" data-action="dsk-w-move" data-kind="${w.kind}" data-dir="1" ${idx === L.widgets.length - 1 ? 'disabled' : ''} aria-label="เลื่อนลง">↓</button>
        <button type="button" class="dsk-mini" data-action="dsk-w-size" data-kind="${w.kind}" aria-label="ปรับขนาด">${w.size === 'lg' ? 'เล็ก' : 'ใหญ่'}</button>
        <button type="button" class="dsk-mini" data-action="dsk-w-remove" data-kind="${w.kind}" aria-label="ลบ Widget">${icon('trash', 'sm')}</button></div>` : ''}</header>
      <div class="dsk-w-body">${dskWidgetHtml(w.kind)}</div>
    </section>`).join('');
  const dirty = dskDirty();

  const top = `<div class="dsk-top">
      <div class="dsk-title"><h2>My Desktop</h2><p>โต๊ะทำงานของฉัน จัดวางแอป วิดเจ็ต และทางลัดได้ตามต้องการ</p></div>
      <div class="dsk-tools">
        ${edit ? '' : `<button type="button" class="dsk-customize" data-action="dsk-edit-on">${icon('edit', 'sm')} ปรับแต่ง Desktop</button>`}
        <button type="button" class="dsk-round" data-action="dsk-apps-list" aria-label="แสดงรายการแอป" title="รายการแอป">${icon('grid', 'sm')}</button>
        <button type="button" class="dsk-round" data-action="dsk-bell" aria-label="การแจ้งเตือน" title="การแจ้งเตือน">${icon('bell', 'sm')}</button>
        <button type="button" class="dsk-round" data-action="dsk-fullscreen" aria-label="ขยายเต็มจอ" title="ขยายเต็มจอ">${icon('external', 'sm')}</button>
      </div></div>`;
  const editBar = edit ? `<div class="dsk-editbar" role="toolbar" aria-label="เครื่องมือปรับแต่ง">
      <button type="button" class="dsk-chip" data-action="dsk-wall-open">${icon('image', 'sm')} เปลี่ยนพื้นหลัง</button>
      <button type="button" class="dsk-chip" data-action="dsk-add-open">${icon('plus', 'sm')} เพิ่มแอป</button>
      <button type="button" class="dsk-chip" data-action="dsk-widget-add">${icon('plus', 'sm')} เพิ่ม Widget</button>
      <button type="button" class="dsk-chip" data-action="dsk-dock-open">${icon('box', 'sm')} จัดการ Dock</button>
      <button type="button" class="dsk-chip" data-action="dsk-reset">${icon('refresh', 'sm')} คืนค่าเริ่มต้น</button>
      <label class="dsk-chip dsk-toggle"><input type="checkbox" data-change="dsk-anim" ${L.animation !== false ? 'checked' : ''}> แอนิเมชัน</label>
      <span class="dsk-status ${dirty ? 'is-dirty' : ''}">${dirty ? 'มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก' : 'ไม่มีการเปลี่ยนแปลง'}</span>
      <button type="button" class="dsk-chip ghost" data-action="dsk-cancel">ยกเลิก</button>
      <button type="button" class="dsk-chip primary" data-action="dsk-save">${icon('check', 'sm')} บันทึกการจัดวาง</button>
    </div>` : '';

  fillPage(`<div class="dsk ${edit ? 'is-edit' : ''} ${L.animation === false ? 'no-anim' : ''}" id="dsk">
    <div class="dsk-wall" id="dskWall" aria-hidden="true"></div>
    <div class="dsk-deco" aria-hidden="true"><span class="dsk-moon"></span><i class="dsk-star s1"></i><i class="dsk-star s2"></i><i class="dsk-star s3"></i><i class="dsk-star s4"></i><span class="dsk-cloud c1"></span><span class="dsk-cloud c2"></span></div>
    ${top}
    ${editBar}
    <div class="dsk-body">
      <section class="dsk-apps ${edit ? 'is-edit' : ''}" id="dskApps" aria-label="แอปบนเดสก์ท็อป" style="grid-template-columns:repeat(${cols},minmax(0,1fr))">
        ${slots}${apps}
      </section>
      <div class="dsk-widgets" id="dskWidgets">${widgets}</div>
    </div>
    <nav class="dsk-dock ${edit ? 'is-edit' : ''}" aria-label="Dock">${dock || '<span class="dsk-muted">Dock ว่างอยู่ เพิ่มทางลัดได้ที่ จัดการ Dock</span>'}</nav>
    <img class="dsk-mascot" src="/assets/welcome-egg.png" width="120" height="102" alt="" decoding="async" aria-hidden="true">
  </div>`);

  // A custom wallpaper is set as a property, never inside an HTML attribute.
  const wall = document.getElementById('dskWall');
  if (wall) {
    if (L.wallpaper.type === 'custom' && dskHasImage(L.wallpaper.dataUrl)) {
      wall.style.backgroundImage = `url("${L.wallpaper.dataUrl}")`;
      wall.classList.add('is-photo');
    } else if (L.wallpaper.type === 'preset' && L.wallpaper.key !== 'default') {
      wall.style.backgroundImage = `url("/assets/theme/theme-${L.wallpaper.key}.jpg")`;
      wall.classList.add('is-photo');
    }
  }
  dskTick();
}

// ---------------------------------------------------------------- live data for widgets
function dskTick() {
  const t = document.getElementById('dskTime');
  if (!t) return;
  const now = new Date();
  t.textContent = new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: S.tz || 'Asia/Bangkok' }).format(now);
  const d = document.getElementById('dskDate');
  if (d) d.textContent = homeDateTh();
}

async function dskLoadWeather() {
  try { DSK.w.weather = await apiGet('/api/dashboard/weather'); } catch (err) { DSK.w.weather = { ok: false, error: 'ดึงข้อมูลอากาศไม่สำเร็จ ลองอีกครั้งภายหลัง' }; }
  dskSet('dskWeatherBox', dskWeatherInner(DSK.w.weather));
}
async function dskLoadDay() {
  try {
    const r = await apiGet(`/api/events?from=${DSK.day}&to=${DSK.day}`);
    DSK.w.events = r.items || [];
  } catch (err) { DSK.w.events = []; toast('โหลดนัดหมายไม่สำเร็จ', 'err'); }
  dskSet('dskCalList', dskEventsInner(DSK.w.events));
}
async function dskLoadTasks() {
  try {
    const d = await apiGet('/api/dashboard');
    DSK.w.tasks = (d.todayEvents || []).filter((e) => DSK_EDIT_TASK_CATEGORIES.includes(e.category));
  } catch (err) { DSK.w.tasks = []; }
  const c = document.getElementById('dskTaskCount');
  if (c) c.textContent = String(DSK.w.tasks.length);
  dskSet('dskTaskList', dskTasksInner(DSK.w.tasks));
}
async function dskLoadNote() {
  const q = DSK.data && DSK.data.quickNote;
  if (!q) { DSK.w.note = null; dskSet('dskNoteBody', dskNoteInner()); return; }
  if (q.isSensitive) { DSK.w.note = { sensitive: true }; dskSet('dskNoteBody', dskNoteInner()); return; }
  try {
    const n = await apiGet('/api/notes/' + encodeURIComponent(q.id));
    DSK.w.note = { id: n.id, title: n.title, content: n.content || '', sensitive: !!n.isSensitive };
  } catch (err) { DSK.w.note = { error: 'โหลดโน้ตไม่สำเร็จ' }; }
  dskSet('dskNoteBody', dskNoteInner());
}
async function dskLoadProgress() {
  try { DSK.w.progress = await apiGet('/api/desktop/progress'); } catch (err) { DSK.w.progress = { items: [] }; }
  dskSet('dskProgList', dskProgressInner(DSK.w.progress));
}

// Quick note: autosave after the user stops typing for a moment.
function dskNoteSave() {
  const n = DSK.w.note;
  const box = document.getElementById('dskNoteText');
  if (!n || !n.id || !box || !DSK.noteDirty) return Promise.resolve();
  DSK.noteDirty = false;
  const content = box.value;
  const status = document.getElementById('dskNoteStatus');
  if (status) status.textContent = 'กำลังบันทึก…';
  n.content = content;
  return apiPatch('/api/notes/' + encodeURIComponent(n.id), { title: n.title, content, isSensitive: false })
    .then(() => {
      const s = document.getElementById('dskNoteStatus');
      if (s) s.textContent = 'บันทึกแล้ว ' + new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: S.tz || 'Asia/Bangkok' });
    })
    .catch((err) => { DSK.noteDirty = true; const s = document.getElementById('dskNoteStatus'); if (s) s.textContent = 'บันทึกไม่สำเร็จ: ' + err.message; });
}
function dskNoteFlush() {
  clearTimeout(DSK.noteTimer);
  DSK.noteTimer = 0;
  if (DSK.noteDirty) dskNoteSave();
}
document.addEventListener('input', (e) => {
  const t = e.target;
  if (!t || !t.matches) return;
  if (t.id === 'dskNoteText' || t.id === 'dskNoteBig') {
    DSK.noteDirty = true;
    const inline = document.getElementById('dskNoteText');
    if (inline && t !== inline) inline.value = t.value;
    const big = document.getElementById('dskNoteBig');
    if (big && t !== big) big.value = t.value;
    const status = document.getElementById('dskNoteStatus');
    if (status) status.textContent = 'กำลังพิมพ์…';
    clearTimeout(DSK.noteTimer);
    DSK.noteTimer = setTimeout(() => { DSK.noteTimer = 0; dskNoteSave(); }, 800);
  }
});

// ---------------------------------------------------------------- navigation and actions (view mode)
// Opens what an icon points to: an external https link in a new tab, or a real module of SIINA SYSTEM.
function dskLaunch(ic) {
  if (!ic) return;
  if (ic.kind === 'link') { window.open(ic.url, '_blank', 'noopener,noreferrer'); return; }
  const m = dskModule(ic.key);
  if (!m) return;
  if (m.action === 'notes') { ACTIONS.notes(); return; }
  if (m.route) navigate(m.route);
}
ACTIONS['dsk-open'] = (el) => {
  if (DSK.edit) return; // in edit mode the icon is moved, not opened
  dskLaunch(dskIconById(el.dataset.id));
};
ACTIONS['dsk-open-projects'] = () => navigate('#/projects');
ACTIONS['dsk-bell'] = () => { const b = document.getElementById('bellBtn'); if (b) b.click(); };
ACTIONS['dsk-fullscreen'] = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch (err) { toast('เปิดโหมดเต็มจอไม่ได้ในเบราว์เซอร์นี้', 'err'); }
};
ACTIONS['dsk-apps-list'] = () => {
  const items = DSK.layout.icons.filter((i) => !i.hidden);
  openModal({
    title: 'รายการแอป',
    body: `<div class="dsk-launcher">${items.map((ic) => `<button type="button" class="dsk-launch" data-action="dsk-launch" data-id="${esc(ic.id)}">
        <span class="dsk-app-ic">${dskArt(ic)}</span><span>${esc(dskName(ic))}</span></button>`).join('') || '<p class="dsk-muted">ยังไม่มีแอปบนหน้านี้</p>'}</div>`,
  });
};
ACTIONS['dsk-launch'] = (el) => { closeAllModals(); dskLaunch(dskIconById(el.dataset.id)); };
ACTIONS['dsk-weather-detail'] = () => {
  const w = DSK.w.weather;
  const body = !w || !w.ok
    ? `<p class="dsk-muted">${esc((w && w.error) || 'ยังไม่มีข้อมูลอากาศ')}</p>`
    : `<div class="dsk-wx-detail">
        <div class="dsk-wx-big"><b>${Math.round(w.temperature)}°C</b><span>${esc(w.condition)}</span></div>
        <div class="hw-weather-facts">
          <div>รู้สึกเหมือน ${Math.round(w.feelsLike)}°C</div><div>ความชื้น ${Math.round(w.humidity)}%</div>
          <div>ลม ${Math.round(w.windKmh)} กม./ชม.</div><div>UV ${w.uvIndex == null ? '—' : Math.round(w.uvIndex)}</div>
          <div>โอกาสฝน ${w.rainChance == null ? '—' : w.rainChance + '%'}</div></div>
        <p class="muted small">${esc(w.place)} · แหล่งข้อมูล Open-Meteo</p></div>`;
  openModal({
    title: 'สภาพอากาศ',
    body,
    footer: `<button class="btn ghost" data-action="dsk-weather-refresh">${icon('refresh', 'sm')} รีเฟรช</button>
      <a class="btn ghost" href="#/home">ไปหน้าแรก (เปลี่ยนพื้นที่)</a>`,
  });
};
ACTIONS['dsk-weather-refresh'] = async () => { await dskLoadWeather(); toast('อัปเดตอากาศแล้ว'); };
ACTIONS['dsk-day'] = (el) => {
  DSK.day = dskAddDays(DSK.day, Number(el.dataset.d) || 0);
  const nav = document.querySelector('.dsk-day-nav b');
  if (nav) nav.textContent = dskDayLabel(DSK.day);
  dskSet('dskCalList', '<div class="hw-skel"><span></span><span></span></div>');
  dskLoadDay();
};
ACTIONS['dsk-event'] = (el) => openEventDetail(el.dataset.id);
ACTIONS['dsk-event-new'] = () => openEventForm({ startDate: DSK.day });
ACTIONS['dsk-task-new'] = () => openEventForm({ startDate: todayStr(), category: 'todo' });
document.addEventListener('change', async (e) => {
  const t = e.target;
  if (!t || !t.dataset) return;
  if (t.dataset.change === 'dsk-task') {
    t.disabled = true;
    try {
      await apiPost('/api/dashboard/tasks/' + encodeURIComponent(t.dataset.id) + '/done', { done: t.checked });
      toast('อัปเดตงานแล้ว');
      dskLoadTasks();
    } catch (err) { t.checked = !t.checked; t.disabled = false; toast(err.message, 'err'); }
  }
});
ACTIONS['dsk-note-new'] = async () => {
  try {
    const n = await apiPost('/api/notes', { title: 'โน้ตด่วน', content: '', isSensitive: false });
    const r = await apiPut('/api/desktop/quick-note', { noteId: n.id });
    DSK.data.quickNote = r.quickNote;
    await dskLoadNote();
  } catch (err) { toast(err.message, 'err'); }
};
ACTIONS['dsk-note-pick'] = async () => {
  let items = [];
  try { items = (await apiGet('/api/notes')).items || []; } catch (err) { toast(err.message, 'err'); return; }
  const usable = items.filter((n) => !n.isSensitive);
  openModal({
    title: 'เลือกโน้ตด่วน',
    body: `<div class="stack">
      <p class="muted small">โน้ตที่ปักหมุดจะแสดงบน My Desktop โน้ตที่เป็นข้อมูลลับเลือกไม่ได้</p>
      <div class="dsk-note-pick">${usable.map((n) => `<button type="button" class="dsk-pick" data-action="dsk-note-set" data-id="${esc(n.id)}">
          <b class="ellipsis">${esc(n.title)}</b><small class="ellipsis">${esc(n.preview || '')}</small></button>`).join('') || '<p class="dsk-muted">ยังไม่มีโน้ต</p>'}</div>
      <button type="button" class="btn ghost" data-action="dsk-note-new">${icon('plus', 'sm')} สร้างโน้ตใหม่เป็นโน้ตด่วน</button></div>`,
  });
};
ACTIONS['dsk-note-set'] = async (el) => {
  try {
    const r = await apiPut('/api/desktop/quick-note', { noteId: el.dataset.id });
    DSK.data.quickNote = r.quickNote;
    closeAllModals();
    await dskLoadNote();
    toast('ปักหมุดโน้ตด่วนแล้ว');
  } catch (err) { toast(err.message, 'err'); }
};
ACTIONS['dsk-note-expand'] = () => {
  const n = DSK.w.note;
  if (!n || !n.id) return;
  openModal({
    title: n.title || 'โน้ตด่วน',
    wide: true,
    body: `<textarea id="dskNoteBig" class="dsk-note-big" maxlength="5000" aria-label="เนื้อหาโน้ต">${esc(n.content || '')}</textarea>
      <p class="muted small">บันทึกอัตโนมัติหลังหยุดพิมพ์</p>`,
    onMount: (modal) => {
      const box = modal.querySelector('#dskNoteBig');
      if (box) box.focus();
    },
  });
};

// ---------------------------------------------------------------- edit mode
ACTIONS['dsk-edit-on'] = () => { DSK.edit = true; dskPaint(); };
function dskDiscard() { DSK.layout = dskClone(JSON.parse(DSK.saved)); DSK.edit = false; dskPaint(); }
ACTIONS['dsk-cancel'] = () => {
  if (!dskDirty()) { dskDiscard(); return; }
  openModal({
    title: 'ยกเลิกการเปลี่ยนแปลง',
    body: '<p>การจัดวางที่ยังไม่ได้บันทึกจะหายไป ต้องการยกเลิกหรือไม่</p>',
    footer: `<button class="btn ghost" data-action="close-modal">กลับไปแก้ไข</button>
      <button class="btn primary" data-action="dsk-cancel-confirm">ยกเลิกการเปลี่ยนแปลง</button>`,
  });
};
ACTIONS['dsk-cancel-confirm'] = () => { closeAllModals(); dskDiscard(); };
ACTIONS['dsk-save'] = async (el) => {
  try {
    const r = await busy(el, () => apiPut('/api/desktop', { layout: DSK.layout }));
    DSK.data = { ...DSK.data, ...r };
    DSK.layout = dskClone(r.layout);
    DSK.saved = JSON.stringify(r.layout);
    DSK.edit = false;
    dskPaint();
    toast('บันทึกการจัดวาง My Desktop แล้ว');
  } catch (err) { toast(err.message, 'err'); }
};
ACTIONS['dsk-reset'] = () => {
  openModal({
    title: 'คืนค่าเริ่มต้น',
    body: '<p>จะกลับไปใช้การจัดวางและพื้นหลังเริ่มต้น การจัดวางที่คุณทำไว้จะถูกลบ ต้องการทำต่อหรือไม่</p>',
    footer: `<button class="btn ghost" data-action="close-modal">ยกเลิก</button>
      <button class="btn primary" data-action="dsk-reset-confirm">คืนค่าเริ่มต้น</button>`,
  });
};
ACTIONS['dsk-reset-confirm'] = async (el) => {
  try {
    const r = await busy(el, () => apiDelete('/api/desktop'));
    closeAllModals();
    DSK.data = { ...DSK.data, ...r };
    DSK.layout = dskClone(r.layout);
    DSK.saved = JSON.stringify(r.layout);
    DSK.edit = false;
    dskPaint();
    toast('คืนค่าการจัดวางเริ่มต้นแล้ว');
  } catch (err) { toast(err.message, 'err'); }
};
document.addEventListener('change', (e) => {
  if (!e.target.dataset || e.target.dataset.change !== 'dsk-anim') return;
  DSK.layout.animation = e.target.checked;
  dskPaint();
});

// Hide, edit and add icons
ACTIONS['dsk-icon-hide'] = (el) => {
  const ic = dskIconById(el.dataset.id);
  if (!ic) return;
  ic.hidden = true;
  DSK.layout.dock = DSK.layout.dock.filter((id) => id !== ic.id);
  dskPaint();
};
function dskIconFormBody(ic, isNew) {
  const isLink = !ic || ic.kind === 'link';
  const current = ic ? (ic.icon || '') : 'globe';
  const grid = ICON_NAMES_CLIENT().map((n) => `<button type="button" class="dsk-pick-icon ${current === n ? 'is-on' : ''}" data-action="dsk-pick-icon" data-name="${n}" aria-label="${esc(DSK_ICON_LABEL[n] || n)}" title="${esc(DSK_ICON_LABEL[n] || n)}">${icon(n)}</button>`).join('');
  return `<label class="field"><span>ชื่อ${isLink ? ' *' : ' (เว้นว่างเพื่อใช้ชื่อเดิม)'}</span>
      <input class="input" name="name" maxlength="40" value="${esc(ic && ic.name ? ic.name : '')}" ${isLink ? 'required' : ''} placeholder="${ic && ic.kind === 'module' ? esc(dskName(ic)) : 'เช่น เว็บข่าว'}"></label>
    ${isLink ? `<label class="field"><span>ลิงก์ (ต้องขึ้นต้นด้วย https:// หรือ http://) *</span>
      <input class="input" name="url" type="url" maxlength="500" required value="${esc(ic && ic.url ? ic.url : '')}" placeholder="https://..."></label>` : ''}
    <label class="field"><span>หมวดหมู่ (ไม่บังคับ)</span><input class="input" name="category" maxlength="40" value="${esc(ic && ic.category ? ic.category : '')}"></label>
    <div class="field"><span>ไอคอน</span>
      <div class="dsk-icon-picks">${grid}</div>
      <input type="hidden" name="icon" value="${esc(dskHasImage(current) ? '' : current)}">
      <input type="hidden" name="iconImage" value="${esc(dskHasImage(current) ? current : '')}">
      <label class="btn ghost dsk-upload">${icon('upload', 'sm')} อัปโหลดไอคอนเอง<input type="file" accept="image/png,image/jpeg,image/webp" data-change="dsk-icon-file" hidden></label>
      <small class="muted">รองรับ PNG, JPEG, WebP ขนาดไม่เกิน 150 KB</small></div>
    ${isNew ? '' : (ic.kind === 'link' ? `<button type="button" class="btn ghost danger" data-action="dsk-link-delete" data-id="${esc(ic.id)}">${icon('trash', 'sm')} ลบทางลัดนี้</button>` : '')}
    <p class="small" data-role="form-error"></p>
    <div class="row" style="justify-content:flex-end"><button type="button" class="btn ghost" data-action="close-modal">ยกเลิก</button>
      <button type="submit" class="btn primary">บันทึกในหน้าจอ</button></div>`;
}
function ICON_NAMES_CLIENT() { return (DSK.data && DSK.data.catalog.iconNames) || Object.keys(DSK_ICON_LABEL); }
ACTIONS['dsk-icon-edit'] = (el) => {
  const ic = dskIconById(el.dataset.id);
  if (!ic) return;
  openModal({
    title: ic.kind === 'link' ? 'แก้ไขทางลัด' : 'แก้ไขแอป',
    body: `<form data-form="dsk-icon-edit" data-id="${esc(ic.id)}" class="stack">${dskIconFormBody(ic, false)}</form>`,
    onMount: (modal) => dskBindIconForm(modal),
  });
};
ACTIONS['dsk-pick-icon'] = (el) => {
  const form = el.closest('form');
  if (!form) return;
  form.querySelector('[name="icon"]').value = el.dataset.name;
  form.querySelector('[name="iconImage"]').value = '';
  form.querySelectorAll('.dsk-pick-icon').forEach((b) => b.classList.toggle('is-on', b === el));
};
function dskBindIconForm(modal) {
  modal.querySelectorAll('[data-change="dsk-icon-file"]').forEach((input) => {
    input.addEventListener('change', () => {
      dskReadImage(input.files[0], 150000, (dataUrl) => {
        const form = input.closest('form');
        form.querySelector('[name="iconImage"]').value = dataUrl;
        form.querySelector('[name="icon"]').value = '';
        form.querySelectorAll('.dsk-pick-icon').forEach((b) => b.classList.remove('is-on'));
        toast('เลือกไอคอนแล้ว');
      });
    });
  });
}
ACTIONS['dsk-link-delete'] = (el) => {
  const id = el.dataset.id;
  DSK.layout.icons = DSK.layout.icons.filter((i) => i.id !== id);
  DSK.layout.dock = DSK.layout.dock.filter((x) => x !== id);
  closeAllModals();
  dskPaint();
};
FORMS['dsk-icon-edit'] = (form) => {
  const ic = dskIconById(form.dataset.id);
  if (!ic) return;
  const name = form.querySelector('[name="name"]').value.trim();
  const category = form.querySelector('[name="category"]').value.trim();
  const image = form.querySelector('[name="iconImage"]').value;
  const iconName = form.querySelector('[name="icon"]').value;
  if (ic.kind === 'link') {
    const url = dskCheckUrl(form.querySelector('[name="url"]').value);
    if (!name) { setFormError(form, 'กรุณาตั้งชื่อทางลัด'); return; }
    if (!url) { setFormError(form, 'ลิงก์ต้องขึ้นต้นด้วย https:// หรือ http:// เท่านั้น'); return; }
    ic.url = url;
    ic.name = name;
    ic.icon = image || iconName || ic.icon || 'globe';
  } else {
    ic.name = name || null;
    ic.icon = image || iconName || null;
  }
  ic.category = category;
  closeAllModals();
  dskPaint();
  toast('แก้ไขในหน้าจอแล้ว กดบันทึกการจัดวางเพื่อเก็บถาวร');
};

ACTIONS['dsk-add-open'] = () => {
  const visibleKeys = new Set(DSK.layout.icons.filter((i) => !i.hidden && i.kind === 'module').map((i) => i.key));
  const hiddenModules = DSK.data.catalog.modules.filter((m) => !visibleKeys.has(m.key));
  const hiddenLinks = DSK.layout.icons.filter((i) => i.kind === 'link' && i.hidden);
  openModal({
    title: 'เพิ่มแอปบน Desktop',
    wide: true,
    body: `<div class="dsk-add-tabs" role="tablist">
        <button type="button" class="dsk-tab is-on" data-action="dsk-add-tab" data-tab="inside" role="tab">แอปภายใน SIINA SYSTEM</button>
        <button type="button" class="dsk-tab" data-action="dsk-add-tab" data-tab="link" role="tab">ทางลัดเว็บไซต์</button>
      </div>
      <div id="dskAddBody" class="stack">${dskAddInsideHtml(hiddenModules, hiddenLinks)}</div>`,
  });
};
function dskAddInsideHtml(mods, links) {
  const modRows = mods.map((m) => `<button type="button" class="dsk-pick" data-action="dsk-module-add" data-key="${m.key}">
      <span class="dsk-app-ic">${icon(m.icon)}</span><b class="ellipsis">${esc(m.label)}</b><small>เพิ่ม</small></button>`).join('');
  const linkRows = links.map((l) => `<button type="button" class="dsk-pick" data-action="dsk-link-show" data-id="${esc(l.id)}">
      <span class="dsk-app-ic">${dskArt(l)}</span><b class="ellipsis">${esc(dskName(l))}</b><small>แสดงอีกครั้ง</small></button>`).join('');
  return `<p class="muted small">เลือกโมดูลที่มีอยู่จริงในระบบ ระบบจะไม่สร้างแอปจำลองให้</p>
    <div class="dsk-note-pick">${modRows || '<p class="dsk-muted">โมดูลทั้งหมดอยู่บนหน้านี้แล้ว</p>'}</div>
    ${links.length ? `<h4 class="dsk-h">ทางลัดที่ซ่อนอยู่</h4><div class="dsk-note-pick">${linkRows}</div>` : ''}`;
}
ACTIONS['dsk-add-tab'] = (el) => {
  document.querySelectorAll('.dsk-tab').forEach((b) => b.classList.toggle('is-on', b === el));
  const body = document.getElementById('dskAddBody');
  if (!body) return;
  if (el.dataset.tab === 'link') {
    body.innerHTML = `<form data-form="dsk-link" class="stack">${dskIconFormBody(null, true)}</form>`;
    dskBindIconForm(body);
    return;
  }
  const visibleKeys = new Set(DSK.layout.icons.filter((i) => !i.hidden && i.kind === 'module').map((i) => i.key));
  const hiddenModules = DSK.data.catalog.modules.filter((m) => !visibleKeys.has(m.key));
  const hiddenLinks = DSK.layout.icons.filter((i) => i.kind === 'link' && i.hidden);
  body.innerHTML = dskAddInsideHtml(hiddenModules, hiddenLinks);
};
ACTIONS['dsk-module-add'] = (el) => {
  const key = el.dataset.key;
  const existing = DSK.layout.icons.find((i) => i.kind === 'module' && i.key === key);
  if (existing) { existing.hidden = false; existing.slot = dskNearestFree(existing.slot, existing.id); }
  else DSK.layout.icons.push({ id: 'm-' + key, kind: 'module', key, name: null, icon: null, category: '', slot: dskNearestFree(0, null), hidden: false });
  closeAllModals();
  dskPaint();
  toast('เพิ่มแอปบนหน้าจอแล้ว กดบันทึกการจัดวางเพื่อเก็บถาวร');
};
ACTIONS['dsk-link-show'] = (el) => {
  const ic = dskIconById(el.dataset.id);
  if (!ic) return;
  ic.hidden = false;
  ic.slot = dskNearestFree(ic.slot, ic.id);
  closeAllModals();
  dskPaint();
};
FORMS['dsk-link'] = (form) => {
  const name = form.querySelector('[name="name"]').value.trim();
  const url = dskCheckUrl(form.querySelector('[name="url"]').value);
  const category = form.querySelector('[name="category"]').value.trim();
  const image = form.querySelector('[name="iconImage"]').value;
  const iconName = form.querySelector('[name="icon"]').value;
  if (!name || name.length > 40) { setFormError(form, 'กรุณาตั้งชื่อทางลัด (ไม่เกิน 40 ตัวอักษร)'); return; }
  if (!url) { setFormError(form, 'ลิงก์ต้องขึ้นต้นด้วย https:// หรือ http:// เท่านั้น'); return; }
  const id = dskNewId('l-');
  DSK.layout.icons.push({ id, kind: 'link', name, url, icon: image || iconName || 'globe', category, slot: dskNearestFree(0, null), hidden: false });
  closeAllModals();
  dskPaint();
  toast('เพิ่มทางลัดแล้ว กดบันทึกการจัดวางเพื่อเก็บถาวร');
};

// Wallpaper
ACTIONS['dsk-wall-open'] = () => {
  const cur = DSK.layout.wallpaper;
  openModal({
    title: 'เปลี่ยนภาพพื้นหลัง',
    wide: true,
    body: `<div class="stack">
      <div class="dsk-wall-grid">${DSK_WALL_PRESETS.map((p) => `<button type="button" class="dsk-wall-pick ${cur.type === 'preset' && cur.key === p.k ? 'is-on' : ''}" data-action="dsk-wall-set" data-key="${p.k}" aria-label="${esc(p.label)}">
          <span class="dsk-wall-thumb ${p.k === 'default' ? 'is-default' : ''}" ${p.k === 'default' ? '' : `style="background-image:url(/assets/theme/theme-${p.k}.jpg)"`}></span>
          <small>${esc(p.label)}</small></button>`).join('')}</div>
      <div class="dsk-upload-row">
        <label class="btn ghost dsk-upload">${icon('upload', 'sm')} อัปโหลดภาพจากเครื่อง<input type="file" accept="image/png,image/jpeg,image/webp" data-change="dsk-wall-file" hidden></label>
        <small class="muted">PNG, JPEG หรือ WebP ไม่เกิน 500 KB ภาพจะถูกปรับให้เต็มพื้นที่แบบไม่ยืดสัดส่วน</small></div>
      <p class="muted small">ภาพที่เลือกจะแสดงทันทีเพื่อดูตัวอย่าง กดบันทึกการจัดวางเพื่อเก็บถาวร</p></div>`,
    onMount: (modal) => {
      const file = modal.querySelector('[data-change="dsk-wall-file"]');
      if (file) file.addEventListener('change', () => dskReadImage(file.files[0], 650000, (dataUrl) => {
        DSK.layout.wallpaper = { type: 'custom', dataUrl };
        dskPaint();
        closeAllModals();
        ACTIONS['dsk-wall-open']();
      }));
    },
  });
};
ACTIONS['dsk-wall-set'] = (el) => {
  DSK.layout.wallpaper = { type: 'preset', key: el.dataset.key };
  dskPaint();
  closeAllModals();
  ACTIONS['dsk-wall-open']();
};

// Widgets
ACTIONS['dsk-w-move'] = (el) => {
  const L = DSK.layout;
  const i = L.widgets.findIndex((w) => w.kind === el.dataset.kind);
  const j = i + Number(el.dataset.dir);
  if (i < 0 || j < 0 || j >= L.widgets.length) return;
  [L.widgets[i], L.widgets[j]] = [L.widgets[j], L.widgets[i]];
  dskPaint();
};
ACTIONS['dsk-w-size'] = (el) => {
  const w = DSK.layout.widgets.find((x) => x.kind === el.dataset.kind);
  if (!w) return;
  w.size = w.size === 'lg' ? 'sm' : 'lg';
  dskPaint();
};
ACTIONS['dsk-w-remove'] = (el) => {
  DSK.layout.widgets = DSK.layout.widgets.filter((w) => w.kind !== el.dataset.kind);
  dskPaint();
};
ACTIONS['dsk-widget-add'] = () => {
  const have = new Set(DSK.layout.widgets.map((w) => w.kind));
  const missing = Object.keys(DSK_WIDGET_TITLE).filter((k) => !have.has(k));
  openModal({
    title: 'เพิ่ม Widget',
    body: `<div class="stack">${missing.map((k) => `<button type="button" class="dsk-pick" data-action="dsk-widget-put" data-kind="${k}">
        <span class="dsk-app-ic">${icon(DSK_WIDGET_ICON[k] || 'box')}</span><b>${esc(DSK_WIDGET_TITLE[k])}</b><small>เพิ่ม</small></button>`).join('') || '<p class="dsk-muted">มี Widget ครบทุกชนิดแล้ว</p>'}</div>`,
  });
};
ACTIONS['dsk-widget-put'] = (el) => {
  DSK.layout.widgets.push({ kind: el.dataset.kind, size: el.dataset.kind === 'clock' || el.dataset.kind === 'progress' ? 'lg' : 'sm' });
  closeAllModals();
  dskPaint();
  if (el.dataset.kind === 'calendar') dskLoadDay();
  if (el.dataset.kind === 'tasks') dskLoadTasks();
  if (el.dataset.kind === 'note') dskLoadNote();
  if (el.dataset.kind === 'progress') dskLoadProgress();
  if (el.dataset.kind === 'clock') dskLoadWeather();
};

// Dock manager
function dskDockBodyHtml() {
  const L = DSK.layout;
  const inDock = L.dock.map((id, idx) => {
    const ic = dskIconById(id);
    if (!ic) return '';
    return `<div class="dsk-dock-row"><span class="dsk-app-ic">${dskArt(ic)}</span><b class="ellipsis">${esc(dskName(ic))}</b>
      <button type="button" class="dsk-mini" data-action="dsk-dock-move" data-id="${esc(id)}" data-dir="-1" ${idx === 0 ? 'disabled' : ''} aria-label="เลื่อนซ้าย">${icon('chevLeft', 'sm')}</button>
      <button type="button" class="dsk-mini" data-action="dsk-dock-move" data-id="${esc(id)}" data-dir="1" ${idx === L.dock.length - 1 ? 'disabled' : ''} aria-label="เลื่อนขวา">${icon('chevRight', 'sm')}</button>
      <button type="button" class="dsk-mini" data-action="dsk-dock-remove" data-id="${esc(id)}" aria-label="นำออกจาก Dock">${icon('close', 'sm')}</button></div>`;
  }).join('');
  const addable = L.icons.filter((i) => !i.hidden && !L.dock.includes(i.id));
  const addRows = addable.map((ic) => `<button type="button" class="dsk-pick" data-action="dsk-dock-add" data-id="${esc(ic.id)}" ${L.dock.length >= DSK.data.catalog.dockLimit ? 'disabled' : ''}>
      <span class="dsk-app-ic">${dskArt(ic)}</span><b class="ellipsis">${esc(dskName(ic))}</b><small>เพิ่ม</small></button>`).join('');
  return `<p class="muted small">ไม่เกิน 10 ไอคอน ใช้ลูกศรเพื่อเรียงลำดับ</p>
    <h4 class="dsk-h">บน Dock (${L.dock.length})</h4>${inDock || '<p class="dsk-muted">Dock ว่างอยู่</p>'}
    <h4 class="dsk-h">เพิ่มเข้า Dock</h4><div class="dsk-note-pick">${addRows || '<p class="dsk-muted">ไม่มีไอคอนให้เพิ่ม</p>'}</div>`;
}
ACTIONS['dsk-dock-open'] = () => openModal({ title: 'จัดการ Dock', wide: true, body: `<div id="dskDockBody" class="stack">${dskDockBodyHtml()}</div>` });
function dskDockRefresh() {
  dskPaint();
  const b = document.getElementById('dskDockBody');
  if (b) b.innerHTML = dskDockBodyHtml();
}
ACTIONS['dsk-dock-add'] = (el) => {
  if (DSK.layout.dock.length >= DSK.data.catalog.dockLimit) { toast('Dock เต็มแล้ว (ไม่เกิน 10 ไอคอน)', 'err'); return; }
  DSK.layout.dock.push(el.dataset.id);
  dskDockRefresh();
};
ACTIONS['dsk-dock-remove'] = (el) => {
  DSK.layout.dock = DSK.layout.dock.filter((id) => id !== el.dataset.id);
  dskDockRefresh();
};
ACTIONS['dsk-dock-move'] = (el) => {
  const L = DSK.layout;
  const i = L.dock.indexOf(el.dataset.id);
  const j = i + Number(el.dataset.dir);
  if (i < 0 || j < 0 || j >= L.dock.length) return;
  [L.dock[i], L.dock[j]] = [L.dock[j], L.dock[i]];
  dskDockRefresh();
};

// ---------------------------------------------------------------- drag and drop (edit mode, mouse, pen and touch)
function dskSlotAt(x, y) {
  const apps = document.getElementById('dskApps');
  if (!apps) return null;
  const r = apps.getBoundingClientRect();
  const cols = dskCols();
  const cellW = r.width / cols;
  const rowH = parseFloat(getComputedStyle(apps).gridAutoRows) || 118;
  const col = Math.min(cols - 1, Math.max(0, Math.floor((x - r.left) / cellW)));
  const row = Math.max(0, Math.floor((y - r.top) / rowH));
  return row * cols + col;
}
document.addEventListener('pointerdown', (e) => {
  if (!DSK.edit || e.button > 0) return;
  const el = e.target.closest && e.target.closest('.dsk-app');
  if (!el || e.target.closest('.dsk-app-tools')) return;
  DSK.drag = { id: el.dataset.id, el, x0: e.clientX, y0: e.clientY, started: false };
});
document.addEventListener('pointermove', (e) => {
  const d = DSK.drag;
  if (!d) return;
  const dx = e.clientX - d.x0;
  const dy = e.clientY - d.y0;
  if (!d.started) {
    if (Math.hypot(dx, dy) < 6) return;
    d.started = true;
    d.el.classList.add('is-drag');
  }
  e.preventDefault();
  d.el.style.transform = `translate(${dx}px, ${dy}px)`;
  const slot = dskSlotAt(e.clientX, e.clientY);
  document.querySelectorAll('.dsk-slot.is-target').forEach((s) => s.classList.remove('is-target'));
  const target = slot == null ? null : document.querySelector(`.dsk-slot[data-slot="${slot}"]`);
  if (target) target.classList.add('is-target');
}, { passive: false });
function dskEndDrag(e) {
  const d = DSK.drag;
  if (!d) return;
  DSK.drag = null;
  if (!d.started) return;
  const slot = dskSlotAt(e.clientX, e.clientY);
  const ic = dskIconById(d.id);
  if (ic && slot != null && slot !== ic.slot) {
    const occupied = DSK.layout.icons.some((i) => !i.hidden && i.id !== ic.id && i.slot === slot);
    // Nothing is stacked: a taken cell sends the icon to the nearest free cell.
    ic.slot = occupied ? dskNearestFree(slot, ic.id) : slot;
    dskPaint();
    return;
  }
  dskPaint();
}
document.addEventListener('pointerup', dskEndDrag);
document.addEventListener('pointercancel', dskEndDrag);

