/* SIINA SYSTEM — ข้อมูลการเข้าสู่ระบบ (credentials vault). Passwords are fetched only when the user asks,
   are never shown in lists, and are cleared from the screen after a short time. */
'use strict';

const VAULT = { cat: 'all', q: '', sel: null, items: [], categories: [], colors: [], revealTimer: 0 };
const VAULT_PILL_COLORS = ['#FFD1E5', '#E4D4FF', '#C5EBD3', '#FFF0AD', '#B5E6FF', '#FFD5B5'];

async function vaultLoad() {
  const r = await apiGet('/api/vault');
  VAULT.items = r.items;
  VAULT.categories = r.categories;
  VAULT.colors = r.colors || [];
}
function vaultCatName(id) {
  const c = VAULT.categories.find((x) => x.id === id);
  return c ? c.name : 'ไม่มีหมวด';
}
function vaultCatColor(id) {
  const c = VAULT.categories.find((x) => x.id === id);
  return c ? c.color : '#F1E8F8';
}
function vaultLetter(title) {
  return esc((title || '?').trim().charAt(0).toUpperCase());
}
function vaultFiltered() {
  const q = VAULT.q.trim().toLowerCase();
  return VAULT.items.filter((i) => (VAULT.cat === 'all' || i.categoryId === VAULT.cat)
    && (!q || (i.title + ' ' + vaultCatName(i.categoryId)).toLowerCase().includes(q)));
}
// The picture of an entry (or its first letter). The detail picture opens the picture editor.
function vaultAvatarHtml(it, big) {
  const cls = big ? 'vault-avatar big' : 'vault-avatar';
  const inner = it.avatarData ? `<img src="${esc(it.avatarData)}" alt="">` : vaultLetter(it.title);
  if (!big) return `<span class="${cls}">${inner}</span>`;
  return `<button type="button" class="${cls} vault-avatar-btn" data-action="vault-avatar" data-id="${esc(it.id)}" aria-label="เปลี่ยนรูปโปรไฟล์" title="กดเพื่อเปลี่ยนรูป">${inner}</button>`;
}
function vaultDate(iso) {
  return iso ? fmtDateTime(iso) : '';
}

function vaultPillsHtml() {
  const pills = [`<button class="vault-pill ${VAULT.cat === 'all' ? 'is-on' : ''}" data-action="vault-filter" data-id="all">${icon('lock', 'sm')} ทั้งหมด <span>${VAULT.items.length}</span></button>`];
  VAULT.categories.forEach((c) => {
    const n = VAULT.items.filter((i) => i.categoryId === c.id).length;
    pills.push(`<button class="vault-pill ${VAULT.cat === c.id ? 'is-on' : ''}" style="--pill:${esc(c.color)}" data-action="vault-filter" data-id="${esc(c.id)}">${icon('briefcase', 'sm')} ${esc(c.name)} <span>${n}</span></button>`);
  });
  pills.push('<button class="vault-pill vault-pill-add" data-action="vault-cat-new">+ เพิ่มหมวด</button>');
  return pills.join('');
}

function vaultCatsPanelHtml() {
  const rows = VAULT.categories.map((c) => {
    const n = VAULT.items.filter((i) => i.categoryId === c.id).length;
    return `<button class="vault-cat-row ${VAULT.cat === c.id ? 'is-on' : ''}" data-action="vault-filter" data-id="${esc(c.id)}">
      <span class="vault-dot" style="background:${esc(c.color)}"></span><span class="ellipsis">${esc(c.name)}</span><span class="vault-count">${n}</span></button>`;
  }).join('');
  return `<div class="vault-panel-head"><b>หมวดของฉัน</b>
      <button class="vault-icon-btn" data-action="vault-cats" aria-label="จัดการหมวด" title="จัดการหมวด">${icon('edit', 'sm')}</button></div>
    <button class="vault-cat-row ${VAULT.cat === 'all' ? 'is-on' : ''}" data-action="vault-filter" data-id="all"><span class="vault-dot" style="background:#FF69AC"></span><span>ทั้งหมด</span><span class="vault-count">${VAULT.items.length}</span></button>
    ${rows || '<p class="vault-muted small">ยังไม่มีหมวด กดแก้ไขเพื่อเพิ่มหมวด</p>'}
    <button class="vault-manage" data-action="vault-cats">${icon('settings', 'sm')} จัดการหมวด</button>`;
}

