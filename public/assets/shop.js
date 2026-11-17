/* SIINA CAT CAFE & CAT HOTEL — the storefront after sign-in. All listings, prices and cats are DEMO data.
   Cart: one click opens the cart; a double click (or a 2-second press on touch) opens the private PIN popup. */
'use strict';

const CAFE_DEMO_NOTE = 'ข้อมูลสาธิต: ห้องพัก ราคา รูปภาพ และรายการน้องแมวในหน้านี้เป็นตัวอย่างเท่านั้น ยังไม่มีการชำระเงินหรือยืนยันการจองจริง';
const CAFE_CATS = [
  { k: 'hotel', label: 'โรงแรมแมว', sub: 'ฝากเลี้ยงอย่างปลอดภัย มีพนักงานดูแลใกล้ชิด', icon: 'home' },
  { k: 'cafe', label: 'คาเฟ่แมว', sub: 'ดื่มกาแฟ ชิลกับน้องแมวในบรรยากาศอบอุ่น', icon: 'heart' },
  { k: 'rooms', label: 'ห้องพักน้องแมว', sub: 'เลือกห้องพักได้หลายแบบ ตามไลฟ์สไตล์น้องแมว', icon: 'star' },
  { k: 'bath', label: 'อาบน้ำดูแล', sub: 'อาบน้ำ ตัดเล็บ และดูแลความสะอาด', icon: 'shield' },
  { k: 'sale', label: 'ซื้อขายน้องแมว', sub: 'จำหน่ายลูกแมวสายพันธุ์แท้ สุขภาพดี มีใบรับรอง', icon: 'bookmark' },
  { k: 'promo', label: 'โปรโมชั่น', sub: 'แพ็กเกจคุ้มค่า สำหรับทาสแมว', icon: 'megaphone' },
];
// kind: room (book), cafe (details), cat (inquire). Photos are cropped from the approved mockup.
const CAFE_ITEMS = [
  { id: 'r1', kind: 'room', cat: 'hotel', badge: 'ยอดนิยม', name: 'ห้องพัก Cozy', desc: 'ห้องพักมาตรฐาน อบอุ่นเป็นส่วนตัว เหมาะสำหรับการฝากเลี้ยงระยะสั้น', price: 390, unit: 'คืน', img: 'p1', feats: ['เตียงนอนนุ่มสำหรับน้องแมว', 'กล้องดูน้องแมวออนไลน์ 24 ชม.', 'อาหารตามที่ตกลงกับเจ้าของ'] },
  { id: 'r2', kind: 'room', cat: 'rooms', badge: 'ขายดี', name: 'ห้องพัก Deluxe', desc: 'ห้องพักกว้าง มีคอนโดแมวของเล่น และมุมพักผ่อน', price: 590, unit: 'คืน', img: 'p2', feats: ['พื้นที่กว้างพร้อมคอนโดแมว', 'มุมพักผ่อนและของเล่น', 'ระบบระบายอากาศ'] },
  { id: 'r3', kind: 'room', cat: 'rooms', badge: 'แนะนำ', name: 'ห้องพัก VIP', desc: 'ห้องพักขนาดใหญ่พิเศษ พร้อมกล้องดูน้องแมวออนไลน์ 24 ชม.', price: 890, unit: 'คืน', img: 'p3', feats: ['ห้องขนาดใหญ่พิเศษ', 'กล้องดูน้องแมวออนไลน์', 'พนักงานดูแลใกล้ชิด'] },
  { id: 'c1', kind: 'cafe', cat: 'cafe', badge: 'แพ็กเกจ', name: 'แพ็กเกจคาเฟ่แมว', desc: 'เครื่องดื่ม + สิทธิ์เล่นกับน้องแมว (ไม่จำกัดเวลา)', price: 199, unit: 'ท่าน', img: 'p4', feats: ['เครื่องดื่ม 1 แก้ว', 'เล่นกับน้องแมวได้ตามเวลาที่กำหนด'] },
  { id: 's1', kind: 'cat', cat: 'sale', badge: 'ลูกแมว', name: 'น้องมิลค์กี้', desc: 'ลูกแมว Scottish Fold เพศเมีย ขี้อ้อน เข้ากับคนง่าย', price: 25900, unit: '', img: 'p5', breed: 'Scottish Fold', age: '3 เดือน', gender: 'เพศเมีย', status: 'รอตรวจสอบเอกสาร' },
  { id: 's2', kind: 'cat', cat: 'sale', badge: 'พร้อมย้ายบ้าน', name: 'น้องมอคค่า', desc: 'ลูกแมว Maine Coon เพศผู้ ขนฟู ขนาดใหญ่ สุขภาพแข็งแรง', price: 39900, unit: '', img: 'p6', breed: 'Maine Coon', age: '4 เดือน', gender: 'เพศผู้', status: 'รอตรวจสอบเอกสาร' },
];
const CAFE_LOGO = '<svg class="cafe-logo" viewBox="0 0 64 64" aria-hidden="true"><path d="M12 26 L14 6 L28 16 Q32 14 36 16 L50 6 L52 26 Q56 36 50 46 Q44 56 32 56 Q20 56 14 46 Q8 36 12 26Z" fill="#9B633D"/><ellipse cx="24" cy="34" rx="3" ry="4" fill="#4A2C1B"/><ellipse cx="40" cy="34" rx="3" ry="4" fill="#4A2C1B"/><path d="M30 40 L34 40 L32 43Z" fill="#FFD27A"/></svg>';

