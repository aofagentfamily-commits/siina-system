/* SIINA SHOP — storefront shown after sign-in, and the gate to the private SIINA SYSTEM area.
   Products are DEMO data (ข้อมูลสาธิต). The cart icon is the private-area entry; the server enforces the lock. */
'use strict';

const SHOP_DEMO_NOTE = 'ข้อมูลสาธิต: สินค้า ราคา และโปรโมชั่นในหน้านี้เป็นตัวอย่างเท่านั้น ยังไม่มีการชำระเงินจริง';
const SHOP_CATS = [
  { k: 'tech', label: 'อุปกรณ์ไอที', sub: 'และแก็ดเจ็ต', icon: 'zap' },
  { k: 'wear', label: 'แฟชั่น', sub: 'และเครื่องแต่งกาย', icon: 'star' },
  { k: 'home', label: 'ของใช้ในบ้าน', sub: 'และไลฟ์สไตล์', icon: 'heart' },
  { k: 'work', label: 'ความงาม', sub: 'และดูแลตัวเอง', icon: 'shield' },
  { k: 'health', label: 'กีฬา', sub: 'และสุขภาพ', icon: 'bolt' },
  { k: 'gift', label: 'ของขวัญ', sub: 'และของน่ารัก', icon: 'heart' },
  { k: 'promo', label: 'โปรโมชั่น', sub: 'และดีลพิเศษ', icon: 'megaphone' },
];
const SHOP_PRODUCTS = [
  { id: 'p1', cat: 'tech', badge: 'แนะนำ', name: 'หูฟังไร้สาย SIINA Sound', desc: 'เสียงคมชัด เบสนุ่ม ใช้ได้นาน', price: 990, old: 1290, icon: 'zap' },
  { id: 'p2', cat: 'wear', badge: 'ขายดี', name: 'เสื้อฮู้ด SIINA Original', desc: 'นุ่มสบาย ใส่ได้ทุกวัน', price: 690, old: 790, icon: 'star' },
  { id: 'p3', cat: 'home', badge: 'ใหม่', name: 'แก้วมัค SIINA Eggy', desc: 'แก้วเซรามิกดีไซน์น่ารัก', price: 199, old: 249, icon: 'heart' },
  { id: 'p4', cat: 'gift', badge: 'คุ้มค่า', name: 'กระเป๋าผ้า SIINA Tote', desc: 'น้ำหนักเบา จุของได้เยอะ', price: 249, old: 329, icon: 'briefcase' },
  { id: 'p5', cat: 'tech', badge: 'อันดับ 1', name: 'หูฟังบลูทูธ SIINA Buds', desc: 'ขนาดกะทัดรัด เสียงดี', price: 790, old: 990, icon: 'zap' },
  { id: 'p6', cat: 'gift', badge: 'อันดับ 2', name: 'หมอนนุ่ม Eggy Hug', desc: 'นุ่มพิเศษ กอดสบาย', price: 359, old: 459, icon: 'heart' },
  { id: 'p7', cat: 'wear', badge: 'อันดับ 3', name: 'หมวกแก๊ป SIINA', desc: 'สไตล์มินิมอล ใส่ได้ทุกฤดู', price: 299, old: 379, icon: 'star' },
  { id: 'p8', cat: 'home', badge: 'ยอดนิยม', name: 'แผ่นรองเมาส์ SIINA', desc: 'สื่น นุ่ม ใช้งานสบาย', price: 199, old: 259, icon: 'shield' },
];

S.shopCart = S.shopCart || 0;
S.shopCat = S.shopCat || 'all';
S.shopQuery = '';

function shopEggImg(cls) {
  return `<img class="${cls}" src="/assets/welcome-egg.png" width="120" height="100" alt="" decoding="async">`;
}
function shopPrice(n) {
  return '฿' + Number(n).toLocaleString('th-TH');
}

