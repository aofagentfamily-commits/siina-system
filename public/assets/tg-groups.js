/* SIINA SYSTEM — Telegram group management: card grid with tags and dark pink popups.
   Tags are stored per group and used only inside SIINA SYSTEM (never sent to Telegram). */
'use strict';

const TGG_COLORS = ['#AFC8FF', '#B5E6FF', '#B8F2D5', '#FFFFFF', '#FFD8B5', '#FFF4A8'];
const TGG_STATUS = {
  ready: ['พร้อมใช้งาน', 'ok'],
  error: ['มีปัญหา', 'bad'],
  unknown: ['ยังไม่ทดสอบ', ''],
  unlinked: ['ยังไม่ได้เชื่อมต่อบอท', 'warn'],
};
let tggTags = [];
let tggSelected = -1;   // index of the tag chosen for recolouring
let tggNewColor = TGG_COLORS[0];
const tggColor = (c) => (TGG_COLORS.includes(c) ? c : '#FFFFFF');

async function tgGroups(panel) {
  const [{ items: groups }, { items: bots }] = await Promise.all([apiGet('/api/telegram/groups'), apiGet('/api/telegram/bots')]);
  panel.innerHTML = `
    <div class="tgg-head">
      <div>
        <h3>จัดการกลุ่ม</h3>
        <p>กลุ่มยังอยู่ทุกครั้งที่ลบบอท เปลี่ยนบอทได้โดยไม่ต้องกรอก Chat ID ใหม่</p>
      </div>
      <button class="tgg-btn primary" data-action="tg-group-new" ${bots.length ? '' : 'disabled title="เพิ่มบอทก่อน"'}>${icon('plus')} เพิ่มกลุ่ม</button>
    </div>
    ${groups.length
      ? `<div class="tgg-grid">${groups.map(tgGroupCard).join('')}</div>`
      : `<div class="tgg-empty">${bots.length ? 'ยังไม่มีกลุ่ม กดเพิ่มกลุ่มเพื่อเริ่มต้น' : 'ยังไม่มีกลุ่ม เพิ่มบอทก่อนเพื่อเริ่มเพิ่มกลุ่ม'}</div>`}`;
}

function tgGroupCard(g) {
  const unlinked = !g.botId;
  const st = TGG_STATUS[unlinked ? 'unlinked' : g.status] || TGG_STATUS.unknown;
  const tags = (g.tags || []).map((t) => `<span class="tgg-chip" style="--tag:${tggColor(t.color)}">${esc(t.name)}</span>`).join('');
  return `<article class="tgg-card ${unlinked ? 'is-unlinked' : ''}">
    <header class="tgg-top">
      <button type="button" class="tgg-avatar" data-action="tg-group-avatar" data-id="${esc(g.id)}" aria-label="ตั้งรูปโปรไฟล์กลุ่ม" title="ตั้งรูปโปรไฟล์กลุ่ม">${tgGroupAvatarInner(g)}</button>
      <div class="tgg-title">
        <h4 class="ellipsis">${esc(g.title)}</h4>
        <p>Chat ID</p>
        <p class="tgg-id">${esc(g.chatId)}</p>
      </div>
      ${tgGroupLockSwitch(g)}
    </header>
    <dl class="tgg-meta">
      <dt>บอทที่เชื่อมต่อ</dt><dd>${unlinked ? '<span class="tgg-muted">ยังไม่ได้เชื่อมต่อบอท</span>' : esc(g.botName)}</dd>
      <dt>สถานะ</dt><dd><span class="tgg-pill ${st[1]}">${esc(st[0])}</span></dd>
      <dt>การติดตาม</dt><dd class="tgg-track-row"><label class="switch" title="เปิด = รับและบันทึกข้อความจากกลุ่มนี้ / ปิด = ไม่รับข้อความ"><input type="checkbox" data-change="tg-group-toggle" data-id="${esc(g.id)}" ${g.enabled ? 'checked' : ''}><span></span></label> <span>${g.enabled ? 'เปิดอยู่' : 'ปิดอยู่'}</span></dd>
      <dt>ตอบรับอัตโนมัติ</dt><dd>${g.autoReply ? 'เปิด' : 'ปิด'}</dd>
      <dt>การล็อกห้อง</dt><dd>${g.locked ? '🔒 ล็อกอยู่' : '🔓 ไม่ได้ล็อก'}</dd>
    </dl>
    <div class="tgg-tags-label">แท็ก</div>
    <div class="tgg-tags">${tags || '<span class="tgg-muted">ยังไม่มีแท็ก</span>'}</div>
    ${g.lastError ? `<p class="tgg-error">${esc(g.lastError)}</p>` : ''}
    <footer class="tgg-actions">
      <button class="tgg-btn light" data-action="tg-group-edit" data-id="${esc(g.id)}">${icon('edit', 'sm')} แก้ไข</button>
      ${unlinked
        ? `<button class="tgg-btn light" data-action="tg-group-edit" data-id="${esc(g.id)}" data-focus="bot">เลือกบอทใหม่</button>`
        : `<button class="tgg-btn light" data-action="tg-group-test" data-id="${esc(g.id)}">ทดสอบสิทธิ์</button>`}
      <button class="tgg-btn danger" data-action="tg-group-delete" data-id="${esc(g.id)}">${icon('trash2', 'sm')} ลบกลุ่ม</button>
    </footer>
  </article>`;
}