S.cafeCart = S.cafeCart || {};     // item id -> quantity (demo)
S.cafeCat = S.cafeCat || 'all';
S.cafeQuery = S.cafeQuery || '';
S.cafeFav = S.cafeFav || {};

function cafeCount() {
  return Object.values(S.cafeCart).reduce((n, q) => n + q, 0);
}
function cafePrice(n) {
  return '฿' + Number(n).toLocaleString('th-TH');
}
function cafeItem(id) {
  return CAFE_ITEMS.find((x) => x.id === id);
}
function cafeImg(item, cls) {
  return `<img class="${cls}" src="/assets/cafe/${item.img}.jpg" alt="${esc(item.name)}" loading="lazy" decoding="async">`;
}

function cafeItemsHtml() {
  const q = S.cafeQuery.trim().toLowerCase();
  const list = CAFE_ITEMS.filter((p) => (S.cafeCat === 'all' || p.cat === S.cafeCat)
    && (!q || (p.name + ' ' + p.desc).toLowerCase().includes(q)));
  if (!list.length) return '<div class="cafe-empty">ไม่พบรายการที่ตรงกับการค้นหา</div>';
  return list.map((p) => {
    const action = p.kind === 'room' ? ['book', 'จองห้อง', 'calendar']
      : p.kind === 'cafe' ? ['detail', 'ดูรายละเอียด', 'chat'] : ['inquire', 'สอบถาม', 'bookmark'];
    const price = p.kind === 'cat' ? `<b>${cafePrice(p.price)}</b>` : `<b>${cafePrice(p.price)}</b><small> / ${esc(p.unit)}</small>`;
    return `<article class="cafe-card">
      <div class="cafe-photo">${cafeImg(p, 'cafe-photo-img')}<span class="cafe-tag">${esc(p.badge)}</span>
        <button class="cafe-fav ${S.cafeFav[p.id] ? 'is-on' : ''}" data-action="cafe-fav" data-id="${esc(p.id)}" aria-pressed="${!!S.cafeFav[p.id]}" aria-label="รายการโปรด">${icon('heart', 'sm')}</button></div>
      <h4>${icon('heart', 'sm')} ${esc(p.name)}</h4>
      <p>${esc(p.desc)}</p>
      <div class="cafe-price">${price}</div>
      <div class="cafe-actions"><button class="cafe-btn" data-action="cafe-${action[0]}" data-id="${esc(p.id)}">${icon(action[2], 'sm')} ${action[1]}</button>
        ${p.kind === 'cafe' ? `<button class="cafe-btn ghost" data-action="cafe-add" data-id="${esc(p.id)}">${icon('cart', 'sm')} ใส่ตะกร้า</button>` : ''}</div>
    </article>`;
  }).join('');
}

