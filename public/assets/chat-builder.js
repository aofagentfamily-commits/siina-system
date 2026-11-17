/* SIINA SYSTEM — แต่งข้อความ (message builder) in the chat page.
   Templates on the left; rich editor, live preview and inline buttons on the right.
   The editor's HTML is cleaned to the whitelist Telegram accepts; nothing is sent until the send succeeds. */
'use strict';

const BLD = { templates: [], kind: 'all', buttons: [], btnOn: false, range: null };
const BLD_KINDS = [
  ['all', 'ทั้งหมด', 'star'], ['notice', 'ประกาศ', 'megaphone'], ['reminder', 'แจ้งเตือน', 'bell'],
  ['promo', 'โปรโมชั่น', 'zap'], ['event', 'กิจกรรม', 'calendar'], ['info', 'ข้อมูลทั่วไป', 'shield'],
];
const BLD_KIND_COLOR = { notice: '#FFD1E5', event: '#DCE6FF', promo: '#FFE7D6', reminder: '#E7DCFF', info: '#DDF6E8', update: '#FFF3C4', thanks: '#FFD9EC' };
const BLD_KIND_NAME = { notice: 'ประกาศ', event: 'กิจกรรม / นัดหมาย', promo: 'โปรโมชั่น', reminder: 'แจ้งเตือน', info: 'ข้อมูลทั่วไป', update: 'อัปเดต / ความคืบหน้า', thanks: 'ขอบคุณ' };
const BLD_EMOJI = ['😀', '😊', '💗', '✨', '🎉', '📢', '📅', '✅', '⭐', '🐱', '🙏', '🔔'];
const BLD_ALLOWED = { B: 'b', STRONG: 'b', I: 'i', EM: 'i', U: 'u', S: 's', STRIKE: 's', DEL: 's', BLOCKQUOTE: 'blockquote', CODE: 'code' };

// Keeps only what Telegram accepts. Lists become readable lines with • or 1. ; links must be http(s).
function bldNodes(node) {
  let out = '';
  node.childNodes.forEach((n) => {
    if (n.nodeType === 3) { out += esc(n.textContent); return; }
    if (n.nodeType !== 1) return;
    const tag = n.tagName;
    if (tag === 'BR') { out += '\n'; return; }
    if (tag === 'UL' || tag === 'OL') {
      let i = 0;
      Array.from(n.children).forEach((li) => {
        if (li.tagName !== 'LI') return;
        i += 1;
        out += (tag === 'OL' ? i + '. ' : '• ') + bldNodes(li).trim() + '\n';
      });
      return;
    }
    if (tag === 'LI') { out += '• ' + bldNodes(n).trim() + '\n'; return; }
    if (tag === 'DIV' || tag === 'P') { out += bldNodes(n) + '\n'; return; }
    if (tag === 'A') {
      const href = n.getAttribute('href') || '';
      const inner = bldNodes(n);
      out += /^https?:\/\//i.test(href) ? `<a href="${esc(href)}">${inner}</a>` : inner;
      return;
    }
    const t = BLD_ALLOWED[tag];
    out += t ? `<${t}>${bldNodes(n)}</${t}>` : bldNodes(n);
  });
  return out;
}
function bldClean(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = String(html || '');
  return bldNodes(tpl.content).replace(/\n{3,}/g, '\n\n').trim();
}
function bldEditorHtml() {
  const ed = document.getElementById('bldEditor');
  return ed ? bldClean(ed.innerHTML) : '';
}
function bldPlainLength(html) {
  const d = document.createElement('div');
  d.innerHTML = html;
  return (d.textContent || '').length;
}

