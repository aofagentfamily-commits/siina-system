/* SIINA SYSTEM — chat themes (ธีมห้องแชท). A look for one room inside SIINA SYSTEM only; Telegram is not changed.
   The theme is applied after each chat render and remembered per room on the server. */
'use strict';

const CT_PRESETS = [
  { k: 'couple', label: 'ธีมคู่รัก', grad: 'linear-gradient(160deg,#FFD0E6,#FFE7B3 55%,#FFC9A8)', feat: true },
  { k: 'night', label: 'ธีมกลางคืน', grad: 'linear-gradient(160deg,#3D2A6B,#6A4BA8 60%,#A88AE0)' },
  { k: 'sea', label: 'ธีมทะเล', grad: 'linear-gradient(160deg,#9FE7F2,#FFE6B0 60%,#FFC9A0)' },
  { k: 'sakura', label: 'ธีมซากุระ', grad: 'linear-gradient(160deg,#FFE3F0,#FFC4DD 60%,#FFB3D0)' },
  { k: 'nature', label: 'ธีมธรรมชาติ', grad: 'linear-gradient(160deg,#D8F5CF,#A8E0A0 60%,#8ED08A)' },
  { k: 'galaxy', label: 'ธีมกาแล็กซี', grad: 'linear-gradient(160deg,#1E1B4B,#4C2A7A 55%,#B0307F)' },
];
const CT_DEFAULT_OPTIONS = { primary: true, textStyle: 'dark', mascot: true, animation: true, opacity: 80 };
const CT_CACHE = new Map(); // group id -> { theme, options }
const CT_LIVE = { gid: null, theme: 'couple', options: { ...CT_DEFAULT_OPTIONS }, tab: 'preset' };

async function chatThemeFor(gid) {
  if (CT_CACHE.has(gid)) return CT_CACHE.get(gid);
  try {
    const t = await apiGet(`/api/telegram/groups/${gid}/theme`);
    CT_CACHE.set(gid, { theme: t.theme, options: { ...CT_DEFAULT_OPTIONS, ...t.options } });
  } catch (err) {
    CT_CACHE.set(gid, { theme: 'couple', options: { ...CT_DEFAULT_OPTIONS } });
  }
  return CT_CACHE.get(gid);
}

// Paints the chat area with a theme. Only attributes and CSS variables change; no message is touched.
function paintChatTheme(theme, options) {
  const main = document.querySelector('.cv-main');
  if (!main) return;
  main.dataset.theme = theme;
  main.dataset.text = options.textStyle;
  main.dataset.primary = options.primary ? '1' : '0';
  main.dataset.anim = options.animation ? '1' : '0';
  main.dataset.mascot = options.mascot ? '1' : '0';
  main.style.setProperty('--ct-opacity', String(Math.max(0, Math.min(100, options.opacity)) / 100));
  // older builds pasted a small picture here; remove it if it is still in the page
  main.querySelectorAll('.ct-mascot').forEach((el) => el.remove());
}

async function applyChatTheme() {
  const gid = S.chat && S.chat.groupId;
  const main = document.querySelector('.cv-main');
  if (!main || !gid || S.route !== 'chat') return;
  const t = await chatThemeFor(gid);
  if (S.chat.groupId !== gid) return; // the user moved to another room meanwhile
  paintChatTheme(t.theme, t.options);
}

// Re-apply the theme after every chat render.
const ctFillPage = fillPage;
fillPage = function (html) {
  ctFillPage(html);
  if (S.route === 'chat') applyChatTheme();
};