// ---------------------------------------------------------------- popup (add and edit share one design)
function tggRenderTags(modal) {
  const list = modal.querySelector('#tggTagList');
  if (!list) return;
  list.innerHTML = tggTags.length
    ? tggTags.map((t, i) => `<span class="tgg-chip tgg-chip-edit ${i === tggSelected ? 'is-selected' : ''}" style="--tag:${tggColor(t.color)}">
        <button type="button" class="tgg-chip-main" data-action="tgg-pick" data-idx="${i}" aria-pressed="${i === tggSelected}">${esc(t.name)}</button>
        <button type="button" class="tgg-chip-x" data-action="tgg-remove" data-idx="${i}" aria-label="ลบแท็ก ${esc(t.name)}">${icon('close', 'sm')}</button>
      </span>`).join('')
    : '<span class="tgg-muted">ยังไม่มีแท็ก พิมพ์ชื่อแท็กแล้วกด Enter</span>';
  const active = tggSelected >= 0 && tggTags[tggSelected] ? tggTags[tggSelected].color : tggNewColor;
  modal.querySelectorAll('.tgg-sw').forEach((b) => b.classList.toggle('is-active', b.dataset.color === active));
}

function groupForm(group, bots, focusBot) {
  const isNew = !group;
  tggTags = (group && group.tags ? group.tags : []).map((t) => ({ name: t.name, color: t.color }));
  tggSelected = -1;
  tggNewColor = TGG_COLORS[0];
  return openModal({
    title: isNew ? 'เพิ่มกลุ่ม Telegram' : 'แก้ไขกลุ่ม',
    body: `<form data-form="tg-group" data-id="${esc(group ? group.id : '')}" data-prev-bot="${esc(group && group.botId ? group.botId : '')}" data-locked="${group && group.locked ? 1 : 0}" class="tgg-form">
      <label class="tgg-label" for="tggBot">บอทที่ใช้</label>
      <select class="select" id="tggBot" name="botId" ${isNew ? 'required' : ''} ${focusBot ? 'data-focus="1"' : ''}>
        ${isNew ? '' : '<option value="">— ยังไม่เชื่อมต่อบอท —</option>'}
        ${bots.map((b) => `<option value="${esc(b.id)}" ${group && group.botId === b.id ? 'selected' : ''}>${esc(b.name)}${b.username ? ' (@' + esc(b.username) + ')' : ''}</option>`).join('')}
      </select>
      ${isNew ? '' : '<small class="tgg-hint">เมื่อเปลี่ยนบอท ระบบจะทดสอบสิทธิ์ของบอทใหม่ให้อัตโนมัติ</small>'}

      <label class="tgg-label" for="tggTitle">ชื่อกลุ่ม</label>
      <input class="input" id="tggTitle" name="title" maxlength="120" required value="${esc(group ? group.title : '')}">

      ${isNew
        ? '<label class="tgg-label" for="tggChat">Chat ID / Group ID</label><input class="input" id="tggChat" name="chatId" required inputmode="numeric" placeholder="-1001234567890">'
        : `<small class="tgg-hint">Chat ID: ${esc(group.chatId)} (ไม่เปลี่ยนเมื่อเปลี่ยนบอท)</small>`}

      <label class="tgg-check"><input type="checkbox" name="enabled" ${!group || group.enabled ? 'checked' : ''}> เปิดการติดตามกลุ่มนี้</label>
      ${isNew ? '' : `<label class="tgg-check"><input type="checkbox" name="autoReply" ${group.autoReply ? 'checked' : ''}> ตอบรับอัตโนมัติในกลุ่มนี้</label>`}

      ${tggLockSection(group)}

      <section class="tgg-tagbox">
        <div class="tgg-tagbox-head">
          <div class="tgg-tagbox-input">
            <span class="tgg-label">แท็ก (เลือกสีและเพิ่มได้หลายแท็ก)</span>
            <input class="input" id="tggTagName" maxlength="30" placeholder="พิมพ์ชื่อแท็ก แล้วกด Enter" autocomplete="off">
          </div>
          <div class="tgg-swatches" role="group" aria-label="เลือกสีแท็ก">
            ${TGG_COLORS.map((c) => `<button type="button" class="tgg-sw" data-action="tgg-color" data-color="${c}" style="--sw:${c}" aria-label="สีแท็ก ${c}" title="${c}"></button>`).join('')}
          </div>
        </div>
        <div class="tgg-tag-list" id="tggTagList"></div>
        <small class="tgg-hint">กดแท็กเพื่อเลือก แล้วกดสีเพื่อเปลี่ยนสีของแท็กนั้น · แท็กใช้จัดหมวดหมู่ใน SIINA SYSTEM เท่านั้น</small>
      </section>

      <p class="tgg-error" data-role="form-error" role="alert"></p>
      <div class="tgg-footer">
        <button type="button" class="tgg-btn ghost" data-action="close-modal">ยกเลิก</button>
        <button type="submit" class="tgg-btn primary">บันทึก</button>
      </div>
    </form>`,
    onMount: (modal) => {
      modal.classList.add('tg-modal');
      tggRenderTags(modal);
      const name = modal.querySelector('#tggTagName');
      name.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const value = name.value.trim();
        const err = modal.querySelector('[data-role="form-error"]');
        if (!value) return;
        if (tggTags.some((t) => t.name.toLowerCase() === value.toLowerCase())) { err.textContent = `มีแท็ก “${value}” อยู่แล้ว`; return; }
        if (tggTags.length >= 20) { err.textContent = 'แท็กในกลุ่มเดียวกันมากที่สุด 20 แท็ก'; return; }
        err.textContent = '';
        tggTags.push({ name: value, color: tggNewColor });
        name.value = '';
        tggRenderTags(modal);
      });
      modal.addEventListener('click', (e) => {
        const el = e.target.closest('[data-action]');
        if (!el) return;
        if (el.dataset.action === 'tgg-color') {
          if (tggSelected >= 0 && tggTags[tggSelected]) tggTags[tggSelected].color = el.dataset.color;
          else tggNewColor = el.dataset.color;
          tggRenderTags(modal);
        } else if (el.dataset.action === 'tgg-pick') {
          const i = Number(el.dataset.idx);
          tggSelected = tggSelected === i ? -1 : i;
          tggRenderTags(modal);
        } else if (el.dataset.action === 'tgg-remove') {
          tggTags.splice(Number(el.dataset.idx), 1);
          tggSelected = -1;
          tggRenderTags(modal);
        }
      });
      tggLockBind(modal);
      const focusTarget = modal.querySelector('[data-focus="1"]');
      if (focusTarget) setTimeout(() => focusTarget.focus(), 40);
    },
  });
}