function bldPreview() {
  const html = bldEditorHtml();
  const prev = document.getElementById('bldPreview');
  const count = document.getElementById('bldCount');
  const ed = document.getElementById('bldEditor');
  if (count && ed) count.textContent = String(bldPlainLength(ed.innerText || ''));
  if (!prev) return;
  prev.innerHTML = html
    ? `<div class="bld-bubble">${html.replace(/\n/g, '<br>')}</div>`
    : '<div class="bld-bubble bld-bubble-empty">พิมพ์ข้อความที่ต้องการ...</div>';
  const btns = BLD.btnOn ? BLD.buttons.filter((b) => b.label) : [];
  if (btns.length) prev.innerHTML += btns.map((b) => `<div class="bld-prev-btn">${esc(b.label)}</div>`).join('');
  const warn = document.getElementById('bldWarn');
  if (warn) warn.textContent = ed && /<\/?(ul|ol)/i.test(ed.innerHTML) ? 'รายการ (•, 1.) จะถูกส่งเป็นข้อความธรรมดาที่อ่านง่าย' : '';
}

// ---------------------------------------------------------------- templates
function bldCards() {
  const list = BLD.templates.filter((t) => BLD.kind === 'all' || t.kind === BLD.kind);
  if (!list.length) return '<p class="bld-muted small">ยังไม่มีเทมเพลตในหมวดนี้ เขียนข้อความเองได้เลย หรือบันทึกเทมเพลตใหม่ด้านล่าง</p>';
  return list.map((t) => `<button type="button" class="bld-tpl" style="--tpl:${BLD_KIND_COLOR[t.kind] || '#FFD1E5'}" data-action="bld-pick" data-id="${esc(t.id)}">
      <span class="bld-tpl-ic">${icon(BLD_KINDS.find((k) => k[0] === t.kind)?.[2] || 'file')}</span>
      <span><b class="ellipsis">${esc(t.title)}</b><small>${esc(BLD_KIND_NAME[t.kind] || 'ทั่วไป')}</small></span></button>`).join('');
}
function bldKindsHtml() {
  return BLD_KINDS.map(([k, label, ic]) => `<button type="button" class="bld-pill ${BLD.kind === k ? 'is-on' : ''}" data-action="bld-kind" data-id="${k}">${icon(ic, 'sm')} ${esc(label)}</button>`).join('');
}
ACTIONS['bld-kind'] = (el) => {
  BLD.kind = el.dataset.id;
  document.querySelector('.bld-kinds').innerHTML = bldKindsHtml();
  document.querySelector('.bld-tpls').innerHTML = bldCards();
};
ACTIONS['bld-pick'] = (el) => {
  const t = BLD.templates.find((x) => x.id === el.dataset.id);
  if (!t) return;
  document.getElementById('bldEditor').innerHTML = t.formatted ? bldClean(t.formatted) : esc(t.content || '');
  BLD.buttons = (t.buttons || []).map((b) => ({ label: b.label, type: b.type, target: b.type === 'username' ? b.username : b.url }));
  BLD.btnOn = BLD.buttons.length > 0;
  document.getElementById('bldBtnOn').checked = BLD.btnOn;
  bldRenderButtons();
  bldPreview();
  document.querySelectorAll('.bld-tpl').forEach((b) => b.classList.toggle('is-on', b === el));
};