function cafeHtml() {
  const name = S.user ? (S.user.displayName || S.user.email) : '';
  return `<div class="cafe">
    <header class="cafe-top">
      <div class="cafe-brand">${CAFE_LOGO}<div><b>SIINA</b><span>CAT CAFE</span></div></div>
      <nav class="cafe-nav" aria-label="เมนูคาเฟ่แมว">
        <a href="#/shop" aria-current="page">หน้าแรก</a><a href="#/shop" data-scroll="hotel">โรงแรมแมว</a>
        <a href="#/shop" data-scroll="cafe">คาเฟ่แมว</a><a href="#/shop" data-scroll="rooms">ห้องพักน้องแมว</a>
        <a href="#/shop" data-scroll="sale">ซื้อขายน้องแมว</a><a href="#/shop">รีวิว</a><a href="#/shop">ช่วยเหลือ</a>
      </nav>
      <label class="cafe-search">${icon('search', 'sm')}<span class="sr-only">ค้นหา</span>
        <input type="search" placeholder="ค้นหาแมว ห้องพัก โรงแรมแมว คาเฟ่แมว..." data-input="cafe-search" value="${esc(S.cafeQuery)}"></label>
      <div class="cafe-tools">
        <button class="cafe-ico" aria-label="แจ้งเตือน">${icon('bell')}</button>
        <div class="cafe-user">${icon('user', 'sm')}<span>${esc(name)}</span></div>
        <button class="cafe-cart" data-action="shop-cart" aria-label="ตะกร้าสินค้า" title="คลิกเพื่อดูตะกร้า">${icon('cart')}
          <span class="cafe-count" aria-label="จำนวนในตะกร้า">${cafeCount()}</span></button>
      </div>
    </header>

    <section class="cafe-hero">
      <div class="cafe-hero-text">
        <span class="cafe-kicker">SIINA CAT CAFE &amp; CAT HOTEL</span>
        <h1>คาเฟ่แมว &amp; โรงแรมแมว<br>ที่อบอุ่นที่สุดสำหรับน้องแมว</h1>
        <p class="cafe-lines"><span>บริการครบจบในที่เดียว</span><span>ฝากเลี้ยงน้องแมว</span><span>คาเฟ่แมว</span><span>โรงแรมแมว</span></p>
        <button class="cafe-cta" data-action="cafe-cat" data-id="rooms">${icon('calendar', 'sm')} จองห้องน้องแมวเลย</button>
      </div>
      <div class="cafe-hero-photo"><img src="/assets/cafe/banner.jpg" alt="น้องแมวในคาเฟ่แมว" decoding="async"></div>
    </section>

    <section class="cafe-block">
      <div class="cafe-block-head"><h2>${icon('heart', 'sm')} เลือกบริการตามความต้องการ</h2></div>
      <div class="cafe-cats">
        ${CAFE_CATS.map((c) => `<button class="cafe-catcard ${S.cafeCat === c.k ? 'is-on' : ''}" data-action="cafe-cat" data-id="${c.k}" id="${c.k === 'hotel' ? 'sec-hotel' : ''}">
          <span class="cafe-catic">${icon(c.icon)}</span><span><b>${esc(c.label)}</b><small>${esc(c.sub)}</small></span></button>`).join('')}
      </div>
    </section>

    <section class="cafe-block" id="cafeList">
      <div class="cafe-block-head"><h2>${icon('heart', 'sm')} ห้องพัก &amp; บริการแนะนำสำหรับคุณ</h2>
        <button class="cafe-more" data-action="cafe-cat" data-id="all">ทั้งหมด ›</button></div>
      <div class="cafe-grid">${cafeItemsHtml()}</div>
    </section>

    <footer class="cafe-foot">
      <div class="cafe-brand">${CAFE_LOGO}<div><b>SIINA</b><span>CAT CAFE</span></div></div>
      <p>คาเฟ่แมว โรงแรมแมว และรายการน้องแมวที่ตรวจสอบได้ เพื่อสวัสดิภาพของน้องแมว</p>
      <p class="cafe-demo">${esc(CAFE_DEMO_NOTE)}</p>
      <button class="cafe-logout" data-action="logout">${icon('logout', 'sm')} ออกจากระบบ</button>
    </footer>
  </div>`;
}