FORMS['tg-group'] = async (form) => {
  const fd = new FormData(form);
  const id = form.dataset.id;
  const prevBot = form.dataset.prevBot || '';
  const btn = form.querySelector('[type="submit"]');
  const nextBot = fd.get('botId') || '';
  const tagPayload = tggTags.map((t) => ({ name: t.name, color: t.color }));
  const lock = tggLockPayload(form, form.dataset.locked === '1');
  if (lock.error) { setFormError(form, lock.error); return; }
  try {
    let groupId = id;
    if (id) {
      await busy(btn, () => apiPatch('/api/telegram/groups/' + id, {
        title: fd.get('title'),
        enabled: fd.get('enabled') === 'on',
        autoReply: fd.get('autoReply') === 'on',
        botId: nextBot || null,
        ...lock.body,
      }));
    } else {
      const created = await busy(btn, () => apiPost('/api/telegram/groups', {
        botId: fd.get('botId'),
        title: fd.get('title'),
        chatId: fd.get('chatId'),
        enabled: fd.get('enabled') === 'on',
      }));
      groupId = created.id;
      if (lock.body.lockPin) await apiPatch('/api/telegram/groups/' + groupId, { lockPin: lock.body.lockPin });
    }
    await apiPut(`/api/telegram/groups/${groupId}/tags`, { tags: tagPayload });
    closeAllModals();
    toast(id ? 'บันทึกกลุ่มและแท็กแล้ว' : 'เพิ่มกลุ่มแล้ว กดทดสอบสิทธิ์เพื่อยืนยัน');
    if (id && nextBot && nextBot !== prevBot) {
      const t = await apiPost(`/api/telegram/groups/${id}/test`);
      toast(t.ok ? t.message : 'ทดสอบไม่สำเร็จ: ' + t.message, t.ok ? 'ok' : 'err');
    }
    tgPanel();
  } catch (err) {
    setFormError(form, err.message);
  }
};

