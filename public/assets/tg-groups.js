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
      <label class="switch" title="เปิด / ปิดการติดตาม"><input type="checkbox" data-change="tg-group-toggle" data-id="${esc(g.id)}" ${g.enabled ? 'checked' : ''}><span></span></label>
    </header>
    <dl class="tgg-meta">
      <dt>บอทที่เชื่อมต่อ</dt><dd>${unlinked ? '<span class="tgg-muted">ยังไม่ได้เชื่อมต่อบอท</span>' : esc(g.botName)}</dd>
      <dt>สถานะ</dt><dd><span class="tgg-pill ${st[1]}">${esc(st[0])}</span></dd>
      <dt>การติดตาม</dt><dd>${g.enabled ? 'เปิดอยู่' : 'ปิดอยู่'}</dd>
      <dt>ตอบรับอัตโนมัติ</dt><dd>${g.autoReply ? 'เปิด' : 'ปิด'}</dd>
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
    body: `<form data-form="tg-group" data-id="${esc(group ? group.id : '')}" data-prev-bot="${esc(group && group.botId ? group.botId : '')}" class="tgg-form">
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
  try {
    let groupId = id;
    if (id) {
      await busy(btn, () => apiPatch('/api/telegram/groups/' + id, {
        title: fd.get('title'),
        enabled: fd.get('enabled') === 'on',
        autoReply: fd.get('autoReply') === 'on',
        botId: nextBot || null,
      }));
    } else {
      const created = await busy(btn, () => apiPost('/api/telegram/groups', {
        botId: fd.get('botId'),
        title: fd.get('title'),
        chatId: fd.get('chatId'),
        enabled: fd.get('enabled') === 'on',
      }));
      groupId = created.id;
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