function vaultTableHtml() {
  const rows = vaultFiltered();
  const body = rows.length ? rows.map((i) => vaultRowHtml(i)).join('')
    : `<tr><td colspan="4" class="vault-empty">${VAULT.items.length ? 'ไม่พบรายการที่ตรงกับการค้นหา' : 'ยังไม่มีข้อมูล กดเพิ่มข้อมูลเพื่อเริ่มต้น'}</td></tr>`;
  return `<div class="vault-table-head">
      <b>รายการข้อมูลการเข้าสู่ระบบ <span class="vault-muted">(${VAULT.items.length} รายการ)</span></b>
      <div class="vault-tools">
        <label class="vault-search">${icon('search', 'sm')}<span class="sr-only">ค้นหา</span>
          <input type="search" placeholder="ค้นหาชื่อรายการ หรือหมวดหมู่..." data-input="vault-search" value="${esc(VAULT.q)}"></label>
        <button class="vault-add" data-action="vault-new">${icon('plus', 'sm')} เพิ่มข้อมูล</button>
      </div>
    </div>
    <div class="vault-table-wrap"><table class="vault-table">
      <thead><tr><th>ชื่อรายการ</th><th>หมวด</th><th>เปิดลิงก์</th><th><span class="sr-only">จัดการ</span></th></tr></thead>
      <tbody id="vaultRows">${body}</tbody>
    </table></div>`;
}

function vaultDetailHtml() {
  const it = VAULT.items.find((i) => i.id === VAULT.sel);
  if (!it) return `<div class="vault-detail-empty">${icon('lock')}<b>เลือกรายการเพื่อดูรายละเอียด</b><small class="vault-muted">รหัสผ่านจะไม่แสดงจนกว่าคุณจะกดดู</small></div>`;
  return `<div class="vault-detail-head">
      ${vaultAvatarHtml(it, true)}
      <div class="grow"><h3>${esc(it.title)}</h3><span class="vault-cat-pill" style="background:${esc(vaultCatColor(it.categoryId))}">${esc(vaultCatName(it.categoryId))}</span></div>
      <div class="vault-detail-tools">
        <button class="vault-icon-btn ${it.starred ? 'is-on' : ''}" data-action="vault-star" data-id="${esc(it.id)}" aria-label="รายการโปรด">${icon('star', 'sm')}</button>
        <button class="vault-icon-btn" data-action="vault-edit" data-id="${esc(it.id)}" aria-label="แก้ไข">${icon('edit', 'sm')}</button>
        <button class="vault-icon-btn danger" data-action="vault-delete" data-id="${esc(it.id)}" aria-label="ลบ">${icon('trash2', 'sm')}</button>
      </div>
    </div>
    <div class="vault-field"><span class="vault-field-ic">${icon('user', 'sm')}</span>
      <div><small>อีเมล / ชื่อผู้ใช้</small><b class="ellipsis">${esc(it.login || '—')}</b></div>
      ${it.login ? `<button class="vault-icon-btn" data-action="vault-copy-login" data-id="${esc(it.id)}" aria-label="คัดลอกอีเมล">${icon('copy', 'sm')}</button>` : ''}</div>
    <div class="vault-field"><span class="vault-field-ic">${icon('lock', 'sm')}</span>
      <div><small>รหัสผ่าน</small><b id="vaultPw" class="ellipsis">${it.hasPassword ? '••••••••••••' : 'ยังไม่ได้ตั้งรหัสผ่าน'}</b></div>
      ${it.hasPassword ? `<button class="vault-icon-btn" data-action="vault-reveal" data-id="${esc(it.id)}" aria-label="แสดงรหัสผ่าน">${icon('eye', 'sm')}</button>
      <button class="vault-icon-btn" data-action="vault-copy-pw" data-id="${esc(it.id)}" aria-label="คัดลอกรหัสผ่าน">${icon('copy', 'sm')}</button>` : ''}</div>
    <div class="vault-field"><span class="vault-field-ic">${icon('external', 'sm')}</span>
      <div><small>ลิงก์เข้าสู่ระบบ</small>${it.url ? `<a class="ellipsis" href="${esc(it.url)}" target="_blank" rel="noopener noreferrer">${esc(it.url)}</a>` : '<b>—</b>'}</div></div>
    <div class="vault-field"><span class="vault-field-ic">${icon('note', 'sm')}</span>
      <div><small>หมายเหตุ</small><b class="vault-note">${esc(it.note || '—')}</b></div></div>
    <p class="vault-muted small">อัปเดตล่าสุด ${esc(vaultDate(it.updatedAt))}</p>`;
}