// ---------------------------------------------------------------- toolbar
document.addEventListener('mousedown', (e) => {
  if (e.target.closest && e.target.closest('.bld-toolbar')) e.preventDefault(); // keep the text selection
});
function bldRememberRange() {
  const sel = window.getSelection();
  const ed = document.getElementById('bldEditor');
  if (sel && sel.rangeCount && ed && ed.contains(sel.anchorNode)) BLD.range = sel.getRangeAt(0).cloneRange();
}
ACTIONS['bld-cmd'] = (el) => {
  const cmd = el.dataset.cmd;
  const ed = document.getElementById('bldEditor');
  if (!ed) return;
  ed.focus();
  if (cmd === 'bold') document.execCommand('bold');
  else if (cmd === 'italic') document.execCommand('italic');
  else if (cmd === 'underline') document.execCommand('underline');
  else if (cmd === 'strike') document.execCommand('strikeThrough');
  else if (cmd === 'quote') document.execCommand('formatBlock', false, 'blockquote');
  else if (cmd === 'ul') document.execCommand('insertUnorderedList');
  else if (cmd === 'ol') document.execCommand('insertOrderedList');
  else if (cmd === 'code') {
    const sel = window.getSelection();
    if (sel.rangeCount && !sel.isCollapsed) {
      try { sel.getRangeAt(0).surroundContents(Object.assign(document.createElement('code'))); }
      catch (err) { toast('เลือกข้อความในบรรทัดเดียวก่อนจัดรูปแบบโค้ด', 'err'); }
    }
  }
  bldPreview();
};
ACTIONS['bld-link'] = () => {
  bldRememberRange();
  openModal({
    title: 'เพิ่มลิงก์',
    body: `<form data-form="bld-link" class="stack">
      <label class="field"><span>ลิงก์ (https://)</span><input class="input" name="url" required placeholder="https://example.com"></label>
      <p class="small" data-role="form-error"></p>
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn ghost" data-action="close-modal">ยกเลิก</button>
        <button type="submit" class="btn primary">ใส่ลิงก์</button></div></form>`,
  });
};
FORMS['bld-link'] = async (form) => {
  const url = form.querySelector('[name="url"]').value.trim();
  if (!/^https?:\/\/[^\s]+$/i.test(url)) { setFormError(form, 'ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://'); return; }
  closeAllModals();
  const ed = document.getElementById('bldEditor');
  if (ed) { ed.focus(); if (BLD.range) { const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(BLD.range); } }
  document.execCommand('createLink', false, url);
  bldPreview();
};
ACTIONS['bld-emoji'] = () => {
  openModal({
    title: 'อิโมจิ',
    body: `<div class="bld-emoji-grid">${BLD_EMOJI.map((em) => `<button type="button" class="bld-emoji" data-action="bld-emoji-pick" data-value="${em}">${em}</button>`).join('')}</div>`,
  });
};
ACTIONS['bld-emoji-pick'] = (el) => {
  closeAllModals();
  const ed = document.getElementById('bldEditor');
  if (ed) ed.focus();
  document.execCommand('insertText', false, el.dataset.value);
  bldPreview();
};

