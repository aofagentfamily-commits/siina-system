/* SIINA SYSTEM — daily dashboard (หน้าแรก). Every widget loads on its own: one slow or failing source
   shows its own error state and never blocks the page. Numbers come from the database or from the
   sources named on each widget; nothing is made up. */
'use strict';


function homeDateTh() {
  try {
    return new Intl.DateTimeFormat('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: S.tz || 'Asia/Bangkok' }).format(new Date());
  } catch (_) { return ''; }
}
function homeTime(iso) {
  return iso ? new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: S.tz || 'Asia/Bangkok' }) : '';
}
function homeSkel(lines = 3) {
  return `<div class="hw-skel">${'<span></span>'.repeat(lines)}</div>`;
}
function homeErr(msg) {
  return `<div class="hw-err">${icon('alert', 'sm')} <span>${esc(msg)}</span></div>`;
}

// ---------------------------------------------------------------- banner and summary cards
function homeBannerHtml() {
  return `<section class="home-banner">
    <div class="home-banner-text">
      <span class="home-date">${esc(homeDateTh())}</span>
      <h1>ยินดีต้อนรับสู่ SIINA SYSTEM <span class="wave" aria-hidden="true">👋</span></h1>
      <p>ศูนย์กลางการทำงาน จัดการโปรเจ็กต์ ข้อมูล และทุกเรื่องสำคัญในที่เดียว</p>
    </div>
    <div class="home-banner-mascot">${`<img src="/assets/welcome-egg.png" width="200" height="170" alt="" decoding="async">`}</div>
    <span class="home-spark s1" aria-hidden="true"></span><span class="home-spark s2" aria-hidden="true"></span><span class="home-spark s3" aria-hidden="true"></span>
  </section>`;
}
function homeCardsHtml(d, todayTasks, todayAppts) {
  const card = (href, ic, n, label, sub) => `<a class="home-card" href="${href}">
      <span class="home-card-ic">${icon(ic)}</span>
      <div><b class="home-card-n">${n == null ? '—' : n}</b><span class="home-card-l">${esc(label)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}</div>
    </a>`;
  return `<section class="home-cards">
    ${card('#/summary', 'bell', d.unreadImportant, 'ข้อความสำคัญที่ยังไม่ได้อ่าน')}
    ${card('#/projects', 'folder', d.projectsTotal, 'โปรเจ็กต์ทั้งหมด')}
    ${card('#/projects', 'chart', d.projectsInProgress, 'กำลังดำเนินการ')}
    ${card('#/calendar', 'calendar', todayAppts, 'นัดหมายวันนี้')}
    ${card('#home-tasks', 'check2', todayTasks, 'งานที่ต้องทำ')}
  </section>`;
}

