/* SIINA SYSTEM — Telegram settings: overview, bots, groups, filters, auto-reply, logs.
   All user text goes through esc(). Deleting a bot only unlinks its groups. */
'use strict';

S.tgSub = 'overview';
S.tgLogQuery = {};

const TG_SUBS = [
  ['overview', 'ภาพรวม', 'grid'],
  ['bots', 'จัดการบอท', 'robot'],
  ['groups', 'จัดการกลุ่ม', 'users'],
  ['filters', 'ตัวกรองข้อความ', 'filter'],
  ['autoreply', 'ตอบรับอัตโนมัติ', 'zap'],
  ['logs', 'บันทึก & ประวัติ', 'clock'],
];
const TG_EVENTS = [
  'เพิ่มบอท', 'แก้ไขบอท', 'เปลี่ยนรูปบอท', 'ลบบอท', 'ทดสอบการเชื่อมต่อ',
  'เพิ่มกลุ่ม', 'แก้ไขกลุ่ม', 'เปลี่ยนรูปกลุ่ม', 'เปลี่ยนบอท', 'ลบกลุ่ม', 'ทดสอบสิทธิ์',
  'ตรวจพบข้อความแท็ก', 'ตอบรับอัตโนมัติ', 'ส่งข้อความ',
];

// ---------------------------------------------------------------- small render helpers
function groupAvatar(c) {
  if (c.avatarData) return `<span class="avatar"><img src="${esc(c.avatarData)}" alt=""></span>`;
  return `<span class="avatar">${esc(initials(c.title))}</span>`;
}
function tgBotAvatarInner(b) {
  return b.avatarData
    ? `<span class="tg-av"><img src="${esc(b.avatarData)}" alt=""></span>`
    : `<span class="tg-av tg-av-default">${eggHtml({ size: 40 })}</span>`;
}
function tgGroupAvatarInner(g) {
  return g.avatarData
    ? `<span class="tg-av"><img src="${esc(g.avatarData)}" alt=""></span>`
    : `<span class="tg-av tg-av-default">${icon('users')}</span>`;
}
const TG_GROUP_STATUS = {
  ready: ['พร้อมใช้งาน', 'ok dot'],
  error: ['มีปัญหา', 'danger dot'],
  unknown: ['ยังไม่ทดสอบ', ''],
  unlinked: ['ยังไม่ได้เชื่อมต่อบอท', 'warn dot'],
};
const TG_BOT_STATUS = {
  connected: ['เชื่อมต่อแล้ว', 'ok dot'],
  error: ['มีข้อผิดพลาด', 'danger dot'],
};
function tgStat(target, ico, label, value, hint) {
  return `<button class="card hoverable card-link stat tg-stat" data-action="tg-sub" data-sub="${target}">
    <span class="ico">${icon(ico)}</span>
    <span class="num">${esc(value)}</span>
    <span class="lbl">${esc(label)}</span>
    <span class="small muted">${esc(hint)}</span>
  </button>`;
}
function tgLogTable(items) {
  if (!items.length) return emptyBox('ไม่พบประวัติตามเงื่อนไข');
  return `<div class="table-wrap"><table class="table">
    <thead><tr><th>เวลา</th><th>บอท</th><th>กลุ่ม</th><th>กิจกรรม</th><th>สถานะ</th><th>รายละเอียด</th></tr></thead>
    <tbody>${items.map((l) => `<tr>
      <td>${esc(fmtDateTime(l.at))}</td>
      <td>${esc(l.bot || '-')}</td>
      <td>${esc(l.group || '-')}</td>
      <td>${esc(l.event)}</td>
      <td><span class="badge ${l.status === 'failed' ? 'danger dot' : 'ok dot'}">${l.status === 'failed' ? 'ล้มเหลว' : 'สำเร็จ'}</span></td>
      <td class="small">${esc(l.detail || '')}</td>
    </tr>`).join('')}</tbody></table></div>`;
}
function tgLogList(items) {
  if (!items.length) return emptyBox('ยังไม่มีประวัติ');
  return `<div class="list">${items.map((l) => `<div class="item" style="cursor:default">
    <span class="sym-bubble">${icon(l.status === 'failed' ? 'alert' : 'check', 'sm')}</span>
    <div class="meta"><b>${esc(l.event)}${l.bot ? ' · ' + esc(l.bot) : ''}${l.group ? ' · ' + esc(l.group) : ''}</b>
      <small>${esc(fmtDateTime(l.at))}${l.detail ? ' · ' + esc(l.detail) : ''}</small></div>
    <span class="badge ${l.status === 'failed' ? 'danger dot' : 'ok dot'}">${l.status === 'failed' ? 'ล้มเหลว' : 'สำเร็จ'}</span>
  </div>`).join('')}</div>`;
}

// ---------------------------------------------------------------- shell
async function settingsTelegram(body) {
  body.innerHTML = `
    <div class="card tg-hero">
      <div>
        <h3>Telegram</h3>
        <p class="muted small">เชื่อมต่อและจัดการ Telegram Bot กลุ่ม ตัวกรองข้อความ และการตอบรับอัตโนมัติ ทุกหมวดแยกกันชัดเจน</p>
      </div>
    </div>
    <nav class="tabs tg-subnav" role="tablist" aria-label="เมนู Telegram">
      ${TG_SUBS.map(([k, l, i]) => `<button class="tab" role="tab" aria-selected="${S.tgSub === k}" data-action="tg-sub" data-sub="${k}">${icon(i, 'sm')} ${esc(l)}</button>`).join('')}
    </nav>
    <div id="tgPanel" class="settings-body"><div class="card"><span class="spinner" aria-label="กำลังโหลด"></span></div></div>`;
  await tgPanel();
}

async function tgPanel() {
  const panel = $('#tgPanel');
  if (!panel) return;
  const fn = { overview: tgOverview, bots: tgBots, groups: tgGroups, filters: tgFilters, autoreply: tgAutoReply, logs: tgLogs }[S.tgSub];
  try {
    await fn(panel);
  } catch (err) {
    panel.innerHTML = `<div class="card"><p style="color:var(--danger)">${esc(err.message)}</p>
      <button class="btn sm" data-action="tg-sub" data-sub="${esc(S.tgSub)}">${icon('refresh', 'sm')} ลองอีกครั้ง</button></div>`;
  }
}

