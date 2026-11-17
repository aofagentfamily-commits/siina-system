'use strict';
// Live widgets on the home page: weather (Open-Meteo), news (Google News RSS), gold prices (entered by the
// account owner with a named source), dashboard preferences and quick task status. External calls are
// cached, time-limited, and never break the page: a failed source returns an error state, not a made-up value.
const { db } = require('./db');
const u = require('./util');

const CACHE_MS = 30 * 60 * 1000;
const TIMEOUT_MS = 8000;
const cache = new Map(); // key -> { at, value }

const PLACES = [
  { name: 'กรุงเทพมหานคร', lat: 13.7563, lon: 100.5018 },
  { name: 'สมุทรปราการ', lat: 13.5991, lon: 100.5998 },
  { name: 'สระแก้ว', lat: 13.824, lon: 102.0646 },
  { name: 'เชียงใหม่', lat: 18.7883, lon: 98.9853 },
  { name: 'ภูเก็ต', lat: 7.8804, lon: 98.3923 },
  { name: 'ขอนแก่น', lat: 16.4419, lon: 102.8360 },
];
const NEWS_TOPICS = [
  { k: 'tech', label: 'เทคโนโลยี', q: 'เทคโนโลยี' },
  { k: 'ai', label: 'AI และเครื่องมือทำงาน', q: 'AI เครื่องมือทำงาน' },
  { k: 'software', label: 'โปรแกรมและซอฟต์แวร์', q: 'โปรแกรม ซอฟต์แวร์' },
  { k: 'economy', label: 'ข่าวเศรษฐกิจ', q: 'เศรษฐกิจ' },
  { k: 'gold', label: 'ราคาทองคำ', q: 'ราคาทองคำ' },
  { k: 'general', label: 'ข่าวทั่วไป', q: 'ข่าวน่าสนใจ' },
];
const WMO = { 0: 'ท้องฟ้าแจ่มใส', 1: 'มีเมฆน้อย', 2: 'มีเมฆบางส่วน', 3: 'มีเมฆมาก', 45: 'มีหมอก', 48: 'หมอกน้ำค้างแข็ง',
  51: 'ฝนปรอยเล็กน้อย', 53: 'ฝนปรอย', 55: 'ฝนปรอยหนา', 61: 'ฝนเล็กน้อย', 63: 'ฝนปานกลาง', 65: 'ฝนหนัก',
  80: 'ฝนฟ้าคะนองเป็นช่วง', 81: 'ฝนฟ้าคะนอง', 82: 'ฝนฟ้าคะนองรุนแรง', 95: 'พายุฝนฟ้าคะนอง', 96: 'พายุฝนฟ้าคะนองมีลูกเห็บ', 99: 'พายุฝนฟ้าคะนองมีลูกเห็บหนัก' };

async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error('แหล่งข้อมูลตอบกลับผิดปกติ');
  return res.json();
}
function cached(key, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return Promise.resolve(hit.value);
  return fn().then((value) => { cache.set(key, { at: Date.now(), value }); return value; });
}

// ---------------------------------------------------------------- preferences
function prefsRow(userId) {
  return db.prepare('SELECT * FROM dashboard_prefs WHERE user_id = ?').get(userId) || null;
}
function prefs(user) {
  const r = prefsRow(user.id);
  const place = r && r.weather_place ? JSON.parse(r.weather_place) : PLACES[0];
  const topics = r && r.news_topics ? JSON.parse(r.news_topics) : NEWS_TOPICS.map((t) => t.k);
  return { place, topics, newsLimit: r ? r.news_limit : 5, places: PLACES.map((p) => p.name), newsTopics: NEWS_TOPICS.map((t) => ({ k: t.k, label: t.label })) };
}
function setPrefs(user, body = {}) {
  const cur = prefs(user);
  let place = cur.place;
  if (body.place) {
    const found = PLACES.find((p) => p.name === body.place.name) || (Number.isFinite(body.place.lat) && Number.isFinite(body.place.lon)
      ? { name: String(body.place.name || '').slice(0, 80), lat: Number(body.place.lat), lon: Number(body.place.lon) } : null);
    if (!found || !found.name) throw new u.HttpError(400, 'ไม่รู้จักพื้นที่นี้', 'VALIDATION');
    place = found;
  }
  const topics = Array.isArray(body.topics) ? body.topics.filter((k) => NEWS_TOPICS.some((t) => t.k === k)) : cur.topics;
  const limit = body.newsLimit != null ? Math.min(10, Math.max(1, Number(body.newsLimit) || 5)) : cur.newsLimit;
  db.prepare(`INSERT INTO dashboard_prefs (user_id, weather_place, news_topics, news_limit, updated_at) VALUES (?,?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET weather_place = excluded.weather_place, news_topics = excluded.news_topics,
    news_limit = excluded.news_limit, updated_at = excluded.updated_at`)
    .run(user.id, JSON.stringify(place), JSON.stringify(topics), limit, u.nowIso());
  cache.delete('weather:' + place.lat + ',' + place.lon);
  return prefs(user);
}