// ---------------------------------------------------------------- weather
async function homeWeatherLoad() {
  const box = document.getElementById('hwWeather');
  if (!box) return;
  box.innerHTML = homeSkel(4);
  try {
    const w = await apiGet('/api/dashboard/weather');
    if (!w.ok) { box.innerHTML = homeErr(w.error); return; }
    box.innerHTML = `<div class="hw-weather-main">
        <div class="hw-weather-temp"><b>${Math.round(w.temperature)}<span>°C</span></b><p>${esc(w.condition)}</p></div>
        <div class="hw-weather-facts">
          <div>${icon('users', 'sm')} รู้สึกเหมือน ${Math.round(w.feelsLike)}°C</div>
          <div>${icon('globe', 'sm')} ความชื้น ${Math.round(w.humidity)}%</div>
          <div>${icon('zap', 'sm')} ลม ${Math.round(w.windKmh)} กม./ชม.</div>
          <div>${icon('shield', 'sm')} UV ${w.uvIndex == null ? '—' : Math.round(w.uvIndex)}</div>
          <div>${icon('bookmark', 'sm')} โอกาสฝน ${w.rainChance == null ? '—' : w.rainChance + '%'}</div>
        </div></div>
      <div class="hw-foot"><small>${esc(w.place)} · อัปเดต ${esc(homeTime(w.updatedAt))} · แหล่ง Open-Meteo</small>
        <button class="hw-mini" data-action="home-weather-refresh">${icon('refresh', 'sm')} รีเฟรช</button></div>`;
  } catch (err) { box.innerHTML = homeErr('ดึงข้อมูลอากาศไม่สำเร็จ ลองอีกครั้งภายหลัง'); }
}
ACTIONS['home-weather-refresh'] = () => homeWeatherLoad();
ACTIONS['home-place'] = async () => {
  const p = await apiGet('/api/dashboard/prefs');
  openModal({
    title: 'เลือกพื้นที่ดูอากาศ',
    body: `<div class="stack">
      <p class="muted small">เลือกจังหวัดที่ใช้บ่อย หรือค้นหาจังหวัดอื่น ระบบจะจำไว้ในบัญชีของคุณ</p>
      <div class="hw-places">${p.places.map((n) => `<button class="hw-place ${p.place.name === n ? 'is-on' : ''}" data-action="home-place-set" data-name="${esc(n)}">${esc(n)}</button>`).join('')}</div>
      <label class="field"><span>ค้นหาจังหวัดหรือเมือง</span><input class="input" id="hwPlaceQ" placeholder="พิมพ์ชื่ออย่างน้อย 2 ตัวอักษร" autocomplete="off"></label>
      <div id="hwPlaceRes" class="hw-places"></div></div>`,
    onMount: (modal) => {
      const input = modal.querySelector('#hwPlaceQ');
      let t = 0;
      input.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(async () => {
          const res = modal.querySelector('#hwPlaceRes');
          const r = await apiGet('/api/dashboard/places?q=' + encodeURIComponent(input.value)).catch(() => ({ items: [] }));
          res.innerHTML = (r.items || []).map((it) => `<button class="hw-place" data-action="home-place-set" data-lat="${it.lat}" data-lon="${it.lon}" data-label="${esc(it.name)}">${esc(it.name)}</button>`).join('')
            || (input.value.trim().length >= 2 ? '<small class="muted">ไม่พบพื้นที่นี้</small>' : '');
        }, 350);
      });
    },
  });
};
ACTIONS['home-place-set'] = async (el) => {
  const body = el.dataset.lat
    ? { place: { name: el.dataset.label, lat: Number(el.dataset.lat), lon: Number(el.dataset.lon) } }
    : { place: { name: el.dataset.name } };
  try {
    await apiPut('/api/dashboard/prefs', body);
    closeAllModals();
    homeWeatherLoad();
  } catch (err) { toast(err.message, 'err'); }
};

