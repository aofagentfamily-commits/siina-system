'use strict';
// Rich text from the template editor must become safe Telegram HTML: only b, i, u, s and http(s) links,
// every other character escaped, and list items written as readable lines.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'siina-tpl-'));
process.env.APP_SECRET = 'templates-test-secret-0123456789abcdefgh';
const tpl = require('../server/templates');

test('bold, italic, underline and strike map to Telegram tags', () => {
  assert.equal(tpl.telegramHtml('<b>หนา</b> <i>เอียง</i> <u>ใต้</u> <s>ฆ่า</s>'), '<b>หนา</b> <i>เอียง</i> <u>ใต้</u> <s>ฆ่า</s>');
});

test('text is escaped and unknown tags are dropped', () => {
  assert.equal(tpl.telegramHtml('<script>x</script> &lt;b&gt; a &amp; b'), 'x &lt;b&gt; a &amp; b');
});

test('only http and https links are kept', () => {
  assert.equal(tpl.telegramHtml('<a href="javascript:alert(1)">no</a> <a href="https://example.com/?a=1&amp;b=2">yes</a>'),
    'no <a href="https://example.com/?a=1&amp;b=2">yes</a>');
});

test('list items become readable lines', () => {
  const plain = tpl.plainFromHtml('<ul><li>หนึ่ง</li><li>สอง</li></ul>');
  assert.equal(plain, '• หนึ่ง\n• สอง');
});

test('stored html keeps only the whitelist', () => {
  const stored = tpl.storedHtml('<div><b>หนา</b><span style="color:red">x</span></div>');
  assert.ok(!stored.includes('span'));
  assert.ok(!stored.includes('style'));
  assert.ok(stored.includes('<b>หนา</b>'));
});