// ---------------------------------------------------------------- weather (Open-Meteo, free, no key)
async function weather(user) {
  const p = prefs(user).place;
  const key = 'weather:' + p.lat + ',' + p.lon;
  const updatedAt = new Date().toISOString();
  try {
    const value = await cached(key, async () => {
      const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + p.lat + '&longitude=' + p.lon
        + '&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m'
        + '&daily=uv_index_max,precipitation_probability_max&forecast_days=1&timezone=Asia%2FBangkok';
      const j = await fetchJson(url);
      const c = j.current || {};
      const d = j.daily || {};
      return {
        place: p.name,
        temperature: c.temperature_2m,
        feelsLike: c.apparent_temperature,
        humidity: c.relative_humidity_2m,
        windKmh: c.wind_speed_10m,
        condition: WMO[c.weather_code] || 'ไม่ทราบสภาพอากาศ',
        uvIndex: d.uv_index_max ? d.uv_index_max[0] : null,
        rainChance: d.precipitation_probability_max ? d.precipitation_probability_max[0] : null,
        observedAt: c.time || null,
      };
    });
    return { ok: true, ...value, updatedAt };
  } catch (err) {
    return { ok: false, place: p.name, error: 'ดึงข้อมูลอากาศไม่สำเร็จ ลองอีกครั้งภายหลัง', updatedAt };
  }
}

async function placeSearch(q) {
  const term = String(q || '').trim().slice(0, 60);
  if (term.length < 2) return { items: [] };
  try {
    const j = await cached('geo:' + term, () => fetchJson('https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(term) + '&count=6&language=th&format=json'));
    return { items: (j.results || []).map((r) => ({ name: [r.name, r.admin1].filter(Boolean).join(', '), lat: r.latitude, lon: r.longitude })) };
  } catch (err) {
    return { items: [], error: 'ค้นหาพื้นที่ไม่สำเร็จ' };
  }
}

// ---------------------------------------------------------------- news (Google News RSS, public feed)
function decodeEntities(s) {
  return String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').trim();
}
// Reads <item> blocks: title, link, pubDate and the source name. Returns plain objects; nothing is invented.
function parseRss(xml) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(String(xml || '')))) {
    const block = m[1];
    const pick = (tag) => { const t = new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>').exec(block); return t ? decodeEntities(t[1]) : ''; };
    const link = pick('link');
    const title = pick('title');
    const pub = pick('pubDate');
    const source = pick('source');
    const date = pub ? new Date(pub) : null;
    if (!title || !/^https?:\/\//.test(link)) continue;
    items.push({ title, link, source, publishedAt: date && !isNaN(date) ? date.toISOString() : null });
  }
  return items;
}
async function news(user) {
  const p = prefs(user);
  const topics = NEWS_TOPICS.filter((t) => p.topics.includes(t.k));
  const updatedAt = new Date().toISOString();
  if (!topics.length) return { ok: true, items: [], updatedAt, note: 'ยังไม่ได้เลือกหมวดข่าว' };
  const lists = await Promise.all(topics.map(async (t) => {
    try {
      const xml = await cached('news:' + t.k, async () => {
        const res = await fetch('https://news.google.com/rss/search?q=' + encodeURIComponent(t.q) + '&hl=th&gl=TH&ceid=TH:th',
          { signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (!res.ok) throw new Error('rss');
        return res.text();
      });
      return parseRss(xml).slice(0, 5).map((it) => ({ ...it, topic: t.label }));
    } catch (err) {
      return [];
    }
  }));
  const items = lists.flat().sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || '')).slice(0, p.newsLimit);
  if (!items.length) return { ok: false, items: [], updatedAt, error: 'ดึงข่าวไม่สำเร็จ ลองอีกครั้งภายหลัง' };
  return { ok: true, items, updatedAt };
}

// ---------------------------------------------------------------- gold prices (entered with a named source)
function goldRow(userId) {
  return db.prepare('SELECT * FROM gold_prices WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').get(userId) || null;
}
function goldDto(r) {
  if (!r) return { status: 'none' };
  return {
    status: 'ok',
    day: r.day,
    bar: { buy: r.bar_buy, sell: r.bar_sell },
    jewelry: { buy: r.jewel_buy, sell: r.jewel_sell },
    unit: 'บาทต่อทองคำหนัก 1 บาท (96.5%)',
    source: r.source,
    updatedAt: r.created_at,
  };
}
function goldLatest(user) {
  return goldDto(goldRow(user.id));
}
function goldAdd(user, body = {}) {
  const num = (v, field) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0 || n > 1000000) throw new u.HttpError(400, `${field} ต้องเป็นตัวเลขมากกว่า 0`, 'VALIDATION');
    return Math.round(n);
  };
  const day = String(body.day || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new u.HttpError(400, 'วันที่ไม่ถูกต้อง', 'VALIDATION');
  const source = u.str(body.source, { max: 120, required: true, field: 'แหล่งที่มาของราคา' });
  const id = u.uid();
  db.prepare(`INSERT INTO gold_prices (id, user_id, day, bar_buy, bar_sell, jewel_buy, jewel_sell, source, created_at) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(id, user.id, day, num(body.barBuy, 'ราคารับซื้อทองคำแท่ง'), num(body.barSell, 'ราคาขายออกทองคำแท่ง'),
      num(body.jewelBuy, 'ราคารับซื้อทองรูปพรรณ'), num(body.jewelSell, 'ราคาขายออกทองรูปพรรณ'), source, u.nowIso());
  u.activity(user.id, 'create', 'gold_price', id, day);
  return goldLatest(user);
}

// ---------------------------------------------------------------- quick task status (calendar event of this account)
function setTaskDone(user, id, done) {
  const row = db.prepare('SELECT id FROM calendar_events WHERE id = ? AND user_id = ?').get(String(id), user.id);
  if (!row) throw new u.HttpError(404, 'ไม่พบรายการนี้', 'NOT_FOUND');
  db.prepare('UPDATE calendar_events SET status = ?, updated_at = ? WHERE id = ? AND user_id = ?')
    .run(done ? 'done' : 'pending', u.nowIso(), row.id, user.id);
  return { ok: true, done: !!done };
}

module.exports = { prefs, setPrefs, weather, placeSearch, parseRss, news, goldLatest, goldAdd, setTaskDone, PLACES, NEWS_TOPICS, WMO };