// ---------------------------------------------------------------- overview
async function tgOverview(panel) {
  const [o, { items: bots }, { items: groups }] = await Promise.all([
    apiGet('/api/telegram/overview'), apiGet('/api/telegram/bots'), apiGet('/api/telegram/groups'),
  ]);
  panel.innerHTML = `
    <div class="grid-stats tg-stats">
      ${tgStat('bots', 'robot', 'บอทที่เชื่อมต่อ', `${o.bots.ready}/${o.bots.total}`, `พร้อมใช้งาน ${o.bots.ready} จาก ${o.bots.total} บอท`)}
      ${tgStat('groups', 'users', 'กลุ่มที่ติดตาม', `${o.groups.enabled}/${o.groups.total}`, `เปิดใช้งาน ${o.groups.enabled} จาก ${o.groups.total} กลุ่ม`)}
      ${tgStat('filters', 'filter', 'ตัวกรองข้อความ', `${o.filters.enabled}/${o.filters.total}`, `เปิดใช้งาน ${o.filters.enabled} จากทั้งหมด ${o.filters.total} กฎ`)}
      ${tgStat('autoreply', 'zap', 'ตอบรับอัตโนมัติ', o.autoReply.enabled ? 'เปิด' : 'ปิด', `เปิดในกลุ่ม ${o.autoReply.groupsOn} กลุ่ม`)}
    </div>
    <div class="grid-2">
      <div class="card">
        <div class="head"><h3>บอท</h3><button class="btn sm" data-action="tg-sub" data-sub="bots">จัดการบอท</button></div>
        ${bots.length ? `<div class="list">${bots.slice(0, 4).map((b) => `
          <div class="item" data-action="tg-sub" data-sub="bots">${tgBotAvatarInner(b)}
            <div class="meta"><b class="ellipsis">${esc(b.name)}</b><small>${b.groupCount} กลุ่ม · ${b.mode === 'webhook' ? 'Webhook' : 'Polling'}</small></div>
            <span class="badge ${(TG_BOT_STATUS[b.status] || ['ยังไม่ทราบ', ''])[1]}">${esc((TG_BOT_STATUS[b.status] || ['ยังไม่ทราบ'])[0])}</span>
          </div>`).join('')}</div>` : emptyBox('ยังไม่มีบอท')}
      </div>
      <div class="card">
        <div class="head"><h3>กลุ่ม Telegram</h3><button class="btn sm" data-action="tg-sub" data-sub="groups">จัดการกลุ่ม</button></div>
        ${groups.length ? `<div class="list">${groups.slice(0, 5).map((g) => `
          <div class="item" data-action="tg-sub" data-sub="groups">${tgGroupAvatarInner(g)}
            <div class="meta"><b class="ellipsis">${esc(g.title)}</b><small>${g.botId ? 'บอท ' + esc(g.botName) : 'ยังไม่ได้เชื่อมต่อบอท'}</small></div>
            <span class="badge ${(TG_GROUP_STATUS[g.botId ? g.status : 'unlinked'] || TG_GROUP_STATUS.unknown)[1]}">${g.enabled ? 'ติดตาม' : 'ปิดอยู่'}</span>
          </div>`).join('')}</div>` : emptyBox('ยังไม่มีกลุ่ม')}
      </div>
      <div class="card">
        <div class="head"><h3>ตัวกรองข้อความ</h3><button class="btn sm" data-action="tg-sub" data-sub="filters">จัดการตัวกรอง</button></div>
        <p class="muted small">กฎที่เปิดใช้งานอยู่ ${o.filters.enabled} จากทั้งหมด ${o.filters.total} รายการ</p>
      </div>
      <div class="card">
        <div class="head"><h3>ตอบรับอัตโนมัติ</h3><button class="btn sm" data-action="tg-sub" data-sub="autoreply">ตั้งค่า</button></div>
        <p><span class="badge ${o.autoReply.enabled ? 'ok dot' : ''}">${o.autoReply.enabled ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}</span></p>
        <p class="small muted" style="margin-top:8px">“${esc(o.autoReply.text)}”</p>
      </div>
    </div>
    <div class="card">
      <div class="head"><h3>ประวัติการทำงานล่าสุด</h3><button class="btn sm" data-action="tg-sub" data-sub="logs">ดูประวัติทั้งหมด</button></div>
      ${tgLogList(o.recentLogs)}
    </div>`;
}

// ---------------------------------------------------------------- bots
async function tgBots(panel) {
  const { items: bots } = await apiGet('/api/telegram/bots');
  panel.innerHTML = `
    <div class="row between wrap">
      <div><h3>จัดการบอท</h3><p class="muted small">Bot Token ถูกเข้ารหัสไว้บนเซิร์ฟเวอร์ หน้าเว็บแสดงเฉพาะ 4 ตัวท้าย</p></div>
      <button class="btn primary" data-action="tg-bot-new">${icon('plus')} เพิ่มบอท</button>
    </div>
    ${bots.length ? `<div class="tg-cards">${bots.map(tgBotCard).join('')}</div>` : emptyBox('ยังไม่มีบอท กดเพิ่มบอทเพื่อเริ่มต้น')}`;
}