// ---------------------------------------------------------------- gold (entered with its source)
async function homeGoldLoad() {
  const box = document.getElementById('hwGold');
  if (!box) return;
  box.innerHTML = homeSkel(4);
  try {
    const g = await apiGet('/api/dashboard/gold');
    if (g.status !== 'ok') {
      box.innerHTML = `<p class="hw-empty">ยังไม่มีข้อมูลราคาทองคำ</p>
        <button class="hw-mini primary" data-action="home-gold-new">${icon('plus', 'sm')} กรอกราคาวันนี้</button>
        <small class="hw-foot-note">ราคาต้องมาจากแหล่งประกาศจริง ระบบจะไม่แสดงตัวเลขตัวอย่างแทน</small>`;
      return;
    }
    box.innerHTML = `<div class="hw-gold-grid">
        <div class="hw-gold-row"><span>ทองคำแท่ง 96.5%</span>
          <div><small>ราคารับซื้อ</small><b>${g.bar.buy.toLocaleString('th-TH')} บาท</b></div>
          <div><small>ราคาขายออก</small><b class="hot">${g.bar.sell.toLocaleString('th-TH')} บาท</b></div></div>
        <div class="hw-gold-row"><span>ทองรูปพรรณ 96.5%</span>
          <div><small>ราคารับซื้อ</small><b>${g.jewelry.buy.toLocaleString('th-TH')} บาท</b></div>
          <div><small>ราคาขายออก</small><b class="hot">${g.jewelry.sell.toLocaleString('th-TH')} บาท</b></div></div>
      </div>
      <div class="hw-foot"><small>${esc(g.unit)} · วันที่ ${esc(g.day)} · บันทึก ${esc(homeTime(g.updatedAt))}<br>แหล่งข้อมูล: ${esc(g.source)}</small>
        <button class="hw-mini" data-action="home-gold-new">${icon('edit', 'sm')} แก้ไขราคา</button></div>`;
  } catch (err) { box.innerHTML = homeErr('โหลดราคาทองคำไม่สำเร็จ'); }
}
ACTIONS['home-gold-new'] = () => {
  const today = todayStr();
  openModal({
    title: 'ราคาทองคำวันนี้',
    body: `<form data-form="home-gold" class="stack">
      <p class="muted small">กรอกราคาจากแหล่งประกาศที่ระบุด้านล่าง หน่วยเป็นบาทต่อทองคำหนัก 1 บาท (96.5%)</p>
      <label class="field"><span>วันที่</span><input class="input" type="date" name="day" value="${today}" required></label>
      <div class="form-grid">
        <label class="field"><span>ทองคำแท่ง รับซื้อ</span><input class="input" type="number" name="barBuy" min="1" required></label>
        <label class="field"><span>ทองคำแท่ง ขายออก</span><input class="input" type="number" name="barSell" min="1" required></label>
        <label class="field"><span>ทองรูปพรรณ รับซื้อ</span><input class="input" type="number" name="jewelBuy" min="1" required></label>
        <label class="field"><span>ทองรูปพรรณ ขายออก</span><input class="input" type="number" name="jewelSell" min="1" required></label>
      </div>
      <label class="field"><span>แหล่งที่มาของราคา *</span><input class="input" name="source" maxlength="120" required placeholder="เช่น สมาคมค้าทองคำ (ประกาศ 09:30 น.)"></label>
      <p class="small" data-role="form-error"></p>
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn ghost" data-action="close-modal">ยกเลิก</button>
        <button type="submit" class="btn primary">บันทึก</button></div></form>`,
  });
};
FORMS['home-gold'] = async (form) => {
  const v = (n) => form.querySelector(`[name="${n}"]`).value;
  const body = { day: v('day'), barBuy: v('barBuy'), barSell: v('barSell'), jewelBuy: v('jewelBuy'), jewelSell: v('jewelSell'), source: v('source').trim() };
  try {
    await busy(form.querySelector('[type="submit"]'), () => apiPost('/api/dashboard/gold', body));
    closeAllModals();
    toast('บันทึกราคาทองคำแล้ว');
    homeGoldLoad();
  } catch (err) { setFormError(form, err.message); }
};

// ---------------------------------------------------------------- calendar and tasks (existing data)
function homeCalendarHtml(d) {
  const tz = S.tz || 'Asia/Bangkok';
  const now = new Date();
  const monthName = new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric', timeZone: tz }).format(now);
  const todayDay = Number(new Intl.DateTimeFormat('en-US', { day: 'numeric', timeZone: tz }).format(now));
  const first = new Date(now.getFullYear(), now.getMonth(), 1).getDay();
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < first; i += 1) cells.push('<span></span>');
  for (let day = 1; day <= days; day += 1) cells.push(`<span class="${day === todayDay ? 'is-today' : ''}">${day}</span>`);
  const list = (d.todayEvents || []).map((e) => `<button class="home-ev" data-action="home-event" data-id="${esc(e.id)}">
      <span class="home-ev-time">${esc(e.startTime || 'ทั้งวัน')}${e.endTime ? ' – ' + esc(e.endTime) : ''}</span>
      <b class="ellipsis">${esc(e.title)}</b></button>`).join('');
  return `<div class="home-cal-head"><b>${esc(monthName)}</b>
      <a class="home-pill" href="#/calendar">ดูปฏิทินทั้งหมด ${icon('chevRight', 'sm')}</a></div>
    <div class="home-cal-grid">${['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].map((w) => `<em>${w}</em>`).join('')}${cells.join('')}</div>
    <div class="home-cal-list">${list || '<p class="hw-empty">วันนี้ยังไม่มีนัดหมาย</p>'}</div>`;
}
ACTIONS['home-event'] = (el) => openEventDetail(el.dataset.id);