function shopProductsHtml() {
  const q = S.shopQuery.trim().toLowerCase();
  const list = SHOP_PRODUCTS.filter((p) => (S.shopCat === 'all' || p.cat === S.shopCat)
    && (!q || (p.name + ' ' + p.desc).toLowerCase().includes(q)));
  if (!list.length) return '<div class="shop-empty">ไม่พบสินค้าที่ตรงกับการค้นหา</div>';
  return list.map((p) => {
    const off = Math.round((1 - p.price / p.old) * 100);
    return `<article class="shop-product" data-name="${esc(p.name)}">
      <div class="shop-thumb">${icon(p.icon)}<span class="shop-badge-tag">${esc(p.badge)}</span>
        <button class="shop-heart" aria-label="ถูกใจ">${icon('heart', 'sm')}</button></div>
      <h4>${esc(p.name)}</h4>
      <p>${esc(p.desc)}</p>
      <div class="shop-price"><b>${shopPrice(p.price)}</b><s>${shopPrice(p.old)}</s><em>-${off}%</em></div>
      <button class="shop-add" data-action="shop-add" data-id="${esc(p.id)}">${icon('cart', 'sm')} ใส่ตะกร้า</button>
    </article>`;
  }).join('');
}

function shopHtml() {
  const name = S.user ? (S.user.displayName || S.user.email) : '';
  return `<div class="shop">
    <header class="shop-top">
      <div class="shop-brand">${shopEggImg('shop-brand-egg')}<div><b>SIINA</b><span>SHOP</span></div></div>
      <nav class="shop-nav" aria-label="เมนูร้านค้า">
        <a href="#/shop" aria-current="page">หน้าแรก</a><a href="#/shop">สินค้าทั้งหมด</a><a href="#/shop">โปรโมชั่น</a>
        <a href="#/shop">สินค้าขายดี</a><a href="#/shop">บทความ/รีวิว</a><a href="#/shop">ช่วยเหลือ</a>
      </nav>
      <label class="shop-search">${icon('search', 'sm')}<span class="sr-only">ค้นหาสินค้า</span>
        <input type="search" placeholder="ค้นหาสินค้า เช่น หูฟัง, กระเป๋า, แก้วมัค" data-input="shop-search" value="${esc(S.shopQuery)}"></label>
      <div class="shop-tools">
        <button class="shop-ico" aria-label="แจ้งเตือน">${icon('bell')}</button>
        <div class="shop-user">${icon('user', 'sm')}<span>สวัสดี!<b>${esc(name)}</b></span></div>
        <button class="shop-cart-btn" data-action="shop-cart" aria-label="ตะกร้าสินค้า">${icon('cart')}
          <span class="shop-count" aria-label="จำนวนสินค้าในตะกร้า">${S.shopCart}</span></button>
      </div>
    </header>

    <section class="shop-banner">
      <div class="shop-banner-text">
        <span class="shop-kicker">สินค้าแนะนำ</span>
        <h1>ดีลพิเศษวันนี้!</h1>
        <p>ของดี ราคาคุ้ม ส่งไวถึงบ้าน</p>
        <button class="shop-cta" data-action="shop-cat" data-id="all">${icon('cart', 'sm')} เลือกซื้อสินค้า</button>
      </div>
      <div class="shop-banner-art">${shopEggImg('shop-banner-egg')}</div>
    </section>

    <section class="shop-block">
      <div class="shop-block-head"><h2>เลือกซื้อตามหมวดหมู่</h2></div>
      <div class="shop-cats">
        ${SHOP_CATS.map((c) => `<button class="shop-cat ${S.shopCat === c.k ? 'is-on' : ''}" data-action="shop-cat" data-id="${c.k}">
          <span class="shop-cat-ic">${icon(c.icon)}</span><span><b>${esc(c.label)}</b><small>${esc(c.sub)}</small></span></button>`).join('')}
      </div>
    </section>

    <section class="shop-block">
      <div class="shop-block-head"><h2>สินค้าแนะนำให้คุณ</h2><span class="shop-hint">${S.shopCat === 'all' ? 'ทั้งหมด' : esc((SHOP_CATS.find((c) => c.k === S.shopCat) || {}).label || '')}</span></div>
      <div class="shop-grid" id="shopGrid">${shopProductsHtml()}</div>
    </section>

    <section class="shop-flash">
      <div><span class="shop-kicker">FLASH SALE</span><h2>ลดสูงสุด 50%</h2><p>ดีลแรง! จำกัดเวลา</p></div>
      <div class="shop-flash-off">50%</div>
      <button class="shop-cta" data-action="shop-cat" data-id="promo">ช้อปดีลตอนนี้</button>
    </section>

    <footer class="shop-foot">
      <div class="shop-brand">${shopEggImg('shop-brand-egg')}<div><b>SIINA</b><span>SHOP</span></div></div>
      <p>ร้านค้าออนไลน์ของคนรักความน่ารัก<br>สินค้าไลฟ์สไตล์คุณภาพ ราคาคุ้ม ส่งไวทั่วไทย</p>
      <p class="shop-demo">${esc(SHOP_DEMO_NOTE)}</p>
      <button class="shop-logout" data-action="logout" aria-label="ออกจากระบบ">${icon('logout', 'sm')} ออกจากระบบ</button>
    </footer>
  </div>`;
}

