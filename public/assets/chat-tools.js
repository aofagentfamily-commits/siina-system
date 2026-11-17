/* SIINA SYSTEM — chat tools: + menu (files, templates, stickers), file preview and send,
   message templates with rich text, sticker picker. Nothing is sent until the user confirms. */
'use strict';

S.tpl = { list: [] };
const CHAT_FILE_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip';
const FILE_MAX_IMAGE = 10 * 1024 * 1024;
const FILE_MAX_DOC = 50 * 1024 * 1024;

function sendThreadId() {
  return S.chat.topic && S.chat.topic !== 'all' ? Number(S.chat.topic) : null;
}
function prettySize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
function fileKind(mime, name) {
  if (/^image\//.test(mime)) return 'รูปภาพ';
  if (/pdf$/.test(mime)) return 'PDF';
  if (/word|officedocument\.wordprocessing/.test(mime) || /\.docx?$/i.test(name)) return 'เอกสาร Word';
  if (/spreadsheet|excel/.test(mime) || /\.xlsx?$/i.test(name)) return 'สเปรดชีต Excel';
  if (/presentation|powerpoint/.test(mime) || /\.pptx?$/i.test(name)) return 'สไลด์ PowerPoint';
  if (/text\//.test(mime) || /\.(txt|csv)$/i.test(name)) return 'ไฟล์ข้อความ';
  return mime || 'ไฟล์';
}
function setErr(box, msg) {
  if (box) { box.textContent = msg || ''; box.style.color = 'var(--danger)'; }
}

// ---------------------------------------------------------------- + menu
function plusEnabled() {
  const btn = $('#cvPlus');
  return !!btn && !btn.disabled;
}
function closePlusMenu() {
  const menu = $('#cvPlusMenu');
  const btn = $('#cvPlus');
  if (menu) menu.hidden = true;
  if (btn) btn.setAttribute('aria-expanded', 'false');
}
ACTIONS['chat-plus'] = (el) => {
  const menu = $('#cvPlusMenu');
  if (!menu) return;
  const open = menu.hidden;
  menu.hidden = !open;
  el.setAttribute('aria-expanded', String(open));
  if (open) { const first = menu.querySelector('button'); if (first) first.focus(); }
};
document.addEventListener('click', (e) => {
  if (!e.target.closest || e.target.closest('.cv-plus-wrap')) return;
  closePlusMenu();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closePlusMenu();
});

// The hidden file input is created when it is needed: the app replaces the whole page on sign-in,
// which would remove an input created at load time.
function getFileInput() {
  let input = document.getElementById('cvFile');
  if (input) return input;
  input = document.createElement('input');
  input.type = 'file';
  input.id = 'cvFile';
  input.hidden = true;
  input.accept = CHAT_FILE_ACCEPT;
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    input.value = '';
    if (file) openFilePreview(file);
  });
  document.body.appendChild(input);
  return input;
}
ACTIONS['chat-menu-file'] = () => {
  closePlusMenu();
  getFileInput().click();
};
// Paste an image (for example a screenshot) into the message box: it opens the same preview and send.
document.addEventListener('paste', (e) => {
  const box = e.target;
  if (!box || box.name !== 'text' || !box.closest || !box.closest('.cv-composer')) return;
  const items = Array.from((e.clipboardData && e.clipboardData.items) || []);
  const img = items.find((it) => it.kind === 'file' && /^image\/(jpeg|png|webp)$/.test(it.type));
  if (!img) return;
  const file = img.getAsFile();
  if (!file) return;
  e.preventDefault();
  const named = new File([file], 'pasted-' + Date.now() + '.' + (file.type.split('/')[1] || 'png'), { type: file.type });
  openFilePreview(named);
});
ACTIONS['chat-menu-templates'] = () => { closePlusMenu(); openTemplates(); };
ACTIONS['chat-menu-stickers'] = () => { closePlusMenu(); openStickers(); };