function tgBotCard(b) {
  const st = TG_BOT_STATUS[b.status] || ['ยังไม่ทราบ', ''];
  return `<article class="card tg-card">
    <div class="tg-card-top">
      <button class="tg-av-btn" data-action="tg-bot-avatar" data-id="${esc(b.id)}" aria-label="ตั้งรูปโปรไฟล์บอท">${tgBotAvatarInner(b)}</button>
      <div class="grow">
        <h3 class="ellipsis">${esc(b.name)}</h3>
        <p class="muted small">${b.username ? '@' + esc(b.username) : 'ไม่ทราบชื่อผู้ใช้'}</p>
      </div>
      <span class="badge ${st[1]}">${esc(st[0])}</span>
    </div>
    <dl class="tg-meta">
      <dt>Bot Token</dt><dd><code>${esc(b.tokenHint)}</code></dd>
      <dt>กลุ่มที่เชื่อมโยง</dt><dd>${b.groupCount} กลุ่ม</dd>
      <dt>วิธีรับข้อความ</dt><dd>${b.mode === 'webhook' ? 'Webhook' : 'Polling'}</dd>
    </dl>
    ${b.lastError ? `<p class="small" style="color:var(--danger)">${esc(b.lastError)}</p>` : ''}
    <div class="row wrap tg-card-actions">
      <button class="btn sm" data-action="tg-bot-test" data-id="${esc(b.id)}">ทดสอบการเชื่อมต่อ</button>
      <button class="btn sm" data-action="tg-bot-edit" data-id="${esc(b.id)}">${icon('edit', 'sm')} แก้ไข</button>
      <button class="btn sm" data-action="tg-bot-avatar" data-id="${esc(b.id)}">${icon('image', 'sm')} รูปโปรไฟล์</button>
      <button class="btn sm danger" data-action="tg-bot-delete" data-id="${esc(b.id)}">${icon('trash2', 'sm')} ลบบอท</button>
    </div>
  </article>`;
}

function botForm(bot) {
  return openModal({
    title: bot ? 'แก้ไขบอท' : 'เพิ่มบอท Telegram',
    body: `<form data-form="tg-bot" data-id="${esc(bot ? bot.id : '')}" class="form-grid">
      <label class="field full"><span>ชื่อบอท (ชื่อที่ใช้ในระบบ)</span><input class="input" name="name" maxlength="60" required value="${esc(bot ? bot.name : '')}"></label>
      <label class="field full"><span>Bot Token ${bot ? '(เว้นว่างหากไม่ต้องการเปลี่ยน)' : ''}</span>
        <input class="input" name="token" type="password" autocomplete="off" spellcheck="false" ${bot ? '' : 'required'} placeholder="123456:ABC-DEF..."></label>
      <label class="field full"><span>วิธีรับข้อความ</span><select class="select" name="mode">
        <option value="polling" ${!bot || bot.mode === 'polling' ? 'selected' : ''}>Polling (ใช้ได้ทันที ไม่ต้องมีโดเมน HTTPS)</option>
        <option value="webhook" ${bot && bot.mode === 'webhook' ? 'selected' : ''}>Webhook (ต้องตั้งค่า PUBLIC_URL แบบ HTTPS)</option>
      </select></label>
      <div class="full small" data-role="form-error"></div>
      <div class="full" style="display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap">
        <button type="button" class="btn ghost" data-action="close-modal">ยกเลิก</button>
        <button type="submit" class="btn primary">บันทึก</button>
      </div>
    </form>`,
  });
}

ACTIONS['tg-sub'] = (el) => {
  S.tgSub = el.dataset.sub;
  const body = $('#settingsBody');
  if (body) settingsTelegram(body);
  else navigate('#/settings?tab=telegram');
};
ACTIONS['tg-bot-new'] = () => botForm(null);
ACTIONS['tg-bot-edit'] = async (el) => {
  const { items } = await apiGet('/api/telegram/bots');
  botForm(items.find((b) => b.id === el.dataset.id));
};
ACTIONS['tg-bot-test'] = async (el) => {
  const r = await busy(el, () => apiPost(`/api/telegram/bots/${el.dataset.id}/test`));
  toast(r.ok ? `เชื่อมต่อบอท @${r.username || ''} สำเร็จ` : 'ทดสอบไม่สำเร็จ: ' + r.message, r.ok ? 'ok' : 'err');
  tgPanel();
};
ACTIONS['tg-bot-delete'] = async (el) => {
  const { items } = await apiGet('/api/telegram/bots');
  const bot = items.find((b) => b.id === el.dataset.id);
  if (!bot) return;
  const n = bot.groupCount;
  const overlay = openModal({
    title: 'ยืนยันการลบบอท',
    body: `<p>คุณกำลังลบบอท “<b>${esc(bot.name)}</b>”</p>
      <p class="muted" style="margin-top:8px">บอทนี้เชื่อมต่อกับ ${n} กลุ่ม</p>
      <p style="margin-top:12px">การลบบอทจะยกเลิกการเชื่อมต่อของ ${n} กลุ่ม แต่<b>ข้อมูลกลุ่ม รูปกลุ่ม การตั้งค่า และประวัติข้อความจะยังถูกเก็บไว้</b> และเลือกบอทใหม่ให้กลุ่มเดิมได้ทันที</p>
      <p class="small" data-role="form-error"></p>`,
    footer: `<button class="btn ghost" data-action="close-modal">ยกเลิก</button>
      <button class="btn danger" id="tgDelBotOk">${icon('trash2')} ยืนยันลบบอท</button>`,
  });
  overlay.querySelector('#tgDelBotOk').addEventListener('click', async (ev) => {
    try {
      const r = await busy(ev.currentTarget, () => apiDelete('/api/telegram/bots/' + bot.id));
      closeAllModals();
      toast(`ลบบอทแล้ว กลุ่ม ${r.unlinkedGroups} กลุ่มยังอยู่ ให้เลือกบอทใหม่ได้`);
      tgPanel();
    } catch (err) {
      const p = overlay.querySelector('[data-role="form-error"]');
      if (p) { p.textContent = err.message; p.style.color = 'var(--danger)'; }
    }
  });
};
FORMS['tg-bot'] = async (form) => {
  const fd = new FormData(form);
  const id = form.dataset.id;
  const body = { name: fd.get('name'), mode: fd.get('mode') };
  if (fd.get('token')) body.token = fd.get('token');
  const btn = form.querySelector('[type="submit"]');
  try {
    await busy(btn, () => (id ? apiPatch('/api/telegram/bots/' + id, body) : apiPost('/api/telegram/bots', body)));
    closeAllModals();
    toast(id ? 'บันทึกบอทแล้ว' : 'เพิ่มบอทแล้ว');
    tgPanel();
  } catch (err) { setFormError(form, err.message); }
};