// ---------------------------------------------------------------- right panel
function ctPresetHtml() {
  return `<div class="ct-cards">${CT_PRESETS.map((p) => `<button type="button" class="ct-card ${CT_LIVE.theme === p.k ? 'is-on' : ''} ${p.feat ? 'is-feat' : ''}" data-action="ct-pick" data-id="${p.k}" aria-pressed="${CT_LIVE.theme === p.k}">
      <span class="ct-thumb" style="background:${p.grad}">${p.k === 'couple' ? '<img src="/assets/theme/couple.png" alt="" width="60" height="70">' : ''}</span>
      <span class="ct-card-name">${esc(p.label)}</span></button>`).join('')}</div>`;
}
function ctDetailHtml() {
  const o = CT_LIVE.options;
  return `<h4 class="ct-h">ปรับแต่งรายละเอียด</h4>
    <div class="ct-row"><span>สีหลัก (บับเบิลข้อความของคุณ)</span><label class="ct-switch"><input type="checkbox" data-ct="primary" ${o.primary ? 'checked' : ''}><span></span></label></div>
    <div class="ct-row"><span>สีข้อความ</span><select class="ct-select" data-ct="textStyle"><option value="dark" ${o.textStyle === 'dark' ? 'selected' : ''}>เข้ม</option><option value="light" ${o.textStyle === 'light' ? 'selected' : ''}>อ่อน</option></select></div>
    <div class="ct-row"><span>พื้นหลัง</span><span class="ct-chip is-on">ใช้ภาพอัตโนมัติ</span></div>
    <div class="ct-row"><span>แสดงมาสคอต / ตกแต่ง</span><label class="ct-switch"><input type="checkbox" data-ct="mascot" ${o.mascot ? 'checked' : ''}><span></span></label></div>
    <div class="ct-row"><span>แอนิเมชันบรรยากาศ (หัวใจลอย / ประกายแสง)</span><label class="ct-switch"><input type="checkbox" data-ct="animation" ${o.animation ? 'checked' : ''}><span></span></label></div>
    <div class="ct-row ct-range"><span>ความโปร่งของพื้นหลัง</span><input type="range" min="0" max="100" value="${o.opacity}" data-ct="opacity"><b>${o.opacity}%</b></div>`;
}
function ctPanelHtml() {
  const tab = (k, l) => `<button type="button" role="tab" class="ct-tab ${CT_LIVE.tab === k ? 'is-on' : ''}" data-action="ct-tab" data-id="${k}" aria-selected="${CT_LIVE.tab === k}">${l}</button>`;
  let body;
  if (CT_LIVE.tab === 'preset') body = `<h4 class="ct-h">ธีมแนะนำ</h4>${ctPresetHtml()}${ctDetailHtml()}`;
  else if (CT_LIVE.tab === 'custom') body = ctDetailHtml();
  else body = `<h4 class="ct-h">ธีมที่บันทึกไว้ของห้องนี้</h4>
    <p class="ct-note">${CT_PRESETS.find((p) => p.k === CT_LIVE.theme)?.label || 'ธีมคู่รัก'} · ${CT_LIVE.options.opacity}%</p>
    <button type="button" class="ct-btn" data-action="ct-reset">รีเซ็ตค่าเริ่มต้น</button>`;
  return `<div class="ct-head"><div><b class="ct-title">ปรับแต่งธีมของห้องแชท</b>
      <small class="ct-sub">ปรับหน้าตาและบรรยากาศของห้องนี้ (มีผลเฉพาะในระบบ SIINA SYSTEM เท่านั้น ไม่มีผลกับ Telegram จริง)</small></div>
      <button type="button" class="ct-close" data-action="ct-close" aria-label="ปิด">${icon('close', 'sm')}</button></div>
    <div class="ct-tabs" role="tablist">${tab('preset', 'ธีมสำเร็จรูป')}${tab('custom', 'ปรับแต่งเอง')}${tab('mine', 'ของฉัน')}</div>
    <div class="ct-body">${body}</div>
    <div class="ct-foot"><button type="button" class="ct-btn ghost" data-action="ct-reset">รีเซ็ตค่าเริ่มต้น</button>
      <button type="button" class="ct-btn primary" data-action="ct-save">${icon('check', 'sm')} บันทึกธีม</button></div>`;
}
function ctRender() {
  const p = document.getElementById('ctPanel');
  if (p) p.innerHTML = ctPanelHtml();
}

ACTIONS['chat-theme-open'] = async () => {
  const gid = S.chat && S.chat.groupId;
  if (!gid) { toast('เลือกห้องแชทก่อนปรับแต่งธีม', 'err'); return; }
  const t = await chatThemeFor(gid);
  CT_LIVE.gid = gid;
  CT_LIVE.theme = t.theme;
  CT_LIVE.options = { ...t.options };
  CT_LIVE.tab = 'preset';
  let panel = document.getElementById('ctPanel');
  if (!panel) {
    panel = document.createElement('aside');
    panel.id = 'ctPanel';
    panel.className = 'ct-panel';
    panel.setAttribute('aria-label', 'ปรับแต่งธีมของห้องแชท');
    document.body.appendChild(panel);
  }
  panel.classList.add('is-open');
  ctRender();
};
ACTIONS['ct-close'] = () => {
  const panel = document.getElementById('ctPanel');
  if (panel) panel.classList.remove('is-open');
  applyChatTheme(); // back to the saved theme: unsaved previews are dropped
};
ACTIONS['ct-tab'] = (el) => { CT_LIVE.tab = el.dataset.id; ctRender(); };
ACTIONS['ct-pick'] = (el) => {
  CT_LIVE.theme = el.dataset.id;
  ctRender();
  paintChatTheme(CT_LIVE.theme, CT_LIVE.options);
};
ACTIONS['ct-reset'] = () => {
  CT_LIVE.theme = 'couple';
  CT_LIVE.options = { ...CT_DEFAULT_OPTIONS };
  ctRender();
  paintChatTheme(CT_LIVE.theme, CT_LIVE.options);
};
document.addEventListener('change', (e) => {
  const key = e.target.dataset && e.target.dataset.ct;
  if (!key) return;
  CT_LIVE.options[key] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
  paintChatTheme(CT_LIVE.theme, CT_LIVE.options);
});
document.addEventListener('input', (e) => {
  if (!e.target.dataset || e.target.dataset.ct !== 'opacity') return;
  CT_LIVE.options.opacity = Number(e.target.value);
  const b = e.target.parentElement.querySelector('b');
  if (b) b.textContent = e.target.value + '%';
  paintChatTheme(CT_LIVE.theme, CT_LIVE.options);
});
ACTIONS['ct-save'] = async (el) => {
  const gid = CT_LIVE.gid;
  try {
    await busy(el, () => apiPut(`/api/telegram/groups/${gid}/theme`, { theme: CT_LIVE.theme, options: CT_LIVE.options }));
    CT_CACHE.set(gid, { theme: CT_LIVE.theme, options: { ...CT_LIVE.options } });
    toast('บันทึกธีมของห้องนี้แล้ว');
    ctRender();
  } catch (err) { toast(err.message, 'err'); }
};