// ---------------------------------------------------------------- inline buttons
function bldRenderButtons() {
  const box = document.getElementById('bldBtns');
  if (!box) return;
  if (!BLD.btnOn) { box.innerHTML = '<p class="bld-muted small">เปิดสวิตช์เพื่อเพิ่มปุ่มลิงก์ใต้ข้อความ</p>'; return; }
  box.innerHTML = `${BLD.buttons.map((b, i) => `<div class="bld-btn-row">
      <span class="bld-grip" aria-hidden="true">⋮⋮</span>
      <input class="input" value="${esc(b.label)}" placeholder="ชื่อปุ่ม เช่น ดูรายละเอียด" maxlength="40" data-bld-field="label" data-idx="${i}">
      <select class="select" data-bld-field="type" data-idx="${i}">
        <option value="url" ${b.type === 'url' ? 'selected' : ''}>ลิงก์เว็บไซต์ (URL)</option>
        <option value="username" ${b.type === 'username' ? 'selected' : ''}>Telegram Username</option>
        <option value="ack" ${b.type === 'ack' ? 'selected' : ''}>ปุ่มรับทราบ (บันทึกในระบบ)</option>
      </select>
      ${b.type === 'ack' ? '<span class="bld-ack-note">กดแล้วบันทึกว่ารับทราบในระบบ</span>' : `<input class="input" value="${esc(b.target || '')}" placeholder="${b.type === 'username' ? '@username' : 'https://example.com'}" data-bld-field="target" data-idx="${i}">`}
      <button type="button" class="bld-icon" data-action="bld-btn-up" data-idx="${i}" aria-label="เลื่อนขึ้น" ${i === 0 ? 'disabled' : ''}>▲</button>
      <button type="button" class="bld-icon" data-action="bld-btn-down" data-idx="${i}" aria-label="เลื่อนลง" ${i === BLD.buttons.length - 1 ? 'disabled' : ''}>▼</button>
      <button type="button" class="bld-icon danger" data-action="bld-btn-del" data-idx="${i}" aria-label="ลบปุ่ม">${icon('trash2', 'sm')}</button>
    </div>`).join('')}
    <button type="button" class="bld-add" data-action="bld-btn-add" ${BLD.buttons.length >= 8 ? 'disabled' : ''}>${icon('plus', 'sm')} เพิ่มปุ่ม</button>`;
}
ACTIONS['bld-btn-add'] = () => { if (BLD.buttons.length < 8) { BLD.buttons.push({ label: '', type: 'url', target: '' }); bldRenderButtons(); bldPreview(); } };
ACTIONS['bld-btn-del'] = (el) => { BLD.buttons.splice(Number(el.dataset.idx), 1); bldRenderButtons(); bldPreview(); };
ACTIONS['bld-btn-up'] = (el) => { const i = Number(el.dataset.idx); if (i > 0) [BLD.buttons[i - 1], BLD.buttons[i]] = [BLD.buttons[i], BLD.buttons[i - 1]]; bldRenderButtons(); bldPreview(); };
ACTIONS['bld-btn-down'] = (el) => { const i = Number(el.dataset.idx); if (i < BLD.buttons.length - 1) [BLD.buttons[i + 1], BLD.buttons[i]] = [BLD.buttons[i], BLD.buttons[i + 1]]; bldRenderButtons(); bldPreview(); };
document.addEventListener('input', (e) => {
  const f = e.target.dataset && e.target.dataset.bldField;
  if (!f) return;
  const b = BLD.buttons[Number(e.target.dataset.idx)];
  if (!b) return;
  b[f] = e.target.value;
  if (f === 'label') bldPreview();
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'bldBtnOn') { BLD.btnOn = e.target.checked; bldRenderButtons(); bldPreview(); return; }
  if (e.target.dataset && e.target.dataset.bldField === 'type') {
    BLD.buttons[Number(e.target.dataset.idx)].type = e.target.value;
    bldRenderButtons();
  }
  if (e.target.id === 'bldSaveTpl') {
    const name = document.getElementById('bldTplName');
    if (name) name.disabled = !e.target.checked;
  }
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'bldEditor') bldPreview();
});

// Checks the buttons before sending or saving. Returns the list Telegram gets, or throws a message.
function bldButtonsForSend() {
  if (!BLD.btnOn) return [];
  return BLD.buttons.map((b, i) => {
    const label = String(b.label || '').trim();
    if (!label) throw new Error(`ใส่ชื่อปุ่มที่ ${i + 1}`);
    if (b.type === 'ack') return { label, type: 'ack' };
    const target = String(b.target || '').trim();
    if (b.type === 'username') {
      if (!/^@?[A-Za-z][A-Za-z0-9_]{4,31}$/.test(target)) throw new Error(`Telegram Username ของปุ่ม “${label}” ไม่ถูกต้อง`);
      return { label, type: 'username', target };
    }
    if (!/^https?:\/\/[^\s]+$/i.test(target)) throw new Error(`ลิงก์ของปุ่ม “${label}” ต้องขึ้นต้นด้วย https://`);
    return { label, type: 'url', target };
  });
}

