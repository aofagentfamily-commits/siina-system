'use strict';
// Home widgets: news parsing keeps real links and dates only; gold entries need a number and a source;
// preferences accept only known topics and places. The network is not called in these tests.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'siina-live-'));
process.env.DATA_DIR = dir;
process.env.APP_SECRET = 'live-test-secret-0123456789abcdefghijklmnop';

const { db } = require('../server/db');
const live = require('../server/live');
const u = require('../server/util');

const owner = { id: 'u-live', email: 'owner@example.com', timezone: 'Asia/Bangkok' };
const now = u.nowIso();
db.prepare('INSERT INTO users (id, email, display_name, created_at, updated_at) VALUES (?,?,?,?,?)').run(owner.id, owner.email, 'owner', now, now);

test('news items keep their real title, link, date and source; items without a link are dropped', () => {
  const xml = `<rss><channel>
    <item><title>ข่าวทดสอบ &amp; ตัวอย่าง - แหล่งข่าว</title><link>https://example.com/a</link>
      <pubDate>Mon, 16 Nov 2026 08:00:00 GMT</pubDate><source url="https://example.com">แหล่งข่าว</source></item>
    <item><title>ไม่มีลิงก์</title><link>ftp://x</link><pubDate>Mon, 16 Nov 2026 08:00:00 GMT</pubDate></item>
  </channel></rss>`;
  const items = live.parseRss(xml);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'ข่าวทดสอบ & ตัวอย่าง - แหล่งข่าว');
  assert.equal(items[0].link, 'https://example.com/a');
  assert.equal(items[0].source, 'แหล่งข่าว');
  assert.equal(items[0].publishedAt, '2026-11-16T08:00:00.000Z');
});

test('gold: a price needs a day, a number above zero and a named source', () => {
  assert.deepEqual(live.goldLatest(owner), { status: 'none' });
  assert.throws(() => live.goldAdd(owner, { day: '2026-11-17', barBuy: 0, barSell: 1, jewelBuy: 1, jewelSell: 1, source: 'x' }), (e) => e.status === 400);
  assert.throws(() => live.goldAdd(owner, { day: '17/11/2026', barBuy: 1, barSell: 1, jewelBuy: 1, jewelSell: 1, source: 'x' }), (e) => e.status === 400);
  assert.throws(() => live.goldAdd(owner, { day: '2026-11-17', barBuy: 1, barSell: 1, jewelBuy: 1, jewelSell: 1, source: '' }), (e) => e.status === 400);
  const g = live.goldAdd(owner, { day: '2026-11-17', barBuy: 41350, barSell: 41450, jewelBuy: 40588, jewelSell: 42050, source: 'กรอกเองจากแหล่งที่ระบุ' });
  assert.equal(g.status, 'ok');
  assert.equal(g.bar.sell, 41450);
  assert.equal(g.source, 'กรอกเองจากแหล่งที่ระบุ');
});

test('preferences accept only known news topics and known or valid places', () => {
  const p = live.setPrefs(owner, { topics: ['ai', 'bogus'], newsLimit: 3, place: { name: 'เชียงใหม่' } });
  assert.deepEqual(p.topics, ['ai']);
  assert.equal(p.newsLimit, 3);
  assert.equal(p.place.name, 'เชียงใหม่');
  assert.throws(() => live.setPrefs(owner, { place: { name: 'ไม่มี', lat: 'x', lon: 'y' } }), (e) => e.status === 400);
});

test('a task is marked done only for the account that owns it', () => {
  const other = { id: 'u-live-other', email: 'other@example.com', timezone: 'Asia/Bangkok' };
  db.prepare('INSERT INTO users (id, email, display_name, created_at, updated_at) VALUES (?,?,?,?,?)').run(other.id, other.email, 'other', now, now);
  db.prepare(`INSERT INTO calendar_events (id, user_id, title, category, start_date, start_at, status, created_at, updated_at)
    VALUES ('ev-live', ?, 'งานทดสอบ', 'todo', '2026-11-17', '2026-11-17T09:00:00.000Z', 'pending', ?, ?)`).run(owner.id, now, now);
  assert.throws(() => live.setTaskDone(other, 'ev-live', true), (e) => e.status === 404);
  live.setTaskDone(owner, 'ev-live', true);
  assert.equal(db.prepare("SELECT status FROM calendar_events WHERE id = 'ev-live'").get().status, 'done');
});