// ---------------------------------------------------------------- file preview and send
function openFilePreview(file) {
  const limit = /^image\/(jpeg|png)$/.test(file.type) ? FILE_MAX_IMAGE : FILE_MAX_DOC;
  if (file.size > limit) {
    toast(`ไฟล์ใหญ่เกินกำหนด (สูงสุด ${limit / 1024 / 1024} MB)`, 'err');
    return;
  }
  if (!file.size) { toast('ไฟล์ว่างเปล่า', 'err'); return; }
  const isImage = /^image\//.test(file.type);
  const preview = isImage ? URL.createObjectURL(file) : '';
  const overlay = openModal({
    title: 'ตัวอย่างก่อนส่ง',
    body: `<div class="ft-preview">
        ${isImage ? `<img class="ft-thumb" src="${preview}" alt="ตัวอย่างรูป">` : `<span class="ft-icon">${icon('file', 'lg')}</span>`}
        <dl class="kv ft-meta">
          <dt>ชื่อไฟล์</dt><dd class="ft-name">${esc(file.name)}</dd>
          <dt>ประเภท</dt><dd>${esc(fileKind(file.type, file.name))}</dd>
          <dt>ขนาด</dt><dd>${esc(prettySize(file.size))}</dd>
          <dt>ส่งไปยัง</dt><dd>${esc(topicName(sendThreadId()))}</dd>
        </dl>
      </div>
      <label class="field"><span>คำบรรยาย (ไม่บังคับ)</span>
        <textarea class="textarea" id="ftCaption" maxlength="1024" rows="2" placeholder="พิมพ์คำบรรยายที่จะส่งพร้อมไฟล์"></textarea></label>
      <p class="small" id="ftError" role="alert"></p>`,
    footer: `<button class="btn ghost" data-action="close-modal">ยกเลิก</button>
      <button class="btn primary" id="ftSend">${icon('send')} ส่งไฟล์</button>`,
  });
  const sendBtn = overlay.querySelector('#ftSend');
  const err = overlay.querySelector('#ftError');
  const close = () => { if (preview) URL.revokeObjectURL(preview); };
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  sendBtn.addEventListener('click', async () => {
    setErr(err, '');
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('อ่านไฟล์ไม่ได้'));
        reader.readAsDataURL(file);
      });
      const caption = overlay.querySelector('#ftCaption').value.trim();
      const r = await busy(sendBtn, () => apiPost(`/api/telegram/groups/${S.chat.groupId}/send-file`, {
        fileName: file.name, mime: file.type || 'application/octet-stream', dataUrl, caption, threadId: sendThreadId(),
      }));
      close();
      closeModal(overlay);
      toast(r && r.ok ? 'ส่งไฟล์แล้ว' : 'ส่งไฟล์แล้ว');
      await refreshChatMessages();
    } catch (error) {
      setErr(err, error.message + (error.status === 502 ? '' : ''));
      sendBtn.innerHTML = `${icon('refresh')} ลองส่งใหม่`;
    }
  });
}

// ---------------------------------------------------------------- templates
function openTemplates() {
  const overlay = openModal({
    title: 'เทมเพลตข้อความ',
    wide: true,
    body: `<div class="tpl-head">
        <p class="muted small">เลือกเทมเพลตเพื่อใส่ในช่องพิมพ์ก่อน แล้วแก้ไขได้ก่อนกดส่ง ระบบจะไม่ส่งให้อัตโนมัติ</p>
        <button class="btn primary" data-action="chat-tpl-new">${icon('plus')} เพิ่มเทมเพลต</button>
      </div>
      <label class="search tpl-search">${icon('search')}<span class="sr-only">ค้นหาเทมเพลต</span>
        <input class="input" type="search" placeholder="ค้นหาเทมเพลต..." data-input="tpl-search"></label>
      <div id="tplList" class="tpl-list"><div class="tpl-loading"><span class="spinner"></span> กำลังโหลดเทมเพลต...</div></div>`,
  });
  overlay.dataset.kind = 'templates';
  loadTemplates();
}

