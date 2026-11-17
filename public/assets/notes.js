/* SIINA SYSTEM — personal quick notes: popover from the header, add / edit / delete, sensitive notes hidden until asked. */
'use strict';

const NOTE_STATE = { open: false, items: [], q: '', menuId: null, timer: 0 };

async function notesLoad() {
  const qs = NOTE_STATE.q ? `?q=${encodeURIComponent(NOTE_STATE.q)}` : '';
  const { items } = await apiGet('/api/notes' + qs);
  NOTE_STATE.items = items;
}

function notePreviewHtml(n) {
  if (n.isSensitive) return '<span class="note-mask">••••••••</span><span class="note-lock">ข้อมูลสำคัญ</span>';
  const t = (n.preview || '').trim();
  return t ? esc(t) : '<span class="note-muted">ยังไม่มีรายละเอียด</span>';
}

function noteItemHtml(n) {
  const menuOpen = NOTE_STATE.menuId === n.id;
  return `<div class="note-item" data-action="note-open" data-id="${esc(n.id)}" role="button" tabindex="0">
    <span class="note-doc">${icon('file', 'sm')}</span>
    <span class="note-body"><b class="ellipsis">${esc(n.title)}</b><small class="ellipsis">${notePreviewHtml(n)}</small></span>
    <button type="button" class="note-more" data-action="note-menu" data-id="${esc(n.id)}" aria-label="เมนูเพิ่มเติม" aria-expanded="${menuOpen}">${icon('more', 'sm')}</button>
    ${menuOpen ? `<div class="note-menu" role="menu">
      <button type="button" data-action="note-open" data-id="${esc(n.id)}">เปิดรายละเอียด</button>
      <button type="button" data-action="note-edit" data-id="${esc(n.id)}">แก้ไข</button>
      <button type="button" data-action="note-copy" data-id="${esc(n.id)}">คัดลอกข้อมูล</button>
      <button type="button" class="danger" data-action="note-delete" data-id="${esc(n.id)}">ลบโน้ต</button>
    </div>` : ''}
  </div>`;
}

function notesListRender() {
  const wrap = $('#notesListWrap');
  if (!wrap) return;
  wrap.innerHTML = NOTE_STATE.items.length
    ? `<div class="notes-list">${NOTE_STATE.items.map(noteItemHtml).join('')}</div>`
    : `<div class="notes-empty">${NOTE_STATE.q ? 'ไม่พบโน้ตที่ตรงกับการค้นหา' : 'ยังไม่มีโน้ต กดเพิ่มโน้ตด้านล่างได้เลย'}</div>`;
}

function notesRender() {
  const pop = $('#notesPop');
  if (!pop) return;
  pop.innerHTML = `
    <div class="notes-head"><b>โน้ตส่วนตัว</b>
      <button type="button" class="btn icon ghost sm" data-action="notes-close" aria-label="ปิด">${icon('close', 'sm')}</button>
    </div>
    <input class="input notes-search" id="notesSearch" placeholder="ค้นหาโน้ต..." value="${esc(NOTE_STATE.q)}" autocomplete="off">
    <div id="notesListWrap"></div>
    <button type="button" class="notes-add" data-action="note-new">${icon('plus', 'sm')} เพิ่มโน้ต</button>`;
  notesListRender();
}

function notesSetOpen(open) {
  NOTE_STATE.open = open;
  NOTE_STATE.menuId = null;
  const pop = $('#notesPop');
  if (pop) pop.hidden = !open;
  const btn = $('#notesBtn');
  if (btn) btn.setAttribute('aria-expanded', String(open));
}

function closeNotes() {
  if (NOTE_STATE.open) notesSetOpen(false);
}

async function notesRefresh() {
  if (!NOTE_STATE.open) return;
  try {
    await notesLoad();
    notesRender();
  } catch (err) { toast(err.message, 'err'); }
}

ACTIONS['notes'] = async () => {
  if (NOTE_STATE.open) { closeNotes(); return; }
  try {
    await notesLoad();
    notesSetOpen(true);
    notesRender();
  } catch (err) { toast(err.message, 'err'); }
};
ACTIONS['notes-close'] = () => closeNotes();
ACTIONS['note-menu'] = (el) => {
  const id = el.dataset.id;
  NOTE_STATE.menuId = NOTE_STATE.menuId === id ? null : id;
  notesListRender();
};

// Detail popup: sensitive text stays hidden until the user asks for it.
ACTIONS['note-open'] = async (el) => {
  const id = el.dataset.id;
  try {
    const n = await apiGet(`/api/notes/${id}`);
    const body = n.isSensitive
      ? `<p class="note-text note-hidden">••••••••••••</p>
         <button type="button" class="btn sm" data-action="note-reveal" data-id="${esc(id)}">${icon('eye', 'sm')} แสดงข้อมูล</button>`
      : `<p class="note-text">${esc(n.content || '') || '<span class="note-muted">ยังไม่มีรายละเอียด</span>'}</p>`;
    openModal({
      title: n.title,
      body: `<div class="note-detail">${n.isSensitive ? '<p class="note-lock-line">' + icon('lock', 'sm') + ' ข้อมูลสำคัญ</p>' : ''}${body}
        <small class="muted">อัปเดตล่าสุด ${esc(fmtDateTime(n.updatedAt))}</small>
        <div class="note-actions">
          <button type="button" class="btn sm" data-action="note-edit" data-id="${esc(id)}">${icon('edit', 'sm')} แก้ไข</button>
          <button type="button" class="btn sm" data-action="note-copy" data-id="${esc(id)}">${icon('copy', 'sm')} คัดลอก</button>
          <button type="button" class="btn sm danger" data-action="note-delete" data-id="${esc(id)}">${icon('trash2', 'sm')} ลบ</button>
        </div></div>`,
    });
    NOTE_STATE.menuId = null;
    notesListRender();
  } catch (err) { toast(err.message, 'err'); }
};
ACTIONS['note-reveal'] = async (el) => {
  try {
    const n = await apiGet(`/api/notes/${el.dataset.id}?reveal=1`);
    const box = el.closest('.note-detail');
    const text = box.querySelector('.note-text');
    text.classList.remove('note-hidden');
    text.textContent = n.content || '';
    el.remove();
  } catch (err) { toast(err.message, 'err'); }
};