function vaultPanelsHtml() {
  return `<div class="credentials-vault-theme vault" id="vaultRoot">
    <div class="vault-head">
      <span class="vault-title-ic">${icon('lock')}</span>
      <div><h2>ข้อมูลการเข้าสู่ระบบ</h2><p>จัดเก็บอีเมล รหัสผ่าน และข้อมูลสำคัญสำหรับการเข้าสู่ระบบอย่างปลอดภัย</p></div>
    </div>
    <nav class="vault-pills" aria-label="หมวดข้อมูล">${vaultPillsHtml()}</nav>
    <div class="vault-grid">
      <aside class="vault-panel vault-cats" id="vaultCats">${vaultCatsPanelHtml()}</aside>
      <section class="vault-panel vault-table-panel" id="vaultTable">${vaultTableHtml()}</section>
      <aside class="vault-panel vault-detail" id="vaultDetail">${vaultDetailHtml()}</aside>
    </div>
  </div>`;
}

function vaultRefreshAll() {
  const root = document.getElementById('vaultRoot');
  if (!root) return;
  root.querySelector('.vault-pills').innerHTML = vaultPillsHtml();
  document.getElementById('vaultCats').innerHTML = vaultCatsPanelHtml();
  document.getElementById('vaultTable').innerHTML = vaultTableHtml();
  document.getElementById('vaultDetail').innerHTML = vaultDetailHtml();
}
function vaultRefreshTable() {
  const t = document.getElementById('vaultRows');
  if (t) t.innerHTML = vaultFiltered().length ? vaultFiltered().map((i) => vaultRowHtml(i)).join('') : `<tr><td colspan="5" class="vault-empty">ไม่พบรายการที่ตรงกับการค้นหา</td></tr>`;
}
// Only http and https links are opened; an entry without a link gets a disabled button.
function vaultLinkHtml(i) {
  if (i.url && /^https?:\/\//i.test(i.url)) {
    return `<a class="vault-open" href="${esc(i.url)}" target="_blank" rel="noopener noreferrer" aria-label="เปิด ${esc(i.title)}">${icon('external', 'sm')} เปิด</a>`;
  }
  return `<span class="vault-open is-off" aria-disabled="true" title="รายการนี้ยังไม่ได้เพิ่มลิงก์">${icon('external', 'sm')} เปิด</span>`;
}
function vaultRowHtml(i) {
  return `<tr class="vault-row ${VAULT.sel === i.id ? 'is-sel' : ''}" data-action="vault-select" data-id="${esc(i.id)}" tabindex="0">
    <td class="vault-name">${vaultAvatarHtml(i, false)}<span><b class="ellipsis">${esc(i.title)}</b></span></td>
    <td><span class="vault-cat-pill" style="background:${esc(vaultCatColor(i.categoryId))}">${esc(vaultCatName(i.categoryId))}</span></td>
    <td>${vaultLinkHtml(i)}</td>
    <td class="vault-more-cell"><button type="button" class="vault-more" data-action="vault-more" data-id="${esc(i.id)}" aria-haspopup="menu" aria-label="เมนูจัดการ ${esc(i.title)}">⋮</button></td>
  </tr>`;
}