// ---------------------------------------------------------------- groups
async function tgGroups(panel) {
  const [{ items: groups }, { items: bots }] = await Promise.all([apiGet('/api/telegram/groups'), apiGet('/api/telegram/bots')]);
  panel.innerHTML = `
    <div class="row between wrap">
      <div><h3>จัดการกลุ่ม</h3><p class="muted small">กลุ่มยังอยู่ทุกครั้งที่ลบบอท เปลี่ยนบอทได้โดยไม่ต้องกรอก Chat ID ใหม่</p></div>
      <button class="btn primary" data-action="tg-group-new" ${bots.length ? '' : 'disabled title="เพิ่มบอทก่อน"'}>${icon('plus')} เพิ่มกลุ่ม</button>
    </div>
    ${groups.length ? `<div class="tg-cards">${groups.map(tgGroupCard).join('')}</div>` : emptyBox(bots.length ? 'ยังไม่มีกลุ่ม' : 'ยังไม่มีกลุ่ม · เพิ่มบอทก่อนเพื่อเริ่มเพิ่มกลุ่ม')}`;
}

function tgGroupCard(g) {
  const unlinked = !g.botId;
  const st = TG_GROUP_STATUS[unlinked ? 'unlinked' : g.status] || TG_GROUP_STATUS.unknown;
  return `<article class="card tg-card ${unlinked ? 'is-unlinked' : ''}">
    <div class="tg-card-top">
      <button class="tg-av-btn" data-action="tg-group-avatar" data-id="${esc(g.id)}" aria-label="ตั้งรูปโปรไฟล์กลุ่ม">${tgGroupAvatarInner(g)}</button>
      <div class="grow">
        <h3 class="ellipsis">${esc(g.title)}</h3>
        <p class="muted small">Chat ID ${esc(g.chatId)}</p>
      </div>
      <label class="switch" title="เปิด / ปิดการติดตาม"><input type="checkbox" data-change="tg-group-toggle" data-id="${esc(g.id)}" ${g.enabled ? 'checked' : ''}><span></span></label>
    </div>
    <dl class="tg-meta">
      <dt>บอทที่เชื่อมต่อ</dt><dd>${unlinked ? '<span class="muted">ยังไม่ได้เชื่อมต่อบอท</span>' : esc(g.botName)}</dd>
      <dt>สถานะ</dt><dd><span class="badge ${st[1]}">${esc(st[0])}</span></dd>
      <dt>ติดตาม</dt><dd>${g.enabled ? 'เปิดอยู่' : 'ปิดอยู่'}</dd>
      <dt>ตอบรับอัตโนมัติ</dt><dd>${g.autoReply ? 'เปิด' : 'ปิด'}</dd>
    </dl>
    ${g.lastError ? `<p class="small" style="color:var(--danger)">${esc(g.lastError)}</p>` : ''}
    <div class="row wrap tg-card-actions">
      ${unlinked
        ? `<button class="btn sm primary" data-action="tg-group-edit" data-id="${esc(g.id)}" data-focus="bot">เลือกบอทใหม่</button>`
        : `<button class="btn sm" data-action="tg-group-test" data-id="${esc(g.id)}">ทดสอบสิทธิ์</button>
           <button class="btn sm" data-action="tg-group-edit" data-id="${esc(g.id)}" data-focus="bot">เปลี่ยนบอท</button>`}
      <button class="btn sm" data-action="tg-group-edit" data-id="${esc(g.id)}">${icon('edit', 'sm')} แก้ไข</button>
      <button class="btn sm danger" data-action="tg-group-delete" data-id="${esc(g.id)}">${icon('trash2', 'sm')} ลบกลุ่ม</button>
    </div>
  </article>`;
}

function groupForm(group, bots, focusBot) {
  const isNew = !group;
  return openModal({
    title: isNew ? 'เพิ่มกลุ่ม Telegram' : 'แก้ไขกลุ่ม',
    body: `<form data-form="tg-group" data-id="${esc(group ? group.id : '')}" data-prev-bot="${esc(group && group.botId ? group.botId : '')}" class="form-grid">
      <label class="field full"><span>บอทที่ใช้</span>
        <select class="select" name="botId" ${isNew ? 'required' : ''} ${focusBot ? 'data-focus="1"' : ''}>
          ${isNew ? '' : '<option value="">— ยังไม่เชื่อมต่อบอท —</option>'}
          ${bots.map((b) => `<option value="${esc(b.id)}" ${group && group.botId === b.id ? 'selected' : ''}>${esc(b.name)}${b.username ? ' (@' + esc(b.username) + ')' : ''}</option>`).join('')}
        </select>
        ${isNew ? '' : '<span class="hint">เมื่อเปลี่ยนบอท ระบบจะทดสอบสิทธิ์ของบอทใหม่ให้อัตโนมัติ</span>'}</label>
      <label class="field full"><span>ชื่อกลุ่ม</span><input class="input" name="title" maxlength="120" required value="${esc(group ? group.title : '')}"></label>
      ${isNew
        ? '<label class="field full"><span>Chat ID / Group ID</span><input class="input" name="chatId" required inputmode="numeric" placeholder="-1001234567890"><span class="hint">ดูจากวิธีในหน้าคู่มือ (ส่งข้อความในกลุ่มแล้วดู chat id)</span></label>'
        : `<p class="small muted full">Chat ID: ${esc(group.chatId)} (ไม่เปลี่ยนเมื่อเปลี่ยนบอท)</p>`}
      <label class="check full"><input type="checkbox" name="enabled" ${!group || group.enabled ? 'checked' : ''}> เปิดการติดตามกลุ่มนี้</label>
      ${isNew ? '' : `<label class="check full"><input type="checkbox" name="autoReply" ${group.autoReply ? 'checked' : ''}> ตอบรับอัตโนมัติในกลุ่มนี้</label>`}
      <div class="full small" data-role="form-error"></div>
      <div class="full" style="display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap">
        <button type="button" class="btn ghost" data-action="close-modal">ยกเลิก</button>
        <button type="submit" class="btn primary">บันทึก</button>
      </div>
    </form>`,
    onMount: (modal) => {
      const sel = modal.querySelector('[data-focus="1"]');
      if (sel) setTimeout(() => sel.focus(), 40);
    },
  });
}

