/* SIINA SYSTEM — chat categories (หมวดห้องแชท): icon bar above the room list, add / edit popup,
   right-click or long-press menu, and the welcome screen that opens no room by itself. */
'use strict';

const CAT_ICONS = ['star', 'zap', 'chat', 'users', 'calendar', 'megaphone', 'bookmark', 'check2', 'briefcase', 'heart', 'shield', 'file', 'bell', 'note'];
const CAT_COLORS = ['#FFD86B', '#FF7A59', '#FF5AA5', '#B57BFF', '#6FB7FF', '#5CE1B0', '#FFA3C7', '#9AA0FF'];

// The bar above the room list: "ทั้งหมด" (pink capsule) then one round icon per category, then "+".
function catBarHtml() {
  const cats = S.chat.categories || [];
  const cur = S.chat.category || 'all';
  const all = `<button type="button" class="cat-all" aria-pressed="${cur === 'all'}" data-action="chat-category" data-id="all">ทั้งหมด</button>`;
  const dots = cats.map((c) => `<button type="button" class="cat-dot" aria-pressed="${cur === c.id}" style="--cat:${esc(c.color)}"
    data-action="chat-category" data-id="${esc(c.id)}" data-cat-id="${esc(c.id)}" title="${esc(c.name)}" aria-label="${esc(c.name)}">${icon(c.icon)}</button>`).join('');
  const add = `<button type="button" class="cat-dot cat-add" data-action="cat-new" title="เพิ่มหมวด" aria-label="เพิ่มหมวด">${icon('plus')}</button>`;
  return `<nav class="cat-bar" aria-label="หมวดห้องแชท">${all}${dots}${add}</nav>`;
}

ACTIONS['chat-category'] = (el) => {
  S.chat.category = el.dataset.id || 'all';
  renderChat({ keep: true });
};

// Welcome: no room is opened on entry. The egg mascot floats until the user picks a room.
function chatWelcomeHtml() {
  return `<div class="cv-welcome">
    <div class="cv-welcome-egg">${eggHtml({ size: 190 })}</div>
    <h3>น้องไข่ดาวมาแล้ว</h3>
    <span class="cv-welcome-cta">เลือกห้องแชทได้เลย</span>
  </div>`;
}
function renderChatWelcome(chats, mentions) {
  S.chat.chats = chats;
  S.chat.mentions = mentions;
  S.chat.groupId = null;
  S.chat.messages = [];
  S.chat.topics = [];
  S.chat.failed = [];
  fillPage(`${catBarHtml()}
    <div class="cv-layout" id="chatLayout">
      <aside class="cv-list" aria-label="รายการแชท">
        <div class="cv-list-head"><b>รายการห้องแชท</b></div>
        <div class="cv-items" id="cvItems">${chatListHtml()}</div>
      </aside>
      <section class="cv-main cv-welcome-main" aria-label="เลือกห้องแชท">${chatWelcomeHtml()}</section>
    </div>`);
}

// ---------------------------------------------------------------- add / edit popup
ACTIONS['cat-new'] = () => openCatForm(null);
ACTIONS['cat-edit'] = (el) => { closeCatMenu(); openCatForm(el.dataset.id); };
ACTIONS['cat-groups'] = (el) => { closeCatMenu(); openCatForm(el.dataset.id); };

async function openCatForm(id) {
  const cat = id ? (S.chat.categories || []).find((c) => c.id === id) : null;
  if (id && !cat) { toast('ไม่พบหมวดนี้', 'err'); return; }
  let groups = [];
  try { ({ items: groups } = await apiGet('/api/telegram/groups')); } catch (err) { toast(err.message, 'err'); return; }
  const pickedIcon = cat ? cat.icon : 'star';
  const pickedColor = cat ? cat.color : CAT_COLORS[0];
  openModal({
    title: cat ? 'แก้ไขหมวดห้องแชท' : 'เพิ่มหมวดห้องแชท',
    body: `<form data-form="cat-form" data-id="${esc(id || '')}" class="stack">
      <label class="field"><span>ชื่อหมวด</span><input class="input" name="name" maxlength="30" required value="${esc(cat ? cat.name : '')}" placeholder="เช่น ลูกค้า"></label>
      <div class="field"><span>ไอคอน</span>
        <div class="cat-pick" role="radiogroup" aria-label="เลือกไอคอนหมวด">
          ${CAT_ICONS.map((k) => `<button type="button" class="cat-pick-btn" role="radio" aria-checked="${k === pickedIcon}" data-action="cat-pick-icon" aria-label="${k}">${icon(k)}</button>`).join('')}
        </div>
        <input type="hidden" name="icon" value="${esc(pickedIcon)}">
      </div>
      <div class="field"><span>สีหมวด</span>
        <div class="cat-pick" role="radiogroup" aria-label="เลือกสีหมวด">
          ${CAT_COLORS.map((c) => `<button type="button" class="cat-sw" role="radio" aria-checked="${c === pickedColor}" data-action="cat-pick-color" data-value="${c}" style="--sw:${c}" aria-label="สี ${c}"></button>`).join('')}
        </div>
        <input type="hidden" name="color" value="${esc(pickedColor)}">
      </div>
      <div class="field"><span>ห้องแชทในหมวดนี้ (เลือกได้หลายหมวดต่อห้อง)</span>
        <div class="cat-rooms">${groups.length ? groups.map((g) => `<label class="cat-room">
            <input type="checkbox" name="groups" value="${esc(g.id)}" ${cat && cat.groupIds.includes(g.id) ? 'checked' : ''}>
            <span class="ellipsis">${esc(g.title)}</span>${g.enabled ? '' : '<small class="muted">ปิดติดตาม</small>'}</label>`).join('')
          : '<p class="muted small">ยังไม่มีกลุ่ม Telegram</p>'}</div>
      </div>
      <p class="small" data-role="form-error"></p>
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn ghost" data-action="close-modal">ยกเลิก</button>
        <button type="submit" class="btn primary">บันทึก</button></div>
    </form>`,
  });
}
ACTIONS['cat-pick-icon'] = (el) => {
  const form = el.closest('form');
  form.querySelector('[name="icon"]').value = el.getAttribute('aria-label');
  el.parentElement.querySelectorAll('.cat-pick-btn').forEach((b) => b.setAttribute('aria-checked', String(b === el)));
};
ACTIONS['cat-pick-color'] = (el) => {
  const form = el.closest('form');
  form.querySelector('[name="color"]').value = el.dataset.value;
  el.parentElement.querySelectorAll('.cat-sw').forEach((b) => b.setAttribute('aria-checked', String(b === el)));
};
FORMS['cat-form'] = async (form) => {
  const id = form.dataset.id;
  const body = {
    name: form.querySelector('[name="name"]').value.trim(),
    icon: form.querySelector('[name="icon"]').value,
    color: form.querySelector('[name="color"]').value,
    groupIds: [...form.querySelectorAll('input[name="groups"]:checked')].map((i) => i.value),
  };
  const btn = form.querySelector('[type="submit"]');
  try {
    await busy(btn, () => (id ? apiPatch('/api/telegram/categories/' + id, body) : apiPost('/api/telegram/categories', body)));
    closeAllModals();
    toast(id ? 'บันทึกหมวดแล้ว' : 'เพิ่มหมวดแล้ว');
    renderChat({ keep: true });
  } catch (err) { setFormError(form, err.message); }
};