// ⋮ menu: edit, copy (login, password), delete. Opened in place; closes on any other click.
let vaultMenuEl = null;
function closeVaultMenu() {
  if (vaultMenuEl) { vaultMenuEl.remove(); vaultMenuEl = null; }
}
ACTIONS['vault-more'] = (el) => {
  closeVaultMenu();
  const id = el.dataset.id;
  const r = el.getBoundingClientRect();
  const m = document.createElement('div');
  m.className = 'vault-menu';
  m.setAttribute('role', 'menu');
  m.innerHTML = `
    <button type="button" role="menuitem" data-action="vault-edit" data-id="${esc(id)}">${icon('edit', 'sm')} แก้ไข</button>
    <button type="button" role="menuitem" data-action="vault-copy-login" data-id="${esc(id)}">${icon('copy', 'sm')} คัดลอกอีเมล</button>
    <button type="button" role="menuitem" data-action="vault-copy-pw" data-id="${esc(id)}">${icon('copy', 'sm')} คัดลอกรหัสผ่าน</button>
    <button type="button" role="menuitem" class="danger" data-action="vault-delete" data-id="${esc(id)}">${icon('trash2', 'sm')} ลบ</button>`;
  m.style.top = Math.min(r.bottom + 6, window.innerHeight - 200) + 'px';
  m.style.left = Math.max(8, Math.min(r.right - 200, window.innerWidth - 210)) + 'px';
  document.body.appendChild(m);
  vaultMenuEl = m;
};
document.addEventListener('click', (e) => {
  if (!vaultMenuEl) return;
  if (e.target.closest && e.target.closest('[data-action="vault-more"]')) return;
  closeVaultMenu();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeVaultMenu(); });

async function renderVault() {
  setPageHead('ข้อมูลการเข้าสู่ระบบ', 'จัดเก็บอีเมล รหัสผ่าน และข้อมูลสำคัญสำหรับการเข้าสู่ระบบอย่างปลอดภัย');
  fillPage(`<div class="card"><span class="spinner"></span></div>`);
  await vaultLoad();
  if (VAULT.sel && !VAULT.items.some((i) => i.id === VAULT.sel)) VAULT.sel = null;
  fillPage(vaultPanelsHtml());
}

ACTIONS['vault-filter'] = (el) => {
  VAULT.cat = el.dataset.id;
  vaultRefreshAll();
};
ACTIONS['vault-select'] = (el, e) => {
  if (e && e.target.closest('button')) return; // star and other buttons do their own job
  VAULT.sel = el.dataset.id;
  vaultRefreshAll();
};
document.addEventListener('input', (e) => {
  if (e.target.matches && e.target.matches('[data-input="vault-search"]')) {
    VAULT.q = e.target.value;
    vaultRefreshTable();
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches && e.target.matches('.vault-row')) e.target.click();
});

ACTIONS['vault-star'] = async (el, e) => {
  if (e) e.stopPropagation();
  const it = VAULT.items.find((i) => i.id === el.dataset.id);
  if (!it) return;
  try {
    await apiPatch('/api/vault/' + it.id, { starred: !it.starred });
    await vaultLoad();
    vaultRefreshAll();
  } catch (err) { toast(err.message, 'err'); }
};

// Reveal: the password is fetched only now, shown for 20 seconds, then hidden again.
ACTIONS['vault-reveal'] = async (el) => {
  try {
    const r = await apiGet(`/api/vault/${el.dataset.id}?reveal=1`);
    const box = document.getElementById('vaultPw');
    if (box) box.textContent = r.password || '';
    el.setAttribute('aria-pressed', 'true');
    clearTimeout(VAULT.revealTimer);
    VAULT.revealTimer = setTimeout(() => {
      const b = document.getElementById('vaultPw');
      if (b) b.textContent = '••••••••••••';
    }, 20000);
  } catch (err) { toast(err.message, 'err'); }
};
ACTIONS['vault-copy-pw'] = async (el) => {
  try {
    const r = await apiGet(`/api/vault/${el.dataset.id}?reveal=1`);
    await navigator.clipboard.writeText(r.password || '');
    toast('คัดลอกรหัสผ่านแล้ว');
  } catch (err) { toast('คัดลอกไม่สำเร็จ ' + err.message, 'err'); }
};
ACTIONS['vault-copy-login'] = async (el) => {
  const it = VAULT.items.find((i) => i.id === el.dataset.id);
  if (!it) return;
  try {
    await navigator.clipboard.writeText(it.login);
    toast('คัดลอกอีเมลแล้ว');
  } catch (err) { toast('คัดลอกไม่สำเร็จ ' + err.message, 'err'); }
};