function renderShop() {
  fillPage(shopHtml());
}
PAGES.shop = renderShop;

ACTIONS['shop-cat'] = (el) => {
  S.shopCat = el.dataset.id;
  renderShop();
  const grid = document.getElementById('shopGrid');
  if (grid) grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
};
ACTIONS['shop-add'] = (el) => {
  S.shopCart += 1;
  const count = document.querySelector('.shop-count');
  if (count) count.textContent = String(S.shopCart);
  const p = SHOP_PRODUCTS.find((x) => x.id === el.dataset.id);
  toast(p ? `เพิ่ม “${p.name}” ลงตะกร้าแล้ว` : 'เพิ่มลงตะกร้าแล้ว');
};
document.addEventListener('input', (e) => {
  if (e.target.matches && e.target.matches('[data-input="shop-search"]')) {
    S.shopQuery = e.target.value;
    const grid = document.getElementById('shopGrid');
    if (grid) grid.innerHTML = shopProductsHtml();
  }
});

// ---------------------------------------------------------------- private area gate
async function refreshPriv() {
  S.priv = await apiGet('/api/private/status');
  return S.priv;
}
function enterPrivate(status) {
  S.priv = status || { ...(S.priv || {}), unlocked: true };
  S.priv.unlocked = true;
  navigate('#/home');
}

// Cart icon: the private entry. With no PIN yet, the first visit sets one; otherwise the PIN is asked.
ACTIONS['shop-cart'] = async () => {
  const st = await refreshPriv().catch(() => null);
  if (!st) { toast('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่', 'err'); return; }
  if (st.unlocked) { enterPrivate(st); return; }
  privPopup(st.hasPin ? 'unlock' : 'setup');
};
ACTIONS['priv-back'] = async () => {
  await apiPost('/api/private/lock').catch(() => null);
  if (S.priv) S.priv.unlocked = false;
  navigate('#/shop');
};

function privBoxes(name, label) {
  return `<div class="priv-row" data-name="${name}">
    <span class="priv-label">${esc(label)}</span>
    <div class="priv-boxes">${[0, 1, 2, 3, 4, 5].map((i) => `<input class="priv-box" type="password" inputmode="numeric" maxlength="1" autocomplete="off" aria-label="${esc(label)} หลักที่ ${i + 1}">`).join('')}</div>
  </div>`;
}
function privRowValue(row) {
  return [...row.querySelectorAll('.priv-box')].map((b) => b.value).join('');
}