function homeTasksHtml(d) {
  const tasks = (d.todayEvents || []).filter((e) => ['todo', 'work', 'deadline'].includes(e.category));
  const rows = tasks.map((e) => `<label class="home-task">
      <input type="checkbox" data-change="home-task" data-id="${esc(e.id)}">
      <span class="ellipsis">${esc(e.title)}</span>
      <small>${esc(e.startTime || '')}</small></label>`).join('');
  return `<div class="home-tasks-list">${rows || '<p class="hw-empty">วันนี้ไม่มีงานที่ต้องทำ</p>'}</div>
    <button class="home-add" data-action="home-task-new">${icon('plus', 'sm')} เพิ่มงาน</button>`;
}
document.addEventListener('change', async (e) => {
  if (!e.target.dataset || e.target.dataset.change !== 'home-task') return;
  const box = e.target;
  box.disabled = true;
  try {
    await apiPost('/api/dashboard/tasks/' + box.dataset.id + '/done', { done: box.checked });
    toast('อัปเดตงานแล้ว');
    homeRefreshCounts();
  } catch (err) {
    box.checked = !box.checked;
    toast(err.message, 'err');
  } finally { box.disabled = false; }
});
ACTIONS['home-task-new'] = () => openEventForm({ startDate: todayStr() });

// ---------------------------------------------------------------- news (Google News RSS, real links and dates)
async function homeNewsLoad() {
  const box = document.getElementById('hwNews');
  if (!box) return;
  box.innerHTML = homeSkel(5);
  try {
    const n = await apiGet('/api/dashboard/news');
    if (!n.ok) { box.innerHTML = homeErr(n.error); return; }
    if (!n.items.length) { box.innerHTML = `<p class="hw-empty">${esc(n.note || 'ยังไม่มีข่าวในหมวดที่เลือก')}</p>`; return; }
    box.innerHTML = n.items.map((it) => `<a class="home-news" href="${esc(it.link)}" target="_blank" rel="noopener noreferrer">
        <span class="home-news-ic">${icon('megaphone', 'sm')}</span>
        <div><b class="ellipsis">${esc(it.title)}</b>
        <small>${esc(it.topic)}${it.source ? ' · ' + esc(it.source) : ''} · ${esc(it.publishedAt ? new Date(it.publishedAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: S.tz || 'Asia/Bangkok' }) : '')}</small></div>
        ${icon('chevRight', 'sm')}</a>`).join('');
  } catch (err) { box.innerHTML = homeErr('ดึงข่าวไม่สำเร็จ ลองอีกครั้งภายหลัง'); }
}
ACTIONS['home-news-settings'] = async () => {
  const p = await apiGet('/api/dashboard/prefs');
  openModal({
    title: 'หมวดข่าวที่สนใจ',
    body: `<form data-form="home-news" class="stack">
      ${p.newsTopics.map((t) => `<label class="tgg-check"><input type="checkbox" name="topic" value="${esc(t.k)}" ${p.topics.includes(t.k) ? 'checked' : ''}> ${esc(t.label)}</label>`).join('')}
      <label class="field"><span>จำนวนข่าวที่แสดง</span><input class="input" type="number" name="limit" min="1" max="10" value="${p.newsLimit}"></label>
      <p class="small" data-role="form-error"></p>
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn ghost" data-action="close-modal">ยกเลิก</button>
        <button type="submit" class="btn primary">บันทึก</button></div></form>`,
  });
};
FORMS['home-news'] = async (form) => {
  const topics = [...form.querySelectorAll('input[name="topic"]:checked')].map((i) => i.value);
  try {
    await busy(form.querySelector('[type="submit"]'), () => apiPut('/api/dashboard/prefs', { topics, newsLimit: form.querySelector('[name="limit"]').value }));
    closeAllModals();
    homeNewsLoad();
  } catch (err) { setFormError(form, err.message); }
};