ACTIONS['tg-group-new'] = async () => {
  const { items } = await apiGet('/api/telegram/bots');
  if (!items.length) { toast('เพิ่มบอทก่อนจึงจะเพิ่มกลุ่มได้', 'err'); return; }
  groupForm(null, items, false);
};
ACTIONS['tg-group-edit'] = async (el) => {
  const [{ items: groups }, { items: bots }] = await Promise.all([apiGet('/api/telegram/groups'), apiGet('/api/telegram/bots')]);
  const group = groups.find((g) => g.id === el.dataset.id);
  if (group) groupForm(group, bots, el.dataset.focus === 'bot');
};
FORMS['tg-group'] = async (form) => {
  const fd = new FormData(form);
  const id = form.dataset.id;
  const btn = form.querySelector('[type="submit"]');
  try {
    if (id) {
      const prevBot = form.dataset.prevBot || '';
      const nextBot = fd.get('botId') || '';
      await busy(btn, () => apiPatch('/api/telegram/groups/' + id, {
        title: fd.get('title'),
        enabled: fd.get('enabled') === 'on',
        autoReply: fd.get('autoReply') === 'on',
        botId: nextBot || null,
      }));
      closeAllModals();
      if (nextBot && nextBot !== prevBot) {
        toast('เปลี่ยนบอทแล้ว กำลังทดสอบสิทธิ์ของบอทใหม่');
        const t = await apiPost(`/api/telegram/groups/${id}/test`);
        toast(t.ok ? t.message : 'ทดสอบไม่สำเร็จ: ' + t.message, t.ok ? 'ok' : 'err');
      } else {
        toast('บันทึกกลุ่มแล้ว');
      }
    } else {
      await busy(btn, () => apiPost('/api/telegram/groups', {
        botId: fd.get('botId'),
        title: fd.get('title'),
        chatId: fd.get('chatId'),
        enabled: fd.get('enabled') === 'on',
      }));
      closeAllModals();
      toast('เพิ่มกลุ่มแล้ว กดทดสอบสิทธิ์เพื่อยืนยัน');
    }
    tgPanel();
  } catch (err) { setFormError(form, err.message); }
};
ACTIONS['tg-group-test'] = async (el) => {
  const r = await busy(el, () => apiPost(`/api/telegram/groups/${el.dataset.id}/test`));
  toast(r.ok ? r.message : 'ทดสอบไม่สำเร็จ: ' + r.message, r.ok ? 'ok' : 'err');
  tgPanel();
};
ACTIONS['tg-group-delete'] = async (el) => {
  if (!(await confirmBox('ลบกลุ่มนี้ออกจากระบบ? ข้อความและการตั้งค่าของกลุ่มจะถูกลบด้วย (การลบบอทจะไม่ลบกลุ่ม)'))) return;
  await apiDelete('/api/telegram/groups/' + el.dataset.id);
  toast('ลบกลุ่มแล้ว');
  tgPanel();
};
CHANGES['tg-group-toggle'] = async (el) => {
  try {
    await apiPatch('/api/telegram/groups/' + el.dataset.id, { enabled: el.checked });
    toast(el.checked ? 'เปิดการติดตามแล้ว' : 'ปิดการติดตามแล้ว');
  } catch (err) { toast(err.message, 'err'); el.checked = !el.checked; }
};
CHANGES['tg-group-auto'] = async (el) => {
  try {
    await apiPatch('/api/telegram/groups/' + el.dataset.id, { autoReply: el.checked });
    toast(el.checked ? 'เปิดตอบรับอัตโนมัติในกลุ่มนี้แล้ว' : 'ปิดตอบรับอัตโนมัติในกลุ่มนี้แล้ว');
  } catch (err) { toast(err.message, 'err'); el.checked = !el.checked; }
};

// ---------------------------------------------------------------- avatar editor (bot and group pictures)
// Crops a square from the picture. offX/offY (-1..1) move the window across the free space,
// zoom makes the window smaller. The user moves the picture by dragging it.
function cropSquare(img, zoom, offX = 0, offY = 0) {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const side = Math.min(w, h) / zoom;
  const slackX = (w - side) / 2;
  const slackY = (h - side) / 2;
  const sx = slackX + offX * slackX;
  const sy = slackY + offY * slackY;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  canvas.getContext('2d').drawImage(img, sx, sy, side, side, 0, 0, 256, 256);
  return canvas.toDataURL('image/webp', 0.86);
}