// ---------------------------------------------------------------- add / edit
function vaultPwField(value) {
  return `<div class="vault-pw-wrap"><input class="input" type="password" name="password" autocomplete="new-password" maxlength="500" value="${esc(value)}">
    <button type="button" class="vault-icon-btn" data-action="vault-pw-toggle" aria-label="แสดงหรือซ่อนรหัสผ่าน">${icon('eye', 'sm')}</button></div>`;
}
ACTIONS['vault-pw-toggle'] = (el) => {
  const input = el.parentElement.querySelector('input');
  input.type = input.type === 'password' ? 'text' : 'password';
};
ACTIONS['vault-new'] = () => vaultForm(null);
ACTIONS['vault-edit'] = async (el) => {
  let pw = '';
  try { pw = (await apiGet(`/api/vault/${el.dataset.id}?reveal=1`)).password || ''; } catch (err) { toast(err.message, 'err'); return; }
  const it = VAULT.items.find((i) => i.id === el.dataset.id);
  vaultForm(it, pw);
};
function vaultForm(it, pw = '') {
  const cats = VAULT.categories;
  openModal({
    title: it ? 'แก้ไขข้อมูลการเข้าสู่ระบบ' : 'เพิ่มข้อมูลการเข้าสู่ระบบ',
    body: `<form data-form="vault" data-id="${esc(it ? it.id : '')}" class="vault-form">
      <label class="field"><span>ชื่อรายการ *</span><input class="input" name="title" required maxlength="120" value="${esc(it ? it.title : '')}" placeholder="เช่น Google Workspace"></label>
      <label class="field"><span>อีเมล / ชื่อผู้ใช้</span><input class="input" name="login" maxlength="200" value="${esc(it ? it.login : '')}"></label>
      <label class="field"><span>รหัสผ่าน</span>${vaultPwField(pw)}</label>
      <label class="field"><span>ลิงก์เข้าสู่ระบบ</span><input class="input" name="url" type="url" placeholder="https://..." value="${esc(it ? it.url : '')}"></label>
      <label class="field"><span>หมวด</span><select class="select" name="categoryId">
        <option value="">ไม่มีหมวด</option>
        ${cats.map((c) => `<option value="${esc(c.id)}" ${it && it.categoryId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
      </select></label>
      <label class="field"><span>หมายเหตุ</span><textarea class="textarea" name="note" rows="2" maxlength="2000">${esc(it ? it.note : '')}</textarea></label>
      <p class="vault-muted small">ไม่ควรเก็บรหัสบัตรเครดิตหรือเลขบัญชีธนาคารที่นี่ และควรใช้ Password Manager สำหรับรหัสที่สำคัญที่สุด</p>
      <p class="small" data-role="form-error"></p>
      <div class="vault-actions"><button type="button" class="btn ghost" data-action="close-modal">ยกเลิก</button>
        <button type="submit" class="btn primary">บันทึก</button></div>
    </form>`,
    onMount: (modal) => { modal.classList.add('vault-modal'); },
  });
}
FORMS['vault'] = async (form) => {
  const id = form.dataset.id;
  const v = (n) => form.querySelector(`[name="${n}"]`).value;
  const body = { title: v('title').trim(), login: v('login').trim(), url: v('url').trim() || null, categoryId: v('categoryId') || null, note: v('note').trim(), password: v('password') };
  const btn = form.querySelector('[type="submit"]');
  try {
    await busy(btn, () => (id ? apiPatch('/api/vault/' + id, body) : apiPost('/api/vault', body)));
    closeAllModals();
    toast(id ? 'บันทึกการแก้ไขแล้ว' : 'เพิ่มข้อมูลแล้ว');
    if (!id) VAULT.sel = null;
    await vaultLoad();
    vaultRefreshAll();
  } catch (err) { setFormError(form, err.message); }
};

ACTIONS['vault-delete'] = (el) => {
  const it = VAULT.items.find((i) => i.id === el.dataset.id);
  openModal({
    title: 'ลบข้อมูลนี้?',
    body: `<div class="vault-form"><p>ยืนยันการลบ “${esc(it ? it.title : '')}” ใช่หรือไม่?</p>
      <p class="vault-muted small">การลบไม่สามารถกู้คืนได้ และจะไม่กระทบบัญชีหรือโปรเจ็กต์อื่น</p>
      <div class="vault-actions"><button type="button" class="btn ghost" data-action="close-modal">ยกเลิก</button>
        <button type="button" class="btn danger" data-action="vault-delete-confirm" data-id="${esc(el.dataset.id)}">ยืนยันลบ</button></div></div>`,
  });
};
ACTIONS['vault-delete-confirm'] = async (el) => {
  try {
    await busy(el, () => api('DELETE', '/api/vault/' + el.dataset.id));
    closeAllModals();
    VAULT.sel = null;
    toast('ลบข้อมูลแล้ว');
    await vaultLoad();
    vaultRefreshAll();
  } catch (err) { toast(err.message, 'err'); }
};

// ---------------------------------------------------------------- categories
ACTIONS['vault-cat-new'] = () => vaultCats();
ACTIONS['vault-cats'] = () => vaultCats();
function vaultCats() {
  const rows = VAULT.categories.map((c) => `<div class="vault-cat-edit" data-cat="${esc(c.id)}">
      <span class="vault-dot" style="background:${esc(c.color)}"></span>
      <input class="input" maxlength="30" value="${esc(c.name)}" data-cat-name="${esc(c.id)}">
      <button type="button" class="vault-icon-btn danger" data-action="vault-cat-del" data-id="${esc(c.id)}" aria-label="ลบหมวด">${icon('trash2', 'sm')}</button></div>`).join('');
  openModal({
    title: 'จัดการหมวด',
    body: `<form data-form="vault-cats" class="vault-form">
      <p class="vault-muted small">ลบหมวดแล้วรายการในหมวดนั้นจะไปอยู่ “ไม่มีหมวด” ไม่ถูกลบ</p>
      ${rows || '<p class="vault-muted">ยังไม่มีหมวด</p>'}
      <label class="field"><span>เพิ่มหมวดใหม่</span><input class="input" name="newName" maxlength="30" placeholder="เช่น บัญชีงาน"></label>
      <p class="small" data-role="form-error"></p>
      <div class="vault-actions"><button type="button" class="btn ghost" data-action="close-modal">ปิด</button>
        <button type="submit" class="btn primary">บันทึก</button></div>
    </form>`,
    onMount: (modal) => { modal.classList.add('vault-modal'); },
  });
}
FORMS['vault-cats'] = async (form) => {
  try {
    for (const input of form.querySelectorAll('[data-cat-name]')) {
      const id = input.dataset.catName;
      const cur = VAULT.categories.find((c) => c.id === id);
      if (cur && input.value.trim() && input.value.trim() !== cur.name) {
        await apiPatch('/api/vault/categories/' + id, { name: input.value.trim() });
      }
    }
    const newName = form.querySelector('[name="newName"]').value.trim();
    if (newName) {
      const color = VAULT_PILL_COLORS[VAULT.categories.length % VAULT_PILL_COLORS.length];
      await apiPost('/api/vault/categories', { name: newName, color });
    }
    closeAllModals();
    toast('บันทึกหมวดแล้ว');
    await vaultLoad();
    vaultRefreshAll();
  } catch (err) { setFormError(form, err.message); }
};
ACTIONS['vault-cat-del'] = async (el) => {
  try {
    await busy(el, () => api('DELETE', '/api/vault/categories/' + el.dataset.id));
    if (VAULT.cat === el.dataset.id) VAULT.cat = 'all';
    toast('ลบหมวดแล้ว รายการยังอยู่ครบ');
    await vaultLoad();
    closeAllModals();
    vaultRefreshAll();
  } catch (err) { toast(err.message, 'err'); }
};

// Changing the picture of an entry: the same editor as the group pictures; removing it returns the letter.
ACTIONS['vault-avatar'] = (el) => {
  const it = VAULT.items.find((i) => i.id === el.dataset.id);
  if (!it) return;
  openAvatarEditor({
    title: 'รูปโปรไฟล์รายการ',
    current: it.avatarData,
    fallback: `<span class="vault-letter-fallback">${vaultLetter(it.title)}</span>`,
    onSave: async (data) => {
      await apiPatch('/api/vault/' + it.id, { avatarData: data });
      await vaultLoad();
      vaultRefreshAll();
      toast(data ? 'เปลี่ยนรูปโปรไฟล์แล้ว' : 'ลบรูปโปรไฟล์แล้ว');
    },
  });
};