// ---------------------------------------------------------------- page
async function homeRefreshCounts() {
  try {
    const d = await apiGet('/api/dashboard');
    const todayTasks = (d.todayEvents || []).filter((e) => ['todo', 'work', 'deadline'].includes(e.category)).length;
    const todayAppts = (d.todayEvents || []).filter((e) => e.category === 'appointment').length;
    const cards = document.getElementById('hwCards');
    if (cards) cards.outerHTML = homeCardsHtml(d, todayTasks, todayAppts).replace('<section class="home-cards"', '<section class="home-cards" id="hwCards"');
    const tasks = document.getElementById('hwTasks');
    if (tasks) tasks.innerHTML = homeTasksHtml(d);
  } catch (err) { /* keep what is shown */ }
}

async function renderHomeDash() {
  setPageHead(PAGE_TITLES.home, 'ภาพรวมงานและข้อความสำคัญของคุณ');
  fillPage(`<div class="home-dash" id="homeDash">
    ${homeBannerHtml()}
    <div id="hwCardsWrap">${homeSkel(2)}</div>
    <div class="home-row2">
      <section class="home-panel home-weather"><div class="home-panel-head"><h3>${icon('globe', 'sm')} สภาพอากาศวันนี้</h3>
        <button class="hw-mini" data-action="home-place">${icon('edit', 'sm')} เปลี่ยนพื้นที่</button></div><div id="hwWeather"></div></section>
      <section class="home-panel home-gold"><div class="home-panel-head"><h3>${icon('star', 'sm')} ราคาทองคำวันนี้</h3></div><div id="hwGold"></div></section>
    </div>
    <div class="home-row3">
      <section class="home-panel home-cal"><div class="home-panel-head"><h3>${icon('calendar', 'sm')} ปฏิทินวันนี้</h3></div><div id="hwCal">${homeSkel(3)}</div></section>
      <section class="home-panel home-tasks" id="home-tasks"><div class="home-panel-head"><h3>${icon('check2', 'sm')} งานที่ต้องทำวันนี้</h3></div><div id="hwTasks">${homeSkel(3)}</div></section>
      <section class="home-panel home-news-panel"><div class="home-panel-head"><h3>${icon('megaphone', 'sm')} ข่าวและอัปเดต</h3>
        <button class="hw-mini" data-action="home-news-settings">${icon('settings', 'sm')} หมวดข่าว</button></div><div id="hwNews"></div></section>
    </div>
  </div>`);

  // Each part loads on its own.
  apiGet('/api/dashboard').then((d) => {
    const todayTasks = (d.todayEvents || []).filter((e) => ['todo', 'work', 'deadline'].includes(e.category)).length;
    const todayAppts = (d.todayEvents || []).filter((e) => e.category === 'appointment').length;
    const wrap = document.getElementById('hwCardsWrap');
    if (wrap) wrap.innerHTML = homeCardsHtml(d, todayTasks, todayAppts).replace('<section class="home-cards"', '<section class="home-cards" id="hwCards"');
    const cal = document.getElementById('hwCal');
    if (cal) cal.innerHTML = homeCalendarHtml(d);
    const tasks = document.getElementById('hwTasks');
    if (tasks) tasks.innerHTML = homeTasksHtml(d);
  }).catch(() => {
    const wrap = document.getElementById('hwCardsWrap');
    if (wrap) wrap.innerHTML = homeErr('โหลดภาพรวมไม่สำเร็จ ลองรีเฟรชหน้า');
  });
  homeWeatherLoad();
  homeGoldLoad();
  homeNewsLoad();
}