// ---------------------------------------------------------------- room lock screen (6-digit PIN)
function renderChatLocked(chats, mentions, active) {
  S.chat.chats = chats;
  S.chat.mentions = mentions;
  S.chat.groupId = active.id;
  const boxes = [0, 1, 2, 3, 4, 5].map((i) => `<input class="pin-box" inputmode="numeric" maxlength="1" autocomplete="off" aria-label="หลักที่ ${i + 1}">`).join('');
  fillPage(`${catBarHtml()}<div class="cv-layout show-chat" id="chatLayout">
    <aside class="cv-list" aria-label="รายการแชท"><div class="cv-items" id="cvItems">${chatListHtml()}</div></aside>
    <section class="cv-main cv-locked" aria-label="ห้องแชทถูกล็อก">
      <div class="pin-card" data-group="${esc(active.id)}">
        <div class="pin-icon">${icon('lock')}</div>
        <h3>ใส่รหัสห้องแชท</h3>
        <p class="muted">กรุณาใส่รหัส 6 ตัวเพื่อเปิดห้อง “${esc(active.title)}”</p>
        <div class="pin-boxes">${boxes}</div>
        <p class="pin-error" data-role="pin-error" role="alert"></p>
        <button type="button" class="pin-submit" data-action="pin-submit">ยืนยัน</button>
        <button type="button" class="pin-forgot" data-action="pin-forgot">ลืมรหัส?</button>
        <button type="button" class="pin-cancel" data-action="pin-cancel">ยกเลิก</button>
      </div>
    </section>
  </div>`);
  setTimeout(() => { const first = document.querySelector('.pin-box'); if (first) first.focus(); }, 30);
}
const pinBoxes = () => [...document.querySelectorAll('.pin-box')];
const pinValue = () => pinBoxes().map((b) => b.value).join('');
function setPinError(message) {
  const err = document.querySelector('[data-role="pin-error"]');
  if (err) err.textContent = message || '';
}
function pinReset(message) {
  pinBoxes().forEach((b) => { b.value = ''; });
  setPinError(message);
  const first = document.querySelector('.pin-box');
  if (first) first.focus();
}
async function pinSubmit() {
  const card = document.querySelector('.pin-card');
  if (!card) return;
  const pin = pinValue();
  if (!/^\d{6}$/.test(pin)) { setPinError('กรุณาใส่รหัสให้ครบ 6 ตัว'); return; }
  const groupId = card.dataset.group;
  try {
    await apiPost(`/api/telegram/groups/${groupId}/unlock`, { pin });
    renderChat({ group: groupId });
  } catch (err) {
    pinReset(err.message);
    card.classList.add('is-shake');
    setTimeout(() => card.classList.remove('is-shake'), 400);
  }
}
ACTIONS['pin-submit'] = () => pinSubmit();
ACTIONS['pin-forgot'] = () => {
  const card = document.querySelector('.pin-card');
  if (!card) return;
  openModal({
    title: 'ลืมรหัสห้องแชท',
    body: `<form data-form="pin-forgot" data-group="${esc(card.dataset.group)}" class="stack">
      <p class="muted small">ใส่รหัสผ่านของบัญชี SIINA SYSTEM เพื่อเปิดห้องนี้ รหัส 6 ตัวเดิมยังคงอยู่</p>
      <label class="field"><span>รหัสผ่านบัญชี</span><input class="input" type="password" name="password" required autocomplete="current-password"></label>
      <p class="small" data-role="form-error"></p>
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn ghost" data-action="close-modal">ยกเลิก</button>
        <button type="submit" class="btn primary">เปิดห้อง</button></div>
    </form>`,
  });
};
FORMS['pin-forgot'] = async (form) => {
  const password = form.querySelector('[name="password"]').value;
  const groupId = form.dataset.group;
  const btn = form.querySelector('[type="submit"]');
  try {
    await busy(btn, () => apiPost(`/api/telegram/groups/${groupId}/unlock-password`, { password }));
    closeAllModals();
    renderChat({ group: groupId });
  } catch (err) { setFormError(form, err.message); }
};