function noteFormOpen(n) {
  const isNew = !n;
  openModal({
    title: isNew ? 'เพิ่มโน้ต' : 'แก้ไขโน้ต',
    body: `<form data-form="note" data-id="${esc(n ? n.id : '')}" class="stack">
      <label class="field"><span>ชื่อหัวข้อ *</span><input class="input" name="title" required maxlength="120" value="${esc(n ? n.title : '')}" placeholder="เช่น ห้องแชทหลัก"></label>
      <label class="field"><span>รายละเอียด</span><textarea class="textarea" name="content" rows="6" maxlength="5000" placeholder="พิมพ์ข้อความ คัดลอกได้ หลายบรรทัดได้">${esc(n ? n.content || '' : '')}</textarea></label>
      <label class="field"><span>ประเภทข้อมูล</span><select class="select" name="isSensitive">
        <option value="0" ${!n || !n.isSensitive ? 'selected' : ''}>โน้ตทั่วไป</option>
        <option value="1" ${n && n.isSensitive ? 'selected' : ''}>ข้อมูลสำคัญ (ซ่อนรายละเอียดทันที)</option>
      </select></label>
      <p class="muted small">ไม่ควรบันทึกรหัสผ่านจริงในโน้ต ควรใช้ Password Manager แทน</p>
      <p class="small" data-role="form-error"></p>
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn ghost" data-action="close-modal">ยกเลิก</button>
        <button type="submit" class="btn primary">บันทึก</button></div>
    </form>`,
  });
}
ACTIONS['note-new'] = () => noteFormOpen(null);
ACTIONS['note-edit'] = async (el) => {
  try {
    const n = await apiGet(`/api/notes/${el.dataset.id}?reveal=1`);
    NOTE_STATE.menuId = null;
    noteFormOpen(n);
  } catch (err) { toast(err.message, 'err'); }
};
FORMS['note'] = async (form) => {
  const fd = new FormData(form);
  const id = form.dataset.id;
  const body = { title: fd.get('title'), content: fd.get('content'), isSensitive: fd.get('isSensitive') === '1' };
  const btn = form.querySelector('[type="submit"]');
  try {
    await busy(btn, () => (id ? apiPatch(`/api/notes/${id}`, body) : apiPost('/api/notes', body)));
    closeAllModals();
    toast(id ? 'บันทึกการแก้ไขโน้ตแล้ว' : 'เพิ่มโน้ตแล้ว');
    await notesRefresh();
  } catch (err) { setFormError(form, err.message); }
};

ACTIONS['note-delete'] = (el) => {
  const id = el.dataset.id;
  NOTE_STATE.menuId = null;
  openModal({
    title: 'ลบโน้ต',
    body: `<div class="stack">
      <p>ยืนยันการลบโน้ต?</p>
      <p class="muted small">การลบโน้ตไม่กระทบข้อมูล Telegram หรือโปรเจ็กต์อื่น และไม่สามารถกู้คืนได้</p>
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn ghost" data-action="close-modal">ยกเลิก</button>
        <button type="button" class="btn danger" data-action="note-delete-confirm" data-id="${esc(id)}">${icon('trash2', 'sm')} ยืนยันลบ</button></div>
    </div>`,
  });
};
ACTIONS['note-delete-confirm'] = async (el) => {
  try {
    await busy(el, () => api('DELETE', `/api/notes/${el.dataset.id}`));
    closeAllModals();
    toast('ลบโน้ตแล้ว');
    await notesRefresh();
  } catch (err) { toast(err.message, 'err'); }
};

ACTIONS['note-copy'] = async (el) => {
  try {
    const n = await apiGet(`/api/notes/${el.dataset.id}?reveal=1`);
    await navigator.clipboard.writeText(n.content || '');
    NOTE_STATE.menuId = null;
    notesListRender();
    toast('คัดลอกข้อมูลแล้ว');
  } catch (err) { toast('คัดลอกไม่สำเร็จ ' + err.message, 'err'); }
};

// Search: refresh the list only, so the search box keeps focus.
document.addEventListener('input', (e) => {
  if (e.target.id !== 'notesSearch') return;
  NOTE_STATE.q = e.target.value.trim();
  clearTimeout(NOTE_STATE.timer);
  NOTE_STATE.timer = setTimeout(async () => {
    try {
      await notesLoad();
      notesListRender();
    } catch (err) { toast(err.message, 'err'); }
  }, 220);
});

// Keyboard: Enter opens a focused note row.
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('note-item')) {
    e.preventDefault();
    e.target.click();
  }
  if (e.key === 'Escape' && NOTE_STATE.open && !document.querySelector('.overlay')) closeNotes();
});

// Clicking outside closes the popover (clicks inside a popup do not).
document.addEventListener('click', (e) => {
  if (!NOTE_STATE.open) return;
  if (e.target.closest('#notesWrap') || e.target.closest('.overlay')) return;
  closeNotes();
});