async function loadTemplates() {
  const list = $('#tplList');
  if (!list) return;
  const q = (document.querySelector('[data-input="tpl-search"]') || {}).value || '';
  try {
    const { items } = await apiGet('/api/telegram/templates?q=' + encodeURIComponent(q.trim()));
    S.tpl.list = items;
    list.innerHTML = items.length ? items.map((t) => `<article class="tpl-row">
        <span class="tpl-ico">${icon('file')}</span>
        <div class="tpl-body">
          <b class="ellipsis">${esc(t.title)}</b>
          <p class="ellipsis">${esc(t.content.replace(/\s+/g, ' ').slice(0, 120))}</p>
        </div>
        <div class="tpl-actions">
          <button class="btn sm primary" data-action="chat-tpl-use" data-id="${esc(t.id)}">ใช้</button>
          <button class="btn icon sm" data-action="chat-tpl-edit" data-id="${esc(t.id)}" aria-label="แก้ไขเทมเพลต">${icon('edit', 'sm')}</button>
          <button class="btn icon sm danger" data-action="chat-tpl-delete" data-id="${esc(t.id)}" aria-label="ลบเทมเพลต">${icon('trash2', 'sm')}</button>
        </div>
      </article>`).join('') : `<div class="empty">${q ? 'ไม่พบเทมเพลตที่ค้นหา' : 'ยังไม่มีเทมเพลต กดเพิ่มเทมเพลตเพื่อเริ่มต้น'}</div>`;
  } catch (err) {
    list.innerHTML = `<div class="empty" style="color:var(--danger)">${esc(err.message)}</div>`;
  }
}
document.addEventListener('input', (e) => {
  if (e.target.dataset && e.target.dataset.input === 'tpl-search') {
    clearTimeout(S.tplTimer);
    S.tplTimer = setTimeout(loadTemplates, 250);
  }
});

// The template bar above the composer. The composer text is never sent automatically.
const COMPOSER_MAX = 120;
function autoSizeComposer() {
  const ta = $('.cv-input');
  if (!ta) return;
  ta.style.height = 'auto';
  const h = Math.min(ta.scrollHeight, COMPOSER_MAX);
  ta.style.height = Math.max(h, 44) + 'px';
  ta.style.overflowY = ta.scrollHeight > COMPOSER_MAX ? 'auto' : 'hidden';
}
function draftEdited() {
  const input = $('.cv-input');
  return !!(S.chat.draft && input && input.value !== S.chat.draft.text);
}
// Called from chat.js whenever the composer text changes.
function draftTextChanged() {
  if (!S.chat.draft) return;
  if (draftEdited()) {
    S.chat.draft.mode = 'plain';
    S.chat.draft.edited = true;
  }
  renderDraft();
}

function applyTemplateToComposer(tpl, mode) {
  const input = $('.cv-input');
  const current = input ? input.value : '';
  let text = tpl.content;
  if (mode === 'append' && current.trim()) text = current.replace(/\s+$/, '') + '\n' + tpl.content;
  if (input) { input.value = text; input.focus(); }
  S.chat.draft = mode === 'replace'
    ? { name: tpl.title, text, html: tpl.formatted || null, mode: tpl.formatted ? 'formatted' : 'plain', edited: false, collapsed: false }
    : null;
  renderDraft();
  autoSizeComposer();
  if (mode === 'append' && tpl.formatted) toast('เพิ่มต่อท้ายแล้ว (รูปแบบของเทมเพลตไม่ถูกใช้เมื่อรวมกับข้อความเดิม)');
}