function openAvatarEditor({ title, current, fallback, onSave }) {
  let image = null;
  let result; // undefined = unchanged, null = removed, string = new picture
  const preview = (src) => `<span class="av-preview">${src ? `<img src="${esc(src)}" alt="">` : fallback}</span>`;
  const overlay = openModal({
    title,
    body: `<div class="av-editor">
      <div id="avBox" class="av-box">${preview(current)}</div>
      <p class="muted small">รองรับ JPG, PNG, WebP (ไม่เกิน 5 MB) <b>ลากรูปเพื่อปรับตำแหน่ง</b> และใช้แถบซูมเพื่อขยาย</p>
      <div class="row wrap">
        <label class="btn sm primary" style="cursor:pointer">${icon('upload', 'sm')} เปลี่ยนรูป<input type="file" id="avFile" accept="image/jpeg,image/png,image/webp" hidden></label>
        <button class="btn sm danger" type="button" id="avRemove">${icon('trash2', 'sm')} ลบรูป</button>
      </div>
      <label class="field" id="avZoomWrap" hidden><span>ซูมเข้า</span><input class="range" type="range" id="avZoom" min="1" max="3" step="0.05" value="1"></label>
      <p class="small" id="avError" style="color:var(--danger);min-height:1.2em"></p>
    </div>`,
    footer: `<button class="btn ghost" data-action="close-modal">ยกเลิก</button>
      <button class="btn primary" id="avSave" disabled>${icon('check')} บันทึกรูป</button>`,
  });
  const box = overlay.querySelector('#avBox');
  const save = overlay.querySelector('#avSave');
  const error = overlay.querySelector('#avError');
  const zoomWrap = overlay.querySelector('#avZoomWrap');
  const zoomInput = overlay.querySelector('#avZoom');
  let offX = 0;
  let offY = 0;
  const render = () => {
    if (!image) return;
    result = cropSquare(image, Number(zoomInput.value), offX, offY);
    box.innerHTML = preview(result);
    save.disabled = false;
  };
  overlay.querySelector('#avFile').addEventListener('change', (ev) => {
    const file = ev.target.files && ev.target.files[0];
    error.textContent = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { error.textContent = 'ไฟล์ใหญ่เกิน 5 MB'; return; }
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { error.textContent = 'รองรับเฉพาะ JPG, PNG หรือ WebP'; return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        image = img;
        offX = 0;
        offY = 0;
        zoomInput.value = 1;
        zoomWrap.hidden = false;
        render();
      };
      img.onerror = () => { error.textContent = 'เปิดรูปนี้ไม่ได้'; };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
  zoomInput.addEventListener('input', render);
  // Drag the picture to choose what stays inside the square.
  let drag = null;
  let frame = 0;
  const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(render); };
  box.addEventListener('pointerdown', (ev) => {
    if (!image) return;
    drag = { x: ev.clientX, y: ev.clientY, ox: offX, oy: offY };
    box.setPointerCapture(ev.pointerId);
    box.classList.add('is-dragging');
  });
  box.addEventListener('pointermove', (ev) => {
    if (!drag) return;
    offX = Math.max(-1, Math.min(1, drag.ox - (ev.clientX - drag.x) / 90));
    offY = Math.max(-1, Math.min(1, drag.oy - (ev.clientY - drag.y) / 90));
    schedule();
  });
  const endDrag = () => { drag = null; box.classList.remove('is-dragging'); };
  box.addEventListener('pointerup', endDrag);
  box.addEventListener('pointercancel', endDrag);
  overlay.querySelector('#avRemove').addEventListener('click', () => {
    image = null;
    result = null;
    zoomWrap.hidden = true;
    box.innerHTML = preview(null);
    save.disabled = false;
  });
  save.addEventListener('click', async () => {
    if (result === undefined) return;
    try {
      await busy(save, () => onSave(result));
      closeModal(overlay);
      toast(result === null ? 'ลบรูปแล้ว' : 'บันทึกรูปแล้ว');
      tgPanel();
    } catch (err) {
      error.textContent = err.message;
    }
  });
}

ACTIONS['tg-bot-avatar'] = async (el) => {
  const { items } = await apiGet('/api/telegram/bots');
  const bot = items.find((b) => b.id === el.dataset.id);
  if (!bot) return;
  openAvatarEditor({
    title: 'รูปโปรไฟล์บอท',
    current: bot.avatarData,
    fallback: eggHtml({ size: 110 }),
    onSave: (data) => apiPatch('/api/telegram/bots/' + bot.id, { avatarData: data }),
  });
};
ACTIONS['tg-group-avatar'] = async (el) => {
  const { items } = await apiGet('/api/telegram/groups');
  const group = items.find((g) => g.id === el.dataset.id);
  if (!group) return;
  openAvatarEditor({
    title: 'รูปโปรไฟล์กลุ่ม',
    current: group.avatarData,
    fallback: icon('users', 'lg'),
    onSave: (data) => apiPatch('/api/telegram/groups/' + group.id, { avatarData: data }),
  });
};

// ---------------------------------------------------------------- filters
async function tgFilters(panel) {
  const [{ items: filters }, { settings }] = await Promise.all([apiGet('/api/telegram/filters'), apiGet('/api/settings')]);
  const byType = (t) => filters.filter((f) => f.type === t);
  panel.innerHTML = `
    <div><h3>ตัวกรองข้อความ</h3><p class="muted small">ข้อความที่ตรงเงื่อนไขจะขึ้นในสรุปสำคัญและแจ้งเตือน แต่ละหมวดแยกกันชัดเจน</p></div>
    <div class="grid-2">
      ${tgFilterCard('mention', 'at', 'ข้อความที่แท็กฉัน (Username)', 'เช่น myusername (ไม่ต้องมี @)', byType('mention'), false)}
      ${tgFilterCard('keyword', 'search', 'คำค้นหาสำคัญ (Keyword)', 'เช่น ด่วน, ตรวจสอบ, ส่งงาน', byType('keyword'), true)}
      ${tgFilterCard('sender', 'user', 'ผู้ส่งที่ติดตาม (User ID)', 'ตัวเลข Telegram User ID', byType('sender'), false)}
      <div class="card">
        <div class="head"><h3>ตัวกรองเพิ่มเติม</h3></div>
        <div class="setting-row"><div class="lbl"><b>ข้อความที่ตอบกลับข้อความของฉัน</b><small>ต้องกรอก Telegram User ID ของคุณในหน้า ตั้งค่า > โปรไฟล์</small></div>
          <label class="switch"><input type="checkbox" data-change="tg-setting" data-key="filterReplyToMe" ${settings.filterReplyToMe ? 'checked' : ''}><span></span></label></div>
        <div class="setting-row"><div class="lbl"><b>ข้อความที่มีไฟล์แนบ</b><small>รูป วิดีโอ เสียง หรือไฟล์</small></div>
          <label class="switch"><input type="checkbox" data-change="tg-setting" data-key="filterAttachments" ${settings.filterAttachments ? 'checked' : ''}><span></span></label></div>
        <div class="setting-row"><div class="lbl"><b>ข้อความจากกลุ่มที่กำหนด</b><small>เปิดหรือปิดการติดตามทีละกลุ่มได้ที่หมวด จัดการกลุ่ม</small></div>
          <span class="badge ok dot">ใช้งานได้</span></div>
        <div class="setting-row"><div class="lbl"><b>ข้อความที่ยังไม่ได้อ่านภายในระบบ</b><small>ยังไม่พร้อมใช้งาน จะเปิดให้ใช้ในรอบถัดไป</small></div>
          <span class="badge">ยังไม่พร้อมใช้งาน</span></div>
      </div>
    </div>`;
}

function tgFilterCard(type, ico, title, placeholder, list, asTags) {
  const body = asTags
    ? (list.length
      ? `<div class="tg-tags">${list.map((f) => `<span class="tg-tag ${f.enabled ? 'on' : ''}">
          <button type="button" class="tg-tag-main" data-action="tg-filter-flip" data-id="${esc(f.id)}" data-enabled="${f.enabled}" aria-pressed="${f.enabled}">${esc(f.value)}</button>
          <button type="button" class="tg-tag-x" data-action="tg-filter-delete" data-id="${esc(f.id)}" aria-label="ลบ ${esc(f.value)}">${icon('close', 'sm')}</button>
        </span>`).join('')}</div>`
      : '<p class="muted small">ยังไม่มีคำค้นหา</p>')
    : (list.length
      ? `<div class="list">${list.map((f) => `<div class="item" style="cursor:default">
          <div class="meta"><b class="ellipsis">${type === 'mention' ? '@' : ''}${esc(f.value)}</b><small>${f.enabled ? 'เปิดใช้งาน' : 'ปิดอยู่'}</small></div>
          <label class="switch" title="เปิด / ปิด"><input type="checkbox" data-change="tg-filter-toggle" data-id="${esc(f.id)}" ${f.enabled ? 'checked' : ''}><span></span></label>
          <button class="btn sm ghost" data-action="tg-filter-delete" data-id="${esc(f.id)}" aria-label="ลบ">${icon('trash2', 'sm')}</button>
        </div>`).join('')}</div>`
      : '<p class="muted small">ยังไม่มีรายการ</p>');
  return `<section class="card tg-filter-card">
    <div class="head"><h3>${icon(ico, 'sm')} ${esc(title)}</h3><span class="badge">${list.length} รายการ</span></div>
    <form data-form="tg-filter-add" data-type="${type}" class="row" style="margin-bottom:12px">
      <input class="input grow" name="value" placeholder="${esc(placeholder)}" maxlength="100" aria-label="${esc(title)}">
      <button class="btn primary sm" type="submit">${icon('plus', 'sm')} เพิ่ม</button>
    </form>
    ${body}
  </section>`;
}

FORMS['tg-filter-add'] = async (form) => {
  const value = form.querySelector('[name="value"]').value.trim();
  if (!value) return;
  try {
    await apiPost('/api/telegram/filters', { type: form.dataset.type, value });
    toast('เพิ่มตัวกรองแล้ว');
    tgPanel();
  } catch (err) { toast(err.message, 'err'); }
};
CHANGES['tg-filter-toggle'] = async (el) => {
  await apiPatch('/api/telegram/filters/' + el.dataset.id, { enabled: el.checked });
  toast('บันทึกแล้ว');
  tgPanel();
};
ACTIONS['tg-filter-flip'] = async (el) => {
  await apiPatch('/api/telegram/filters/' + el.dataset.id, { enabled: el.dataset.enabled !== 'true' });
  tgPanel();
};
ACTIONS['tg-filter-delete'] = async (el) => {
  await apiDelete('/api/telegram/filters/' + el.dataset.id);
  toast('ลบตัวกรองแล้ว');
  tgPanel();
};
CHANGES['tg-setting'] = async (el) => {
  try {
    await apiPut('/api/settings', { [el.dataset.key]: el.checked });
    toast('บันทึกแล้ว');
  } catch (err) { toast(err.message, 'err'); el.checked = !el.checked; }
};

// ---------------------------------------------------------------- auto-reply
async function tgAutoReply(panel) {
  const [{ settings }, { items: groups }] = await Promise.all([apiGet('/api/settings'), apiGet('/api/telegram/groups')]);
  const ar = settings.autoReply;
  panel.innerHTML = `
    <div class="card">
      <div class="row between wrap">
        <div><h3>ตอบรับอัตโนมัติ</h3>
          <p class="muted small">เมื่อมีข้อความแท็ก Username ของคุณในกลุ่มที่เปิดใช้งาน บอทจะตอบกลับข้อความนั้นทันที และบันทึกเข้าระบบในหมวดข้อความที่แท็กฉัน</p></div>
        <span class="badge ${ar.enabled ? 'ok dot' : ''}">${ar.enabled ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}</span>
      </div>
      <form data-form="tg-autoreply" class="stack" style="margin-top:14px">
        <label class="check"><input type="checkbox" name="enabled" ${ar.enabled ? 'checked' : ''}> เปิดใช้งานการตอบรับอัตโนมัติ</label>
        <label class="field"><span>ข้อความตอบรับ (แก้ไขได้)</span>
          <textarea class="textarea" name="text" maxlength="300" rows="2" required>${esc(ar.text)}</textarea></label>
        <p class="small" data-role="form-error"></p>
        <div class="row" style="justify-content:flex-end"><button class="btn primary" type="submit">บันทึกการตั้งค่า</button></div>
      </form>
    </div>
    <div class="grid-2">
      <div class="card">
        <div class="head"><h3>เลือกกลุ่มที่เปิดตอบรับ</h3><span class="badge">${groups.filter((g) => g.autoReply).length} กลุ่ม</span></div>
        ${groups.length ? `<div class="list">${groups.map((g) => `<div class="item" style="cursor:default">
            ${tgGroupAvatarInner(g)}
            <div class="meta"><b class="ellipsis">${esc(g.title)}</b><small>${g.botId ? 'บอท ' + esc(g.botName) : 'ยังไม่ได้เชื่อมต่อบอท (ตอบไม่ได้)'}</small></div>
            <label class="switch" title="เปิด / ปิดในกลุ่มนี้"><input type="checkbox" data-change="tg-group-auto" data-id="${esc(g.id)}" ${g.autoReply ? 'checked' : ''}><span></span></label>
          </div>`).join('')}</div>` : emptyBox('ยังไม่มีกลุ่ม')}
      </div>
      <div class="card">
        <div class="head"><h3>ทดสอบการตอบรับ</h3></div>
        ${groups.length ? `<div class="row wrap">
            <select class="select grow" id="arTestGroup" aria-label="เลือกกลุ่มที่จะทดสอบ">
              ${groups.map((g) => `<option value="${esc(g.id)}">${esc(g.title)}</option>`).join('')}
            </select>
            <button class="btn primary" data-action="tg-ar-test">ทดสอบการตอบรับ</button>
          </div>` : '<p class="muted small">ยังไม่มีกลุ่มให้ทดสอบ</p>'}
        <div id="arTestResult" class="stack" style="margin-top:12px">
          <p class="muted small">ตรวจการตั้งค่าและผลล่าสุดจากข้อมูลจริงของกลุ่มที่เลือก การตอบจริงเกิดขึ้นเมื่อมีคนแท็ก Username ของคุณในกลุ่มนั้น</p>
        </div>
      </div>
    </div>`;
}

FORMS['tg-autoreply'] = async (form) => {
  const enabled = form.querySelector('[name="enabled"]').checked;
  const text = form.querySelector('[name="text"]').value.trim();
  const btn = form.querySelector('[type="submit"]');
  if (!text) { setFormError(form, 'กรุณากรอกข้อความตอบรับ'); return; }
  try {
    await busy(btn, () => apiPut('/api/settings', { autoReply: { enabled, text } }));
    toast('บันทึกการตอบรับอัตโนมัติแล้ว');
    tgPanel();
  } catch (err) { setFormError(form, err.message); }
};
ACTIONS['tg-ar-test'] = async (el) => {
  const select = $('#arTestGroup');
  const box = $('#arTestResult');
  if (!select || !box) return;
  const r = await busy(el, () => apiPost('/api/telegram/autoreply/check', { groupId: select.value }));
  const mark = (ok) => `<span class="badge ${ok ? 'ok dot' : 'danger dot'}">${ok ? 'ผ่าน' : 'ยังไม่ผ่าน'}</span>`;
  box.innerHTML = `
    <div class="list">${r.checks.map((c) => `<div class="item" style="cursor:default"><div class="meta"><b>${esc(c.label)}</b></div>${mark(c.ok)}</div>`).join('')}</div>
    <p class="small">${r.ready ? 'พร้อมตอบรับอัตโนมัติ' : 'ยังตอบรับอัตโนมัติไม่ได้ แก้รายการที่ยังไม่ผ่านก่อน'}</p>
    <div class="list">
      <div class="item" style="cursor:default"><div class="meta"><b>ตรวจพบข้อความแท็กล่าสุด</b>
        <small>${r.lastMention ? `${esc(fmtDateTime(r.lastMention.sentAt))} · ${esc(r.lastMention.senderName)}: ${esc(r.lastMention.text)}` : 'ยังไม่มีข้อความแท็กในกลุ่มนี้'}</small></div>
        ${mark(!!r.lastMention)}</div>
      <div class="item" style="cursor:default"><div class="meta"><b>บอทตอบกลับล่าสุด</b>
        <small>${r.lastReply ? `${esc(fmtDateTime(r.lastReply.at))}${r.lastReply.error ? ' · ' + esc(r.lastReply.error) : ''}` : 'ยังไม่มีการตอบกลับอัตโนมัติ'}</small></div>
        ${mark(!!r.lastReply && r.lastReply.status === 'sent')}</div>
      <div class="item" style="cursor:default"><div class="meta"><b>บันทึกเข้าระบบแล้ว</b>
        <small>${r.lastMention ? 'ข้อความแท็กล่าสุดถูกบันทึกในหมวดข้อความที่แท็กฉัน' : 'รอข้อความแท็กรายการแรก'}</small></div>
        ${mark(!!r.lastMention)}</div>
    </div>`;
};

// ---------------------------------------------------------------- logs
async function tgLogs(panel) {
  const q = S.tgLogQuery;
  const params = new URLSearchParams(Object.entries(q).filter(([, v]) => v));
  const [{ items: logs }, { items: bots }, { items: groups }] = await Promise.all([
    apiGet('/api/telegram/logs?' + params.toString()), apiGet('/api/telegram/bots'), apiGet('/api/telegram/groups'),
  ]);
  const opt = (value, label, current) => `<option value="${esc(value)}" ${current === value ? 'selected' : ''}>${esc(label)}</option>`;
  panel.innerHTML = `
    <div><h3>บันทึก & ประวัติ</h3><p class="muted small">ประวัติการเพิ่ม แก้ไข การทดสอบ การตอบรับอัตโนมัติ และข้อผิดพลาดของ Telegram</p></div>
    <div class="card">
      <form data-form="tg-logs" class="tg-log-filters">
        <label class="field"><span>วันที่เริ่ม</span><input class="input" type="date" name="from" value="${esc(q.from || '')}"></label>
        <label class="field"><span>วันที่สิ้นสุด</span><input class="input" type="date" name="to" value="${esc(q.to || '')}"></label>
        <label class="field"><span>ประเภทกิจกรรม</span><select class="select" name="event">
          ${opt('', 'ทั้งหมด', q.event || '')}${TG_EVENTS.map((e) => opt(e, e, q.event || '')).join('')}</select></label>
        <label class="field"><span>ชื่อบอท</span><select class="select" name="bot">
          ${opt('', 'ทั้งหมด', q.bot || '')}${[...new Set(bots.map((b) => b.name))].map((n) => opt(n, n, q.bot || '')).join('')}</select></label>
        <label class="field"><span>ชื่อกลุ่ม</span><select class="select" name="group">
          ${opt('', 'ทั้งหมด', q.group || '')}${[...new Set(groups.map((g) => g.title))].map((n) => opt(n, n, q.group || '')).join('')}</select></label>
        <label class="field"><span>สถานะ</span><select class="select" name="status">
          ${opt('', 'ทั้งหมด', q.status || '')}${opt('success', 'สำเร็จ', q.status || '')}${opt('failed', 'ล้มเหลว', q.status || '')}</select></label>
        <label class="field tg-log-search"><span>ค้นหา</span><input class="input" name="q" maxlength="80" placeholder="ค้นหาจากรายละเอียด..." value="${esc(q.q || '')}"></label>
        <div class="row tg-log-buttons">
          <button class="btn primary" type="submit">${icon('search', 'sm')} ค้นหา</button>
          <button class="btn ghost" type="button" data-action="tg-logs-reset">ล้างตัวกรอง</button>
        </div>
      </form>
    </div>
    <div class="card">${tgLogTable(logs)}</div>`;
}

FORMS['tg-logs'] = async (form) => {
  const fd = new FormData(form);
  S.tgLogQuery = Object.fromEntries(['from', 'to', 'event', 'bot', 'group', 'status', 'q'].map((k) => [k, String(fd.get(k) || '').trim()]));
  tgPanel();
};
ACTIONS['tg-logs-reset'] = () => { S.tgLogQuery = {}; tgPanel(); };