// Delete asks first. Only the category and its links go; rooms and their history stay.
ACTIONS['cat-delete'] = (el) => {
  closeCatMenu();
  const cat = (S.chat.categories || []).find((c) => c.id === el.dataset.id);
  openModal({
    title: 'ลบหมวดห้องแชท?',
    body: `<div class="stack">
      <p>ลบหมวด “${esc(cat ? cat.name : '')}” ใช่หรือไม่?</p>
      <p class="muted small">ห้องแชทในหมวดนี้จะไม่ถูกลบ ประวัติข้อความ กลุ่ม และ Chat ID ยังอยู่ครบ</p>
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn ghost" data-action="close-modal">ยกเลิก</button>
        <button type="button" class="btn danger" data-action="cat-delete-confirm" data-id="${esc(el.dataset.id)}">${icon('trash2', 'sm')} ยืนยันลบหมวด</button></div>
    </div>`,
  });
};
ACTIONS['cat-delete-confirm'] = async (el) => {
  try {
    await busy(el, () => api('DELETE', '/api/telegram/categories/' + el.dataset.id));
    if (S.chat.category === el.dataset.id) S.chat.category = 'all';
    closeAllModals();
    toast('ลบหมวดแล้ว ห้องแชทยังอยู่ครบ');
    renderChat({ keep: true });
  } catch (err) { toast(err.message, 'err'); }
};

// ---------------------------------------------------------------- right-click (desktop) and long-press (mobile) menu
let catMenuEl = null;
function closeCatMenu() {
  if (catMenuEl) { catMenuEl.remove(); catMenuEl = null; }
}
function openCatMenu(catId, x, y) {
  closeCatMenu();
  const m = document.createElement('div');
  m.className = 'cat-menu';
  m.setAttribute('role', 'menu');
  m.innerHTML = `
    <button type="button" role="menuitem" data-action="cat-edit" data-id="${esc(catId)}">${icon('edit', 'sm')} แก้ไขชื่อ ไอคอน สี</button>
    <button type="button" role="menuitem" data-action="cat-groups" data-id="${esc(catId)}">${icon('chat', 'sm')} จัดการห้องในหมวด</button>
    <button type="button" role="menuitem" class="danger" data-action="cat-delete" data-id="${esc(catId)}">${icon('trash2', 'sm')} ลบหมวด</button>`;
  m.style.left = Math.max(8, Math.min(x, window.innerWidth - 230)) + 'px';
  m.style.top = Math.max(8, Math.min(y, window.innerHeight - 170)) + 'px';
  document.body.appendChild(m);
  catMenuEl = m;
}
document.addEventListener('contextmenu', (e) => {
  const el = e.target.closest && e.target.closest('.cat-dot[data-cat-id]');
  if (!el) return;
  e.preventDefault();
  openCatMenu(el.dataset.catId, e.clientX, e.clientY);
});
let catPressTimer = 0;
let catPressSuppressClick = false;
document.addEventListener('pointerdown', (e) => {
  const el = e.target.closest && e.target.closest('.cat-dot[data-cat-id]');
  if (!el || e.pointerType === 'mouse') return;
  clearTimeout(catPressTimer);
  catPressTimer = setTimeout(() => {
    catPressSuppressClick = true;
    openCatMenu(el.dataset.catId, e.clientX, e.clientY);
  }, 500);
});
['pointerup', 'pointercancel', 'pointerleave'].forEach((type) => document.addEventListener(type, () => clearTimeout(catPressTimer)));
// After a long press the click that follows is ignored, so the category is not switched by accident.
document.addEventListener('click', (e) => {
  if (catPressSuppressClick) {
    catPressSuppressClick = false;
    e.stopPropagation();
    e.preventDefault();
    return;
  }
  if (catMenuEl && !e.target.closest('.cat-menu')) closeCatMenu();
}, true);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeCatMenu();
});