function renderDraft() {
  const box = $('#cvDraft');
  if (!box) return;
  const d = S.chat.draft;
  if (!d) { box.innerHTML = ''; autoSizeComposer(); return; }
  // The bar shows only the template name and controls; the text itself stays in the composer.
  const preview = '';
  box.innerHTML = `<div class="tpl-bar ${d.collapsed ? 'is-collapsed' : ''}" role="region" aria-label="เทมเพลตที่กำลังใช้">
      <span class="tpl-bar-ico">${icon('file', 'sm')}</span>
      <div class="tpl-bar-text">
        <small>กำลังใช้เทมเพลต${d.edited ? ' · แก้ไขแล้ว' : ''}</small>
        <b class="ellipsis">${esc(d.name)}</b>
        ${d.collapsed ? '' : preview}
      </div>
      <div class="tpl-bar-modes" role="group" aria-label="รูปแบบการส่ง">
        <button type="button" class="tpl-mode" aria-pressed="${d.mode === 'formatted'}" data-action="chat-draft-mode" data-mode="formatted" ${d.html ? '' : 'disabled title="เทมเพลตนี้ไม่มีรูปแบบ"'}>คงรูปแบบ</button>
        <button type="button" class="tpl-mode" aria-pressed="${d.mode === 'plain'}" data-action="chat-draft-mode" data-mode="plain">ส่งแบบธรรมดา</button>
      </div>
      <button type="button" class="tpl-act" data-action="chat-draft-edit" title="แก้ไขก่อนส่ง">${icon('edit', 'sm')}<span>แก้ไข</span></button>
      <button type="button" class="tpl-act" data-action="chat-draft-clear" title="ล้างเทมเพลต">${icon('close', 'sm')}<span>ล้าง</span></button>
      <button type="button" class="tpl-act tpl-collapse" data-action="chat-draft-collapse" aria-expanded="${!d.collapsed}" aria-label="${d.collapsed ? 'ขยายรายละเอียด' : 'ย่อรายละเอียด'}">${icon(d.collapsed ? 'chevDown' : 'chevLeft', 'sm')}</button>
    </div>`;
  autoSizeComposer();
}

ACTIONS['chat-draft-mode'] = (el) => {
  if (!S.chat.draft) return;
  if (el.dataset.mode === 'formatted' && !S.chat.draft.html) return;
  S.chat.draft.mode = el.dataset.mode;
  renderDraft();
};
ACTIONS['chat-draft-collapse'] = () => {
  if (!S.chat.draft) return;
  S.chat.draft.collapsed = !S.chat.draft.collapsed;
  renderDraft();
};
ACTIONS['chat-draft-edit'] = () => {
  const input = $('.cv-input');
  if (!input) return;
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
  autoSizeComposer();
};
ACTIONS['chat-draft-clear'] = () => {
  if (!S.chat.draft) return;
  if (!draftEdited()) {
    // Unchanged text: only the template bar goes away; the text stays in the composer as plain text.
    S.chat.draft = null;
    renderDraft();
    return;
  }
  openModal({
    title: 'ล้างเทมเพลต',
    body: `<p>คุณแก้ไขข้อความจากเทมเพลตแล้ว ต้องการทำอย่างไร?</p>
      <p class="muted small" style="margin-top:8px">การล้างจะไม่ลบเทมเพลตที่บันทึกไว้ในระบบ</p>`,
    footer: `<button class="btn ghost" data-action="close-modal">ยกเลิก</button>
      <button class="btn danger" id="tplClearAll">ล้างเทมเพลตและข้อความ</button>`,
  }).addEventListener('click', (e) => {
    if (!e.target.closest('#tplClearAll')) return;
    closeAllModals();
    const input = $('.cv-input');
    if (input) input.value = '';
    S.chat.draft = null;
    renderDraft();
    autoSizeComposer();
  });
};