// Typing moves to the next box; the sixth digit submits. Backspace goes back; paste fills all six.
document.addEventListener('input', (e) => {
  if (!e.target.classList || !e.target.classList.contains('pin-box')) return;
  const box = e.target;
  box.value = box.value.replace(/\D/g, '').slice(-1);
  if (box.value) {
    const next = pinBoxes()[pinBoxes().indexOf(box) + 1];
    if (next) next.focus();
  }
  if (pinValue().length === 6) pinSubmit();
});
document.addEventListener('keydown', (e) => {
  if (!e.target.classList || !e.target.classList.contains('pin-box')) return;
  if (e.key === 'Backspace' && !e.target.value) {
    const prev = pinBoxes()[pinBoxes().indexOf(e.target) - 1];
    if (prev) { prev.value = ''; prev.focus(); }
    e.preventDefault();
  }
  if (e.key === 'Enter') { e.preventDefault(); pinSubmit(); }
});
document.addEventListener('paste', (e) => {
  if (!e.target.classList || !e.target.classList.contains('pin-box')) return;
  e.preventDefault();
  const digits = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6);
  const boxes = pinBoxes();
  boxes.forEach((b, i) => { b.value = digits[i] || ''; });
  const last = boxes[Math.min(digits.length, 6) - 1];
  if (last) last.focus();
  if (digits.length === 6) pinSubmit();
});