function privPopup(mode) {
  const setup = mode === 'setup';
  openModal({
    title: setup ? 'ตั้งรหัสส่วนตัว' : 'ยืนยันรหัสส่วนตัว',
    body: `<form data-form="priv-${mode}" class="priv-form" novalidate>
      <div class="priv-head">${icon('lock')}<div><b>${setup ? 'ตั้งรหัส 6 หลักครั้งแรก' : 'ยืนยันรหัสส่วนตัว'}</b>
        <small class="muted">${setup ? 'รหัสนี้ใช้เข้าพื้นที่ SIINA SYSTEM ทุกครั้ง' : 'กรุณากรอกรหัส 6 หลักเพื่อดำเนินการต่อ'}</small></div></div>
      ${setup ? privBoxes('pin', 'รหัส 6 หลัก') + privBoxes('confirm', 'ยืนยันรหัส') : privBoxes('pin', 'รหัส 6 หลัก')}
      <p class="priv-error" data-role="form-error" role="alert"></p>
      <div class="priv-actions"><button type="button" class="btn ghost" data-action="close-modal">ยกเลิก</button>
        <button type="submit" class="btn primary">ยืนยัน</button></div>
    </form>`,
    onMount: (modal) => {
      modal.classList.add('priv-modal');
      const first = modal.querySelector('.priv-box');
      if (first) setTimeout(() => first.focus(), 40);
    },
  });
}

// Typing moves on; paste fills all six; the sixth digit of an unlock submits. Digits are never shown.
document.addEventListener('input', (e) => {
  if (!e.target.classList || !e.target.classList.contains('priv-box')) return;
  const box = e.target;
  box.value = box.value.replace(/\D/g, '').slice(-1);
  const boxes = [...box.closest('.priv-row').querySelectorAll('.priv-box')];
  const next = boxes[boxes.indexOf(box) + 1];
  if (box.value && next) next.focus();
  const form = box.closest('form');
  if (form && form.dataset.form === 'priv-unlock' && privRowValue(box.closest('.priv-row')).length === 6) privSubmit(form);
});
document.addEventListener('keydown', (e) => {
  if (!e.target.classList || !e.target.classList.contains('priv-box')) return;
  if (e.key === 'Backspace' && !e.target.value) {
    const boxes = [...e.target.closest('.priv-row').querySelectorAll('.priv-box')];
    const prev = boxes[boxes.indexOf(e.target) - 1];
    if (prev) { prev.value = ''; prev.focus(); }
    e.preventDefault();
  }
});
document.addEventListener('paste', (e) => {
  if (!e.target.classList || !e.target.classList.contains('priv-box')) return;
  e.preventDefault();
  const digits = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6);
  const boxes = [...e.target.closest('.priv-row').querySelectorAll('.priv-box')];
  boxes.forEach((b, i) => { b.value = digits[i] || ''; });
  const last = boxes[Math.min(digits.length, 6) - 1];
  if (last) last.focus();
  const form = e.target.closest('form');
  if (form && form.dataset.form === 'priv-unlock' && digits.length === 6) privSubmit(form);
});

function privSubmit(form) {
  const pin = privRowValue(form.querySelector('.priv-row[data-name="pin"]'));
  if (!/^\d{6}$/.test(pin)) { setFormError(form, 'กรุณากรอกรหัสให้ครบ 6 หลัก'); return; }
  if (form.dataset.form === 'priv-unlock') {
    busy(form.querySelector('[type="submit"]'), () => apiPost('/api/private/unlock', { pin }))
      .then((st) => { closeAllModals(); enterPrivate(st); })
      .catch((err) => {
        setFormError(form, err.message === 'รหัสไม่ถูกต้อง' ? 'รหัสไม่ถูกต้อง' : err.message);
        form.querySelectorAll('.priv-box').forEach((b) => { b.value = ''; });
        const first = form.querySelector('.priv-box');
        if (first) first.focus();
      });
  }
}
FORMS['priv-unlock'] = async (form) => privSubmit(form);
FORMS['priv-setup'] = async (form) => {
  const pin = privRowValue(form.querySelector('.priv-row[data-name="pin"]'));
  const confirm = privRowValue(form.querySelector('.priv-row[data-name="confirm"]'));
  if (!/^\d{6}$/.test(pin)) { setFormError(form, 'กรุณากรอกรหัส 6 หลัก'); return; }
  if (pin !== confirm) { setFormError(form, 'รหัสยืนยันไม่ตรงกับรหัสที่ตั้ง'); return; }
  try {
    const st = await busy(form.querySelector('[type="submit"]'), () => apiPost('/api/private/pin', { pin, confirm }));
    closeAllModals();
    toast('ตั้งรหัสส่วนตัวแล้ว');
    enterPrivate(st);
  } catch (err) { setFormError(form, err.message); }
};