ACTIONS['chat-tpl-use'] = (el) => {
  const tpl = S.tpl.list.find((t) => t.id === el.dataset.id);
  if (!tpl) return;
  const input = $('.cv-input');
  const hasText = input && input.value.trim().length > 0;
  if (!hasText) {
    closeAllModals();
    applyTemplateToComposer(tpl, 'replace');
    return;
  }
  openModal({
    title: 'มีข้อความอยู่ในช่องพิมพ์แล้ว',
    body: `<p>ต้องการทำอย่างไรกับข้อความเดิมที่พิมพ์ค้างไว้?</p>
      <p class="muted small" style="margin-top:8px">ข้อความที่พิมพ์ค้างไว้จะไม่หายไปโดยอัตโนมัติ</p>`,
    footer: `<button class="btn ghost" data-action="close-modal">ยกเลิก</button>
      <button class="btn" id="tplAppend">เพิ่มต่อท้ายข้อความเดิม</button>
      <button class="btn primary" id="tplReplace">แทนที่ข้อความเดิม</button>`,
  }).addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !['tplAppend', 'tplReplace'].includes(b.id)) return;
    closeAllModals();
    applyTemplateToComposer(tpl, b.id === 'tplReplace' ? 'replace' : 'append');
  });
};

ACTIONS['chat-tpl-delete'] = async (el) => {
  if (!(await confirmBox('คุณต้องการลบเทมเพลตนี้ใช่หรือไม่? (ข้อความที่เคยส่งไปแล้วจะไม่ถูกลบ)'))) return;
  await apiDelete('/api/telegram/templates/' + el.dataset.id);
  toast('ลบเทมเพลตแล้ว');
  loadTemplates();
};

// Rich text editor for templates.
const TPL_TOOLS = [
  ['undo', 'undo', 'ย้อนกลับ'], ['redo', 'redo', 'ทำซ้ำ'],
  ['bold', 'B', 'ตัวหนา'], ['italic', 'I', 'ตัวเอียง'], ['underline', 'U', 'ขีดเส้นใต้'], ['strikeThrough', 'S', 'ขีดฆ่า'],
  ['insertUnorderedList', 'list', 'รายการหัวข้อ'], ['insertOrderedList', 'ol', 'รายการตัวเลข'], ['createLink', 'link', 'เพิ่มลิงก์'],
];

ACTIONS['chat-tpl-new'] = () => openTemplateEditor(null);
ACTIONS['chat-tpl-edit'] = (el) => {
  const tpl = S.tpl.list.find((t) => t.id === el.dataset.id);
  if (tpl) openTemplateEditor(tpl);
};