// ---------------------------------------------------------------- room lock: switch, popup section, PIN rules
// Padlock icon in the card's top-right corner. Closed + rainbow = locked; open + plain = not locked.
const TGG_LOCKED_PATH = 'M7 11V8a5 5 0 0 1 10 0v3 M6 11h12v9H6z';
const TGG_OPEN_PATH = 'M7 11V7a5 5 0 0 1 9.9-1 M6 11h12v9H6z';
function tgGroupLockSwitch(g) {
  const locked = !!g.locked;
  const label = locked ? 'ห้องนี้ล็อกอยู่' : 'ห้องนี้ไม่ได้ล็อก';
  const svg = locked
    ? `<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="tggRainbow" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#FF3B5C"/><stop offset=".2" stop-color="#FF8A3D"/><stop offset=".4" stop-color="#FFE14D"/>
        <stop offset=".6" stop-color="#3DDC84"/><stop offset=".8" stop-color="#3AA8FF"/><stop offset="1" stop-color="#A65CFF"/></linearGradient></defs>
        <path d="${TGG_LOCKED_PATH}" fill="none" stroke="url(#tggRainbow)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    : `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${TGG_OPEN_PATH}" fill="none" stroke="#E4DCEB" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return `<button type="button" class="tgg-lockbtn ${locked ? 'is-locked' : ''}" data-action="tg-group-lock" data-id="${esc(g.id)}"
    aria-label="${label}. กดเพื่อ${locked ? 'เปลี่ยนรหัสหรือปิดการล็อก' : 'ตั้งรหัสล็อกห้อง'}" title="${label}">${svg}</button>`;
}

function tggPinField(name, label) {
  return `<label class="field tgg-pin-field"><span>${label}</span>
    <input class="input" name="${name}" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="off"></label>`;
}

// Same section for add and edit. Fields show only when they are needed (see tggLockBind).
function tggLockSection(group) {
  const locked = !!(group && group.locked);
  return `<section class="tgg-lock">
    <div class="tgg-lock-row">
      <div class="tgg-lock-text"><b>การล็อกห้องแชท</b>
        <small class="tgg-hint">${locked ? '🔒 ล็อกอยู่ ต้องใส่รหัส 6 หลักก่อนเข้าห้องแชท' : '🔓 ไม่ได้ล็อก เข้าห้องแชทได้ตามสิทธิ์ปกติ'}</small></div>
      <label class="tgg-switch"><input type="checkbox" name="lockOn" ${locked ? 'checked' : ''}><span class="knob">${icon('lock', 'sm')}</span></label>
    </div>
    ${locked ? '<label class="tgg-check tgg-change"><input type="checkbox" name="changePin"> เปลี่ยนรหัสห้องแชท</label>' : ''}
    <div class="tgg-lock-fields">
      <div data-role="lock-current" hidden>${tggPinField('currentPin', 'รหัสเดิม 6 หลัก')}</div>
      <div data-role="lock-new" hidden>
        ${tggPinField('newPin', 'ตั้งรหัสห้องแชท 6 หลัก')}
        ${tggPinField('confirmPin', 'ยืนยันรหัสห้องแชท 6 หลัก')}
      </div>
    </div>
  </section>`;
}

// Shows only the fields that are needed for the current choice.
function tggLockBind(modal) {
  const form = modal.querySelector('form.tgg-form');
  if (!form) return;
  const sync = () => {
    const wasLocked = form.dataset.locked === '1';
    const on = form.querySelector('[name="lockOn"]').checked;
    const changeBox = form.querySelector('[name="changePin"]');
    const changing = wasLocked && !!(changeBox && changeBox.checked);
    if (changeBox) changeBox.closest('.tgg-change').hidden = !(on && wasLocked);
    form.querySelector('[data-role="lock-current"]').hidden = !((on && changing) || (!on && wasLocked));
    form.querySelector('[data-role="lock-new"]').hidden = !(on && (!wasLocked || changing));
  };
  form.addEventListener('change', sync);
  sync();
}

// Builds the lock part of the save request and checks what the user typed.
function tggLockPayload(form, wasLocked) {
  const fd = new FormData(form);
  const on = fd.get('lockOn') === 'on';
  const current = String(fd.get('currentPin') || '').trim();
  const pin = String(fd.get('newPin') || '').trim();
  const confirm = String(fd.get('confirmPin') || '').trim();
  const changing = fd.get('changePin') === 'on';
  if (!on) {
    if (!wasLocked) return { body: {} };
    if (!/^\d{6}$/.test(current)) return { error: 'กรุณาใส่รหัสเดิม 6 หลักเพื่อปิดการล็อก' };
    return { body: { lockOff: true, currentPin: current } };
  }
  if (wasLocked && !changing) return { body: {} };
  if (!/^\d{6}$/.test(pin)) return { error: 'รหัสห้องแชทต้องเป็นตัวเลข 6 หลัก' };
  if (pin !== confirm) return { error: 'รหัสยืนยันไม่ตรงกับรหัสที่ตั้ง' };
  if (wasLocked) {
    if (!/^\d{6}$/.test(current)) return { error: 'กรุณาใส่รหัสเดิม 6 หลักเพื่อเปลี่ยนรหัส' };
    return { body: { lockPin: pin, currentPin: current } };
  }
  return { body: { lockPin: pin } };
}

// The switch on a card: turning it on asks for a new PIN, turning it off asks for the current PIN.
ACTIONS['tg-group-lock'] = async (el) => {
  const id = el.dataset.id;
  const { items } = await apiGet('/api/telegram/groups');
  const g = items.find((x) => x.id === id);
  if (!g) return;
  if (g.locked) {
    openModal({
      title: 'ปิดการล็อกห้องแชท',
      body: `<form data-form="tg-lock-off" data-id="${esc(id)}" class="stack">
        <p class="muted small">ใส่รหัสเดิมเพื่อยืนยันการปิดการล็อก</p>
        ${tggPinField('currentPin', 'รหัสเดิม 6 หลัก')}
        <p class="small" data-role="form-error"></p>
        <div class="row" style="justify-content:flex-end"><button type="button" class="btn ghost" data-action="close-modal">ยกเลิก</button>
          <button type="submit" class="btn primary">ยืนยันปิดการล็อก</button></div>
      </form>`,
    });
  } else {
    openModal({
      title: 'ล็อกห้องแชท',
      body: `<form data-form="tg-lock-set" data-id="${esc(id)}" class="stack">
        <p class="muted small">ตั้งรหัส 6 หลักที่ใช้เปิดห้องแชทนี้</p>
        ${tggPinField('newPin', 'ตั้งรหัสห้องแชท 6 หลัก')}
        ${tggPinField('confirmPin', 'ยืนยันรหัสห้องแชท 6 หลัก')}
        <p class="small" data-role="form-error"></p>
        <div class="row" style="justify-content:flex-end"><button type="button" class="btn ghost" data-action="close-modal">ยกเลิก</button>
          <button type="submit" class="btn primary">บันทึกการล็อก</button></div>
      </form>`,
    });
  }
};
FORMS['tg-lock-set'] = async (form) => {
  const pin = form.querySelector('[name="newPin"]').value.trim();
  const confirm = form.querySelector('[name="confirmPin"]').value.trim();
  if (!/^\d{6}$/.test(pin)) { setFormError(form, 'รหัสห้องแชทต้องเป็นตัวเลข 6 หลัก'); return; }
  if (pin !== confirm) { setFormError(form, 'รหัสยืนยันไม่ตรงกับรหัสที่ตั้ง'); return; }
  const btn = form.querySelector('[type="submit"]');
  try {
    await busy(btn, () => apiPatch('/api/telegram/groups/' + form.dataset.id, { lockPin: pin }));
    closeAllModals();
    toast('ล็อกห้องแชทแล้ว');
    tgPanel();
  } catch (err) { setFormError(form, err.message); }
};
FORMS['tg-lock-off'] = async (form) => {
  const currentPin = form.querySelector('[name="currentPin"]').value.trim();
  if (!/^\d{6}$/.test(currentPin)) { setFormError(form, 'กรุณาใส่รหัสเดิม 6 หลัก'); return; }
  const btn = form.querySelector('[type="submit"]');
  try {
    await busy(btn, () => apiPatch('/api/telegram/groups/' + form.dataset.id, { lockOff: true, currentPin }));
    closeAllModals();
    toast('ปิดการล็อกห้องแชทแล้ว');
    tgPanel();
  } catch (err) { setFormError(form, err.message); }
};

// Cancel on the PIN screen: go to a room that is open, if there is one.
ACTIONS['pin-cancel'] = async () => {
  const { items: chats } = await apiGet('/api/telegram/chats');
  const open = chats.find((c) => !c.locked || c.unlocked);
  if (open) renderChat({ group: open.id });
  else setPinError('ไม่มีห้องแชทที่เปิดได้ในตอนนี้');
};

// ---------------------------------------------------------------- clear chat history (SIINA SYSTEM only)
function topicLabelOf(threadKey) {
  const t = (S.chat.topics || []).find((x) => String(x.threadId) === String(threadKey));
  return t ? t.name : 'หัวข้อ #' + threadKey;
}
ACTIONS['chat-clear'] = () => {
  const gid = S.chat.groupId;
  if (!gid) return;
  const current = S.chat.topic !== 'all' && (S.chat.topics || []).length ? S.chat.topic : null;
  const scope = current
    ? `<fieldset class="ch-scope">
        <legend class="muted small">ขอบเขตการลบ</legend>
        <label class="tgg-check"><input type="radio" name="scope" value="topic" checked> เฉพาะหัวข้อ “${esc(topicLabelOf(current))}”</label>
        <label class="tgg-check"><input type="radio" name="scope" value="all"> ทุกหัวข้อของกลุ่มนี้</label>
      </fieldset>`
    : '<p class="muted small">จะลบประวัติทั้งกลุ่มนี้</p>';
  openModal({
    title: 'ลบประวัติห้องแชท?',
    body: `<form data-form="chat-clear" data-group="${esc(gid)}" data-thread="${esc(current || '')}" class="stack">
      <p>คุณต้องการลบประวัติข้อความของห้องนี้ออกจาก SIINA SYSTEM ใช่หรือไม่?</p>
      <p class="muted small">การดำเนินการนี้จะมีผลเฉพาะข้อมูลที่จัดเก็บภายใน SIINA SYSTEM เท่านั้น ข้อความและประวัติการสนทนาใน Telegram จริงจะไม่ถูกลบหรือเปลี่ยนแปลง</p>
      ${scope}
      <p class="small" data-role="form-error"></p>
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn ghost" data-action="close-modal">ยกเลิก</button>
        <button type="submit" class="btn danger-pink">ยืนยันลบประวัติ</button></div>
    </form>`,
  });
};
FORMS['chat-clear'] = async (form) => {
  const gid = form.dataset.group;
  const picked = form.querySelector('[name="scope"]:checked');
  const onlyTopic = !!picked && picked.value === 'topic';
  const threadId = onlyTopic ? Number(form.dataset.thread) : null;
  const btn = form.querySelector('[type="submit"]');
  try {
    await busy(btn, () => apiPost(`/api/telegram/groups/${gid}/clear-history`, { threadId }));
    closeAllModals();
    toast('ลบประวัติแชทใน SIINA SYSTEM เรียบร้อยแล้ว');
    renderChat({ group: gid });
  } catch (err) { setFormError(form, err.message); }
};