// ---------------------------------------------------------------- settings > ความปลอดภัย > รหัสเข้าพื้นที่ส่วนตัว
async function settingsSecurity(body) {
  const st = await apiGet('/api/private/status');
  const opts = st.choices.map((m) => `<option value="${m}" ${st.sessionMinutes === m ? 'selected' : ''}>${m >= 60 ? (m / 60) + ' ชั่วโมง' : m + ' นาที'}</option>`).join('');
  body.innerHTML = `
    <div class="card">
      <h3>รหัสเข้าพื้นที่ส่วนตัว</h3>
      <p class="muted small" style="margin-bottom:14px">ใช้ยืนยันก่อนเข้า SIINA SYSTEM จากหน้า SIINA SHOP รหัสเก็บแบบเข้ารหัส (hash) ไม่แสดงในหน้าจอหรือ API</p>
      <div class="sec-row">
        <div><b>เปิดใช้รหัสส่วนตัว</b><small class="muted">${st.hasPin ? (st.enabled ? 'เปิดอยู่' : 'ปิดอยู่') : 'ยังไม่ได้ตั้งรหัส'}</small></div>
        <label class="switch"><input type="checkbox" data-change="sec-toggle" ${st.enabled && st.hasPin ? 'checked' : ''} ${st.hasPin ? '' : 'disabled'}><span></span></label>
      </div>
      <div class="sec-row">
        <div><b>${st.hasPin ? 'เปลี่ยนรหัส 6 หลัก' : 'ตั้งรหัส 6 หลัก'}</b><small class="muted">${st.hasPin ? 'ต้องยืนยันรหัสเดิมหรือรหัสผ่านบัญชีก่อน' : 'ตั้งรหัสครั้งแรก'}</small></div>
        <button class="btn sm" data-action="sec-pin">${icon('edit', 'sm')} ${st.hasPin ? 'เปลี่ยนรหัส' : 'ตั้งรหัส'}</button>
      </div>
      <div class="sec-row">
        <div><b>ระยะเวลาก่อนต้องยืนยันรหัสใหม่</b><small class="muted">หมดเวลาแล้วต้องใส่รหัสอีกครั้ง</small></div>
        <select class="select" data-change="sec-minutes" style="max-width:180px">${opts}</select>
      </div>
      <div class="sec-row">
        <div><b>ออกจากอุปกรณ์อื่น</b><small class="muted">เครื่องนี้จะยังเข้าสู่ระบบอยู่</small></div>
        <button class="btn sm danger" data-action="sec-others">${icon('logout', 'sm')} ออกจากอุปกรณ์อื่น</button>
      </div>
    </div>`;
}

ACTIONS['sec-pin'] = async () => {
  const st = await apiGet('/api/private/status');
  openModal({
    title: st.hasPin ? 'เปลี่ยนรหัสส่วนตัว' : 'ตั้งรหัสส่วนตัว',
    body: `<form data-form="sec-pin" class="stack">
      ${st.hasPin ? `<label class="field"><span>รหัสเดิม 6 หลัก (หรือใส่รหัสผ่านบัญชีด้านล่าง)</span><input class="input" type="password" inputmode="numeric" maxlength="6" name="currentPin" autocomplete="off"></label>
        <label class="field"><span>รหัสผ่านบัญชี (ถ้าไม่มีรหัสเดิม)</span><input class="input" type="password" name="password" autocomplete="current-password"></label>` : ''}
      <label class="field"><span>รหัสใหม่ 6 หลัก</span><input class="input" type="password" inputmode="numeric" maxlength="6" name="pin" autocomplete="new-password" required></label>
      <label class="field"><span>ยืนยันรหัสใหม่</span><input class="input" type="password" inputmode="numeric" maxlength="6" name="confirm" autocomplete="new-password" required></label>
      <p class="small" data-role="form-error"></p>
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn ghost" data-action="close-modal">ยกเลิก</button>
        <button type="submit" class="btn primary">บันทึก</button></div>
    </form>`,
  });
};
FORMS['sec-pin'] = async (form) => {
  const v = (n) => form.querySelector(`[name="${n}"]`) ? form.querySelector(`[name="${n}"]`).value.trim() : '';
  const body = { pin: v('pin'), confirm: v('confirm') };
  if (v('currentPin')) body.currentPin = v('currentPin');
  if (v('password')) body.password = v('password');
  try {
    await busy(form.querySelector('[type="submit"]'), () => apiPost('/api/private/pin', body));
    closeAllModals();
    toast('บันทึกรหัสส่วนตัวแล้ว');
    rerender();
  } catch (err) { setFormError(form, err.message); }
};