function renderShop() {
  fillPage(cafeHtml());
}

ACTIONS['cafe-cat'] = (el) => {
  S.cafeCat = el.dataset.id || 'all';
  renderShop();
  const list = document.getElementById('cafeList');
  if (list) list.scrollIntoView({ behavior: 'smooth', block: 'start' });
};
ACTIONS['cafe-fav'] = (el) => {
  S.cafeFav[el.dataset.id] = !S.cafeFav[el.dataset.id];
  el.classList.toggle('is-on', !!S.cafeFav[el.dataset.id]);
  el.setAttribute('aria-pressed', String(!!S.cafeFav[el.dataset.id]));
};
document.addEventListener('click', (e) => {
  const nav = e.target.closest && e.target.closest('.cafe-nav a[data-scroll]');
  if (!nav) return;
  e.preventDefault();
  S.cafeCat = nav.dataset.scroll;
  renderShop();
  const list = document.getElementById('cafeList');
  if (list) list.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
document.addEventListener('input', (e) => {
  if (e.target.matches && e.target.matches('[data-input="cafe-search"]')) {
    S.cafeQuery = e.target.value;
    const grid = document.querySelector('.cafe-grid');
    if (grid) grid.innerHTML = cafeItemsHtml();
  }
});

// ---------------------------------------------------------------- details, booking, inquiry (demo, no payment)
ACTIONS['cafe-detail'] = (el) => {
  const p = cafeItem(el.dataset.id);
  if (!p) return;
  openModal({
    title: p.name,
    body: `<div class="cafe-detail">${cafeImg(p, 'cafe-detail-img')}
      <p>${esc(p.desc)}</p>
      <ul class="cafe-feats">${p.feats.map((f) => `<li>${icon('check2', 'sm')} ${esc(f)}</li>`).join('')}</ul>
      <p class="cafe-price"><b>${cafePrice(p.price)}</b><small> / ${esc(p.unit)}</small></p>
      <p class="muted small">${esc(CAFE_DEMO_NOTE)}</p>
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn ghost" data-action="close-modal">ปิด</button></div></div>`,
  });
};
ACTIONS['cafe-inquire'] = (el) => {
  const p = cafeItem(el.dataset.id);
  if (!p) return;
  openModal({
    title: 'สอบถามรายละเอียด ' + p.name,
    body: `<div class="cafe-detail">
      <div class="cafe-cat-facts">
        <div><small>สายพันธุ์</small><b>${esc(p.breed)}</b></div>
        <div><small>อายุ</small><b>${esc(p.age)}</b></div>
        <div><small>เพศ</small><b>${esc(p.gender)}</b></div>
        <div><small>สถานะ</small><b class="cafe-status">${esc(p.status)}</b></div>
      </div>
      <p class="small"><b>ข้อมูลสุขภาพและการดูแล</b>ต้องตรวจสอบเอกสารและสุขภาพก่อนเปิดซื้อขายจริง ตามข้อกำหนดกฎหมายและสวัสดิภาพสัตว์ที่เกี่ยวข้อง</p>
      <p class="muted small">${esc(CAFE_DEMO_NOTE)}</p>
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn ghost" data-action="close-modal">ปิด</button>
        <button type="button" class="btn primary" data-action="cafe-sent">ส่งข้อความสอบถาม</button></div></div>`,
  });
};
ACTIONS['cafe-sent'] = () => {
  closeAllModals();
  toast('ส่งข้อความสอบถามแล้ว (ข้อมูลสาธิต) ทีมงานจะติดต่อกลับ');
};
ACTIONS['cafe-book'] = (el) => {
  const p = cafeItem(el.dataset.id);
  if (!p) return;
  openModal({
    title: 'ขอจอง ' + p.name,
    body: `<form data-form="cafe-book" data-id="${esc(p.id)}" class="stack">
      <p class="muted small">ส่งคำขอจองเพื่อให้ทีมงานตรวจสอบ ยังไม่มีการชำระเงินในขั้นนี้ และยังไม่ถือว่าการจองได้รับการยืนยัน</p>
      <div class="cafe-form-grid">
        <label class="field"><span>วันที่เข้าพัก</span><input class="input" type="date" name="checkIn" required></label>
        <label class="field"><span>วันที่ออก</span><input class="input" type="date" name="checkOut" required></label>
        <label class="field"><span>จำนวนแมว</span><input class="input" type="number" name="cats" min="1" max="5" value="1" required></label>
        <label class="field"><span>ชื่อผู้ติดต่อ</span><input class="input" name="contact" maxlength="80" required></label>
        <label class="field"><span>เบอร์โทรศัพท์</span><input class="input" name="phone" maxlength="20" inputmode="tel" required></label>
      </div>
      <label class="field"><span>หมายเหตุ</span><textarea class="textarea" name="note" rows="2" maxlength="300"></textarea></label>
      <p class="small"><b>ราคาต่อคืน:</b> ${cafePrice(p.price)} (ข้อมูลสาธิต)</p>
      <p class="small" data-role="form-error"></p>
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn ghost" data-action="close-modal">ยกเลิก</button>
        <button type="submit" class="btn primary">ส่งคำขอจอง</button></div>
    </form>`,
  });
};
FORMS['cafe-book'] = async (form) => {
  const inDate = form.querySelector('[name="checkIn"]').value;
  const outDate = form.querySelector('[name="checkOut"]').value;
  if (!inDate || !outDate || outDate <= inDate) { setFormError(form, 'วันที่ออกต้องหลังวันที่เข้าพัก'); return; }
  closeAllModals();
  toast('ส่งคำขอจองแล้ว (ข้อมูลสาธิต) ยังไม่ได้รับการยืนยัน ทีมงานจะตรวจสอบและติดต่อกลับ');
};

// ---------------------------------------------------------------- cart (demo)
function cafeCartHtml() {
  const lines = Object.entries(S.cafeCart).map(([id, qty]) => ({ item: cafeItem(id), qty })).filter((l) => l.item && l.qty > 0);
  if (!lines.length) return '<p class="muted">ยังไม่มีรายการในตะกร้า</p>';
  const total = lines.reduce((n, l) => n + l.item.price * l.qty, 0);
  return `<div class="cafe-cart-list">
    ${lines.map(({ item, qty }) => `<div class="cafe-cart-line">
      ${cafeImg(item, 'cafe-cart-img')}
      <div class="cafe-cart-info"><b>${esc(item.name)}</b><small>${cafePrice(item.price)}${item.unit ? ' / ' + esc(item.unit) : ''}</small></div>
      <div class="cafe-qty">
        <button type="button" data-action="cafe-qty" data-id="${esc(item.id)}" data-delta="-1" aria-label="ลดจำนวน">−</button>
        <span>${qty}</span>
        <button type="button" data-action="cafe-qty" data-id="${esc(item.id)}" data-delta="1" aria-label="เพิ่มจำนวน">+</button>
      </div>
      <b class="cafe-cart-sum">${cafePrice(item.price * qty)}</b>
      <button type="button" class="cafe-remove" data-action="cafe-remove" data-id="${esc(item.id)}" aria-label="ลบสินค้า">${icon('trash2', 'sm')}</button>
    </div>`).join('')}
    <div class="cafe-cart-total"><span>ยอดรวม</span><b>${cafePrice(total)}</b></div>
    <p class="muted small">${esc(CAFE_DEMO_NOTE)}</p>
  </div>`;
}
function cafeCartOpen() {
  if (document.getElementById('cafeCartBody')) return;
  openModal({
    title: 'ตะกร้าสินค้า',
    body: `<div id="cafeCartBody">${cafeCartHtml()}</div>
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn ghost" data-action="close-modal">ปิด</button>
        <button type="button" class="btn primary" id="cafeCheckout" data-action="cafe-checkout" ${cafeCount() ? '' : 'disabled'}>ดำเนินการต่อ</button></div>`,
  });
}
function cafeCartRefresh() {
  const body = document.getElementById('cafeCartBody');
  if (body) body.innerHTML = cafeCartHtml();
  const btn = document.getElementById('cafeCheckout');
  if (btn) btn.disabled = !cafeCount();
  const count = document.querySelector('.cafe-count');
  if (count) count.textContent = String(cafeCount());
}
ACTIONS['cafe-qty'] = (el) => {
  const id = el.dataset.id;
  S.cafeCart[id] = Math.max(0, (S.cafeCart[id] || 0) + Number(el.dataset.delta));
  if (!S.cafeCart[id]) delete S.cafeCart[id];
  cafeCartRefresh();
};
ACTIONS['cafe-remove'] = (el) => {
  delete S.cafeCart[el.dataset.id];
  cafeCartRefresh();
};
ACTIONS['cafe-checkout'] = () => {
  closeAllModals();
  toast('ยังไม่เปิดระบบชำระเงิน (ข้อมูลสาธิต)');
};
ACTIONS['cafe-add'] = (el) => {
  S.cafeCart[el.dataset.id] = (S.cafeCart[el.dataset.id] || 0) + 1;
  const count = document.querySelector('.cafe-count');
  if (count) count.textContent = String(cafeCount());
  const p = cafeItem(el.dataset.id);
  toast(p ? `เพิ่ม “${p.name}” ลงตะกร้าแล้ว` : 'เพิ่มลงตะกร้าแล้ว');
};

// Single click opens the cart after a short wait; a second click inside that wait is a double click
// and opens the private PIN popup instead (so the cart never opens behind it).
const CART_DBL_MS = 280;
let cartClicks = 0;
let cartClickTimer = 0;
document.addEventListener('click', (e) => {
  const btn = e.target.closest && e.target.closest('[data-action="shop-cart"]');
  if (!btn) return;
  if (cartTouchFired) { cartTouchFired = false; return; }
  cartClicks += 1;
  if (cartClicks === 1) {
    clearTimeout(cartClickTimer);
    cartClickTimer = setTimeout(() => { cartClicks = 0; cafeCartOpen(); }, CART_DBL_MS);
  } else {
    clearTimeout(cartClickTimer);
    cartClicks = 0;
    if (!document.querySelector('.overlay')) shopPrivateEntry();
  }
}, false);

// Touch: a 2-second press is the alternative to a double tap (double taps are unreliable on phones).
const CART_PRESS_MS = 2000;
let cartPressTimer = 0;
let cartTouchFired = false;
document.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' || !e.target.closest || !e.target.closest('[data-action="shop-cart"]')) return;
  clearTimeout(cartPressTimer);
  cartPressTimer = setTimeout(() => {
    cartTouchFired = true;
    clearTimeout(cartClickTimer);
    cartClicks = 0;
    if (!document.querySelector('.overlay')) shopPrivateEntry();
  }, CART_PRESS_MS);
});
['pointerup', 'pointercancel'].forEach((t) => document.addEventListener(t, () => clearTimeout(cartPressTimer)));

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

// The private entry: with no PIN yet, the first visit sets one; otherwise the PIN is asked.
async function shopPrivateEntry() {
  const st = await refreshPriv().catch(() => null);
  if (!st) { toast('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่', 'err'); return; }
  if (st.unlocked) { enterPrivate(st); return; }
  privPopup(st.hasPin ? 'unlock' : 'setup');
}
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