// ---------------------------------------------------------------- popup
ACTIONS['chat-menu-builder'] = () => { closePlusMenu(); openBuilder(); };
async function openBuilder() {
  const gid = S.chat.groupId;
  if (!gid) { toast('เลือกห้องแชทก่อนแต่งข้อความ', 'err'); return; }
  try {
    const { items } = await apiGet('/api/telegram/templates');
    BLD.templates = items;
  } catch (err) { BLD.templates = []; toast(err.message, 'err'); }
  BLD.kind = 'all';
  BLD.buttons = [];
  BLD.btnOn = false;
  const topic = S.chat.topic && S.chat.topic !== 'all' ? (S.chat.topics || []).find((t) => String(t.threadId) === S.chat.topic) : null;
  const replyTo = S.chat.replyTo;
  openModal({
    title: '✨ แต่งข้อความ',
    wide: true,
    body: `<form data-form="bld" data-group="${esc(gid)}" class="bld" novalidate>
      <p class="bld-sub">สร้างข้อความสวย ใช้เทมเพลต พร้อมเพิ่มปุ่มลิงก์หรือยูสเซอร์</p>
      <div class="bld-grid">
        <aside class="bld-side">
          <h4>เทมเพลตข้อความ</h4>
          <div class="bld-kinds">${bldKindsHtml()}</div>
          <div class="bld-tpls">${bldCards()}</div>
        </aside>
        <section class="bld-main">
          <div class="bld-block">
            <h4>ข้อความของคุณ</h4>
            <div class="bld-toolbar" role="toolbar" aria-label="จัดรูปแบบข้อความ">
              <button type="button" data-action="bld-cmd" data-cmd="bold" aria-label="ตัวหนา"><b>B</b></button>
              <button type="button" data-action="bld-cmd" data-cmd="italic" aria-label="ตัวเอียง"><i>I</i></button>
              <button type="button" data-action="bld-cmd" data-cmd="underline" aria-label="ขีดเส้นใต้"><u>U</u></button>
              <button type="button" data-action="bld-cmd" data-cmd="strike" aria-label="ขีดฆ่า"><s>S</s></button>
              <span class="bld-sep"></span>
              <button type="button" data-action="bld-cmd" data-cmd="quote" aria-label="ข้อความอ้างอิง">❝</button>
              <button type="button" data-action="bld-cmd" data-cmd="code" aria-label="โค้ด">&lt;/&gt;</button>
              <span class="bld-sep"></span>
              <button type="button" data-action="bld-cmd" data-cmd="ul" aria-label="รายการแบบจุด">•≡</button>
              <button type="button" data-action="bld-cmd" data-cmd="ol" aria-label="รายการแบบตัวเลข">1≡</button>
              <span class="bld-sep"></span>
              <button type="button" data-action="bld-link" aria-label="เพิ่มลิงก์">🔗</button>
              <button type="button" data-action="bld-emoji" aria-label="อิโมจิ">☺</button>
            </div>
            <div class="bld-editor" id="bldEditor" contenteditable="true" role="textbox" aria-multiline="true" aria-label="พิมพ์ข้อความ"></div>
            <div class="bld-count"><span id="bldCount">0</span> / 4,000</div>
          </div>
          <div class="bld-block">
            <h4>ตัวอย่างข้อความ</h4>
            <div class="bld-preview" id="bldPreview"></div>
            <p class="bld-warn" id="bldWarn"></p>
          </div>
          <div class="bld-block">
            <div class="bld-btn-head"><h4>ปุ่มการใช้งาน (เลือกได้หลายปุ่ม)</h4>
              <label class="bld-switch"><input type="checkbox" id="bldBtnOn"> เพิ่มปุ่ม</label></div>
            <div id="bldBtns"></div>
          </div>
          <p class="bld-hint">ส่งไปยัง: <b>${esc(topic ? topic.name : 'ทั้งกลุ่ม')}</b>${replyTo ? ` · ตอบกลับ: ${esc((replyTo.text || '').slice(0, 40))}` : ''}</p>
        </section>
      </div>
      <p class="small" data-role="form-error"></p>
      <div class="bld-foot">
        <label class="bld-save"><input type="checkbox" id="bldSaveTpl" name="saveTpl"> บันทึกเป็นเทมเพลตใหม่</label>
        <input class="input" id="bldTplName" name="tplName" maxlength="80" placeholder="ชื่อเทมเพลต" disabled>
        <span class="bld-spacer"></span>
        <button type="button" class="btn ghost" data-action="close-modal">ยกเลิก</button>
        <button type="submit" class="btn bld-send">${icon('send', 'sm')} สร้างข้อความ</button>
      </div>
    </form>`,
    onMount: (modal) => {
      modal.classList.add('bld-modal');
      bldRenderButtons();
      bldPreview();
      const ed = modal.querySelector('#bldEditor');
      if (ed) setTimeout(() => ed.focus(), 40);
    },
  });
}