function openTemplateEditor(tpl) {
  const initial = tpl ? (tpl.formatted || escapeForEditor(tpl.content)) : '';
  const overlay = openModal({
    title: tpl ? 'แก้ไขเทมเพลตข้อความ' : 'เพิ่มเทมเพลตข้อความ',
    wide: true,
    body: `<form data-form="tpl-save" data-id="${esc(tpl ? tpl.id : '')}" class="stack">
      <p class="muted small">สร้างเทมเพลตเพื่อใช้ส่งข้อความได้สะดวกและรวดเร็ว</p>
      <label class="field"><span>ชื่อหัวข้อเทมเพลต *</span>
        <input class="input" name="title" maxlength="80" required value="${esc(tpl ? tpl.title : '')}" placeholder="เช่น ตอบรับงาน">
        <small class="err-text" data-err="title"></small></label>
      <div class="field"><span>รายละเอียด (ข้อความเทมเพลต) *</span>
        <div class="rte-toolbar" role="toolbar" aria-label="จัดรูปแบบข้อความ">
          ${TPL_TOOLS.map(([cmd, label, title]) => `<button type="button" class="rte-btn ${cmd === 'bold' ? 'rte-b' : cmd === 'italic' ? 'rte-i' : cmd === 'underline' ? 'rte-u' : cmd === 'strikeThrough' ? 'rte-s' : ''}" data-cmd="${cmd}" title="${title}" aria-label="${title}">${icon(label === 'list' ? 'list' : label === 'link' ? 'link' : label === 'undo' ? 'refresh' : label === 'redo' ? 'refresh' : 'edit', 'sm') && (['B', 'I', 'U', 'S', 'ol'].includes(label) ? label : '') || ''}</button>`).join('')}
        </div>
        <div class="rte-editor" contenteditable="true" role="textbox" aria-multiline="true" aria-label="รายละเอียดเทมเพลต" data-role="editor">${initial}</div>
        <small class="err-text" data-err="content"></small>
        <small class="muted">เลือกข้อความแล้วกดปุ่มจัดรูปแบบ ระบบจะเปลี่ยนเฉพาะข้อความที่เลือก</small>
      </div>
      <p class="small" data-role="form-error"></p>
      <div class="row" style="justify-content:flex-end;gap:10px;flex-wrap:wrap">
        <button type="button" class="btn ghost" data-action="close-modal">ยกเลิก</button>
        <button type="submit" class="btn primary">${icon('check')} บันทึกเทมเพลต</button>
      </div>
    </form>`,
  });
  overlay.querySelectorAll('[data-cmd]').forEach((b) => b.addEventListener('mousedown', (e) => e.preventDefault()));
  overlay.querySelectorAll('[data-cmd]').forEach((b) => b.addEventListener('click', () => {
    const cmd = b.dataset.cmd;
    const editor = overlay.querySelector('[data-role="editor"]');
    editor.focus();
    if (cmd === 'createLink') {
      const url = prompt('ใส่ลิงก์ (ขึ้นต้นด้วย https://)');
      if (url && /^https?:\/\//i.test(url.trim())) document.execCommand('createLink', false, url.trim());
      return;
    }
    document.execCommand(cmd, false, null);
  }));
  // Keep the toolbar labels readable (letters for B I U S, icons for the rest).
  overlay.querySelectorAll('.rte-btn').forEach((b) => {
    const map = { bold: 'B', italic: 'I', underline: 'U', strikeThrough: 'S', insertOrderedList: '1.' };
    if (map[b.dataset.cmd]) b.textContent = map[b.dataset.cmd];
    else b.innerHTML = icon({ undo: 'chevLeft', redo: 'chevRight', insertUnorderedList: 'list', createLink: 'link' }[b.dataset.cmd] || 'edit', 'sm');
  });
}
function escapeForEditor(text) {
  return esc(text).replace(/\n/g, '<br>');
}

FORMS['tpl-save'] = async (form) => {
  const title = form.querySelector('[name="title"]').value.trim();
  const editor = form.querySelector('[data-role="editor"]');
  const plain = editor.innerText.replace(/\n{3,}/g, '\n\n').trim();
  const formErr = form.querySelector('[data-role="form-error"]');
  form.querySelectorAll('[data-err]').forEach((n) => { n.textContent = ''; });
  let bad = false;
  if (!title) { form.querySelector('[data-err="title"]').textContent = 'กรุณากรอกชื่อหัวข้อเทมเพลต'; bad = true; }
  if (!plain) { form.querySelector('[data-err="content"]').textContent = 'กรุณากรอกรายละเอียดข้อความ'; bad = true; }
  if (bad) return;
  const id = form.dataset.id;
  const btn = form.querySelector('[type="submit"]');
  const body = { title, formatted: editor.innerHTML };
  try {
    await busy(btn, () => (id ? apiPatch('/api/telegram/templates/' + id, body) : apiPost('/api/telegram/templates', body)));
    closeAllModals();
    toast(id ? 'บันทึกการแก้ไขเทมเพลตแล้ว' : 'บันทึกเทมเพลตแล้ว');
    openTemplates();
  } catch (err) {
    if (formErr) { formErr.textContent = err.message; formErr.style.color = 'var(--danger)'; }
  }
};

// ---------------------------------------------------------------- stickers
function openStickers() {
  const overlay = openModal({
    title: 'สติกเกอร์',
    body: `<p class="muted small">เลือกสติกเกอร์ที่บันทึกไว้เพื่อส่งเข้าหัวข้อที่เลือกอยู่ ระบบจะถามยืนยันก่อนส่งทุกครั้ง</p>
      <form data-form="sticker-add" class="row wrap" style="margin:12px 0">
        <input class="input grow" name="fileId" maxlength="200" placeholder="Sticker File ID" required aria-label="Sticker File ID">
        <input class="input" name="label" maxlength="40" placeholder="ชื่อเรียก" aria-label="ชื่อเรียกสติกเกอร์" style="max-width:160px">
        <button class="btn primary" type="submit">${icon('plus')} เพิ่ม</button>
      </form>
      <p class="small" data-role="form-error"></p>
      <div id="stkList" class="stk-grid"><div class="tpl-loading"><span class="spinner"></span> กำลังโหลดสติกเกอร์...</div></div>`,
  });
  overlay.dataset.kind = 'stickers';
  loadStickers();
}
async function loadStickers() {
  const list = $('#stkList');
  if (!list) return;
  try {
    const { items } = await apiGet('/api/telegram/stickers');
    list.innerHTML = items.length ? items.map((s) => `<div class="stk-item">
        <button class="stk-pick" data-action="chat-sticker-pick" data-id="${esc(s.id)}" data-label="${esc(s.label || 'สติกเกอร์')}">${icon('star')} <span class="ellipsis">${esc(s.label || 'สติกเกอร์')}</span></button>
        <button class="btn icon sm danger" data-action="chat-sticker-delete" data-id="${esc(s.id)}" aria-label="ลบสติกเกอร์">${icon('close', 'sm')}</button>
      </div>`).join('') : '<div class="empty">ยังไม่มีสติกเกอร์ เพิ่ม Sticker File ID ด้านบนเพื่อเริ่มใช้งาน</div>';
  } catch (err) {
    list.innerHTML = `<div class="empty" style="color:var(--danger)">${esc(err.message)}</div>`;
  }
}
FORMS['sticker-add'] = async (form) => {
  const fileId = form.querySelector('[name="fileId"]').value.trim();
  const label = form.querySelector('[name="label"]').value.trim();
  const err = form.querySelector('[data-role="form-error"]');
  try {
    await busy(form.querySelector('button'), () => apiPost('/api/telegram/stickers', { fileId, label }));
    form.reset();
    setErr(err, '');
    toast('เพิ่มสติกเกอร์แล้ว');
    loadStickers();
  } catch (error) { setErr(err, error.message); }
};
ACTIONS['chat-sticker-delete'] = async (el) => {
  if (!(await confirmBox('ลบสติกเกอร์นี้ออกจากรายการ? (สติกเกอร์ที่เคยส่งไม่ถูกลบ)'))) return;
  await apiDelete('/api/telegram/stickers/' + el.dataset.id);
  loadStickers();
};
ACTIONS['chat-sticker-pick'] = (el) => {
  const label = el.dataset.label;
  const overlay = openModal({
    title: 'ยืนยันการส่งสติกเกอร์',
    body: `<p>ส่งสติกเกอร์ “<b>${esc(label)}</b>” ไปยัง <b>${esc(topicName(sendThreadId()))}</b> ของกลุ่มนี้?</p>
      <p class="small" data-role="form-error"></p>`,
    footer: `<button class="btn ghost" data-action="close-modal">ยกเลิก</button>
      <button class="btn primary" id="stkOk">${icon('send')} ส่งสติกเกอร์</button>`,
  });
  overlay.querySelector('#stkOk').addEventListener('click', async (ev) => {
    const err = overlay.querySelector('[data-role="form-error"]');
    try {
      await busy(ev.currentTarget, () => apiPost(`/api/telegram/groups/${S.chat.groupId}/send-sticker`, { stickerId: el.dataset.id, threadId: sendThreadId() }));
      closeAllModals();
      toast('ส่งสติกเกอร์แล้ว');
      await refreshChatMessages();
    } catch (error) { setErr(err, error.message); }
  });
};
