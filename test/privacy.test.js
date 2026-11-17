'use strict';
// Private area: the PIN is set once, changing or turning it off needs proof, and the unlock is per session.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'siina-priv-'));
process.env.DATA_DIR = dir;
process.env.APP_SECRET = 'priv-test-secret-0123456789abcdefghijklmnop';

const { db } = require('../server/db');
const auth = require('../server/auth');
const privacy = require('../server/privacy');
const u = require('../server/util');

const user = { id: 'u-priv', email: 'owner@example.com' };
const now = u.nowIso();
db.prepare('INSERT INTO users (id, email, display_name, password_hash, created_at, updated_at) VALUES (?,?,?,?,?,?)')
  .run(user.id, user.email, 'owner', auth.hashPassword('owner-pass-123456'), now, now);
// two sessions of the same account: one is this device, one is another device
const tokenA = 'token-device-a-' + 'x'.repeat(20);
const tokenB = 'token-device-b-' + 'y'.repeat(20);
for (const t of [tokenA, tokenB]) {
  db.prepare('INSERT INTO login_sessions (id, user_id, token_hash, created_at, expires_at) VALUES (?,?,?,?,?)')
    .run(u.uid(), user.id, u.sha256(t), now, new Date(Date.now() + 86400000).toISOString());
}
const expectStatus = (fn, status, code) => assert.throws(fn, (err) => err.status === status && (!code || err.code === code));

test('the area is locked until a PIN is set on this device', () => {
  assert.equal(privacy.isUnlocked(user, tokenA), false);
  const st = privacy.setPin(user, tokenA, { pin: '482915', confirm: '482915' });
  assert.equal(st.unlocked, true);
  assert.equal(st.hasPin, true);
  assert.equal(privacy.isUnlocked(user, tokenB), false, 'the other device stays locked');
});

test('the PIN is stored hashed and a wrong PIN is refused', () => {
  const stored = db.prepare('SELECT pin_hash FROM private_access WHERE user_id = ?').get(user.id).pin_hash;
  assert.ok(stored.startsWith('scrypt$') && !stored.includes('482915'));
  expectStatus(() => privacy.unlock(user, tokenB, '000000'), 403, 'BAD_PIN');
  assert.equal(privacy.unlock(user, tokenB, '482915').unlocked, true);
});

test('changing the PIN needs the current PIN or the account password', () => {
  expectStatus(() => privacy.setPin(user, tokenA, { pin: '111222', confirm: '111222' }), 403, 'NEED_PROOF');
  expectStatus(() => privacy.setPin(user, tokenA, { pin: '111222', confirm: '111222', currentPin: '000000' }), 403, 'BAD_PIN');
  privacy.setPin(user, tokenA, { pin: '111222', confirm: '111222', password: 'owner-pass-123456' });
  assert.equal(privacy.unlock(user, tokenB, '111222').unlocked, true);
});

test('turning the PIN off needs proof; the session length must be an allowed choice', () => {
  expectStatus(() => privacy.setEnabled(user, tokenA, { enabled: false }), 403, 'NEED_PROOF');
  assert.equal(privacy.setEnabled(user, tokenA, { enabled: false, currentPin: '111222' }).enabled, false);
  assert.equal(privacy.isUnlocked(user, tokenB), true, 'with the PIN off the area opens');
  privacy.setEnabled(user, tokenA, { enabled: true });
  expectStatus(() => privacy.setSessionMinutes(user, tokenA, { minutes: 7 }), 400, 'VALIDATION');
  assert.equal(privacy.setSessionMinutes(user, tokenA, { minutes: 60 }).sessionMinutes, 60);
});

test('locking forgets the unlock; signing out other devices keeps this one', () => {
  privacy.lock(tokenA);
  assert.equal(privacy.isUnlocked(user, tokenA), false);
  privacy.unlock(user, tokenA, '111222');
  const r = privacy.logoutOthers(user, tokenA);
  assert.equal(r.signedOut, 1);
  assert.equal(privacy.isUnlocked(user, tokenA), true);
});