// Turning the PIN off needs proof, like changing it.
document.addEventListener('change', async (e) => {
  if (e.target.dataset && e.target.dataset.change === 'sec-toggle') {
    const on = e.target.checked;
    if (on) {
      try { await apiPost('/api/private/enabled', { enabled: true }); toast('เปิดใช้รหัสส่วนตัวแล้ว'); } catch (err) { toast(err.message, 'err'); }
      rerender();
      return;
    }
    e.target.checked = true; // stays on until the proof is accepted
    openModal({
      title: 'ปิดการใช้รหัสส่วนตัว',
      body: `<form data-form="sec-off" class="stack">
        <p class="muted small">ใส่รหัสเดิม 6 หลัก หรือรหัสผ่านบัญชีเพื่อยืนยัน</p>
        <label class="field"><span>รหัสเดิม 6 หลัก</span><input class="input" type="password" inputmode="numeric" maxlength="6" name="currentPin" autocomplete="off"></label>
        <label class="field"><span>หรือรหัสผ่านบัญชี</span><input class="input" type="password" name="password" autocomplete="current-password"></label>
        <p class="small" data-role="form-error"></p>
        <div class="row" style="justify-content:flex-end"><button type="button" class="btn ghost" data-action="close-modal">ยกเลิก</button>
          <button type="submit" class="btn danger">ยืนยันปิดการใช้รหัส</button></div></form>`,
    });
  }
  if (e.target.dataset && e.target.dataset.change === 'sec-minutes') {
    try {
      await apiPost('/api/private/session', { minutes: Number(e.target.value) });
      toast('บันทึกระยะเวลาแล้ว');
    } catch (err) { toast(err.message, 'err'); }
  }
});
FORMS['sec-off'] = async (form) => {
  const body = { enabled: false };
  const cur = form.querySelector('[name="currentPin"]').value.trim();
  const pw = form.querySelector('[name="password"]').value;
  if (cur) body.currentPin = cur;
  if (pw) body.password = pw;
  try {
    await busy(form.querySelector('[type="submit"]'), () => apiPost('/api/private/enabled', body));
    closeAllModals();
    toast('ปิดการใช้รหัสส่วนตัวแล้ว');
    rerender();
  } catch (err) { setFormError(form, err.message); }
};

ACTIONS['sec-others'] = () => {
  openModal({
    title: 'ออกจากอุปกรณ์อื่น?',
    body: `<div class="stack"><p>อุปกรณ์อื่นทั้งหมดของบัญชีนี้จะต้องเข้าสู่ระบบใหม่ เครื่องนี้ยังเข้าสู่ระบบอยู่</p>
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn ghost" data-action="close-modal">ยกเลิก</button>
      <button type="button" class="btn danger" data-action="sec-others-confirm">ยืนยัน</button></div></div>`,
  });
};
ACTIONS['sec-others-confirm'] = async (el) => {
  try {
    const r = await busy(el, () => apiPost('/api/private/logout-others'));
    closeAllModals();
    toast(`ออกจากอุปกรณ์อื่นแล้ว ${r.signedOut} เครื่อง`);
  } catch (err) { toast(err.message, 'err'); }
};