FORMS['bld'] = async (form) => {
  const gid = form.dataset.group;
  const html = bldEditorHtml();
  const btn = form.querySelector('[type="submit"]');
  let buttons;
  try {
    buttons = bldButtonsForSend();
  } catch (err) { setFormError(form, err.message); return; }
  if (!html.replace(/<[^>]+>/g, '').trim()) { setFormError(form, 'กรุณาพิมพ์ข้อความก่อนสร้าง'); return; }
  const topic = S.chat.topic && S.chat.topic !== 'all' ? Number(S.chat.topic) : null;
  const replyTo = S.chat.replyTo ? S.chat.replyTo.messageId : null;
  const save = form.querySelector('#bldSaveTpl').checked;
  const tplName = form.querySelector('#bldTplName').value.trim();
  if (save && !tplName) { setFormError(form, 'ใส่ชื่อเทมเพลตก่อนบันทึก'); return; }
  try {
    if (save) {
      await apiPost('/api/telegram/templates', { title: tplName, formatted: html, kind: BLD.kind === 'all' ? 'info' : BLD.kind, buttons });
      BLD.templates = (await apiGet('/api/telegram/templates')).items;
    }
    // Sent only when Telegram has answered: the outbox row says "sent" or "failed".
    const clientKey = 'bld-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    const out = await busy(btn, () => apiPost(`/api/telegram/groups/${gid}/send`, { formatted: html, threadId: topic, replyToMessageId: replyTo, buttons, clientKey }));
    if (out && out.status === 'failed') { setFormError(form, 'ส่งไม่สำเร็จ: ' + (out.error || 'ลองใหม่อีกครั้ง') + ' (ข้อความยังอยู่ ลองส่งใหม่ได้)'); return; }
    closeAllModals();
    toast('ส่งข้อความแล้ว');
    renderChat({ keep: true });
  } catch (err) { setFormError(form, err.message); }
};

// Who pressed a "รับทราบ" button on a message (shown under the message in the room).
function ackSummaryHtml(a) {
  const more = a.count > a.names.length ? ' และอื่น ๆ' : '';
  return `<div class="cv-acks-sum">✓ รับทราบแล้ว ${a.count} คน: ${esc(a.names.slice(0, 5).join(', '))}${more}</div>`;
}

// The buttons sent under a message, shown in the room. Links open their page; "รับทราบ" is pressed in Telegram.
function messageButtonsHtml(list) {
  return `<div class="cv-msg-buttons">${list.map((b) => (b.type === 'ack'
    ? `<span class="cv-msg-btn is-ack" title="กดรับทราบได้ในแอป Telegram">${esc(b.label)}</span>`
    : `<a class="cv-msg-btn" href="${esc(b.url)}" target="_blank" rel="noopener noreferrer">${esc(b.label)} <span aria-hidden="true">↗</span></a>`)).join('')}</div>`;
}

// Click a photo in the room: it opens large in a popup, with a download link.
document.addEventListener('click', (e) => {
  const img = e.target.closest && e.target.closest('img.cv-zoomable');
  if (!img) return;
  e.preventDefault();
  const url = img.dataset.zoom || img.src;
  openModal({
    title: 'รูปภาพ',
    wide: true,
    body: `<div class="zoom-wrap"><img class="zoom-img" src="${esc(url)}" alt="${esc(img.alt || 'รูปภาพ')}"></div>
      <div class="zoom-foot"><a class="btn" href="${esc(url)}" download>${icon('download', 'sm')} บันทึกรูป</a>
      <button type="button" class="btn ghost" data-action="close-modal">ปิด</button></div>`,
  });
});
