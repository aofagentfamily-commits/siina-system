/* SIINA SYSTEM — Telegram chat (ห้องแชท): group list with tabs, message bubbles, jump to tagged messages, composer.
   Every user-provided string goes through esc(). Sending shows success only after the server confirms. */
'use strict';

S.chat = { groupId: null, replyTo: null, draftKey: null, draftText: null, tab: 'all', headTab: 'all',
  listQuery: '', search: '', chats: [], mentions: [], messages: [], failed: [], anchored: false, topics: [], topic: 'all' };

const CHAT_TABS = [['all', 'ทั้งหมด'], ['mention', 'มีการแท็กฉัน'], ['unread', 'ยังไม่ได้อ่าน']];
const CHAT_HEAD_TABS = [['all', 'ข้อความ'], ['important', 'สำคัญ'], ['files', 'ไฟล์'], ['links', 'ลิงก์'], ['ai', 'สรุปด้วย AI']];

function cvAvatar(c, size) {
  if (c.avatarData) return `<span class="cv-av" style="width:${size}px;height:${size}px"><img src="${esc(c.avatarData)}" alt=""></span>`;
  return `<span class="cv-av cv-av-group" style="width:${size}px;height:${size}px">${esc(initials(c.title))}</span>`;
}
// Telegram calls the "General" topic thread 1 (or no thread at all).
function topicName(threadId) {
  if (threadId == null || threadId === 1) return 'ทั่วไป';
  const t = S.chat.topics.find((x) => x.threadId === threadId);
  return t ? t.name : `หัวข้อ #${threadId}`;
}
function topicOf(m) {
  return m.threadId == null ? 1 : m.threadId;
}
function topicRowHtml() {
  if (!S.chat.topics.length) return '';
  const items = [['all', 'ทั้งหมด', '', '']].concat(S.chat.topics.map((t) => [String(t.threadId), t.name === 'General' ? 'ทั่วไป' : t.name, t.threadId, t.name]));
  const unnamed = (name) => /^หัวข้อ #/.test(name);
  return `<nav class="cv-topics" aria-label="หัวข้อในกลุ่ม">${items.map(([k, l, thread, raw]) => {
    const canRename = k !== 'all' && k !== '1';
    return `<button class="cv-topic-chip ${canRename && unnamed(raw) ? 'needs-name' : ''}" aria-selected="${S.chat.topic === k}"
      data-action="chat-topic" data-id="${esc(k)}" data-thread="${esc(thread)}" data-name="${esc(raw)}"
      title="${canRename ? 'กดอีกครั้งเมื่อเลือกอยู่เพื่อแก้ชื่อหัวข้อ' : ''}">${icon('chat', 'sm')} ${esc(l)}${canRename && unnamed(raw) ? ' · ตั้งชื่อ' : ''}</button>`;
  }).join('')}</nav>`;
}
function topicHintHtml() {
  if (!S.chat.topics.length) return '';
  const label = S.chat.topic === 'all' ? 'ทั่วไป' : topicName(Number(S.chat.topic));
  return `<small class="cv-target">ส่งไปยัง: <b>${esc(label)}</b> (เลือกจากแถบหัวข้อด้านบน)</small>`;
}

function cvTimeLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const same = new Date().toDateString() === d.toDateString();
  return same ? fmtTime(iso) : d.toLocaleDateString('th-TH', { timeZone: S.tz, day: 'numeric', month: 'short' });
}

async function renderChat(params) {
  setPageHead(PAGE_TITLES.chat, 'จัดการข้อความจากกลุ่มที่เชื่อมต่อ คัดกรอง และตอบกลับได้ในระบบเดียว');
  if (params && params.tab) S.chat.tab = params.tab;
  if (params && params.group) S.chat.groupId = params.group;
  fillPage(`<div class="card cv-loading"><span class="spinner"></span><span>กำลังโหลดข้อความ...</span></div>`);
  const [{ items: chats }, { items: mentions }] = await Promise.all([apiGet('/api/telegram/chats'), apiGet('/api/telegram/mentions')]);
  S.chat.chats = chats;
  S.chat.mentions = mentions;
  if (!chats.length) {
    fillPage(`<div class="page-head"><div><h2>ห้องแชท Telegram</h2><p>เชื่อมต่อ Telegram Bot เพื่อรวบรวมข้อความสำคัญ</p></div></div>
      <div class="card" style="text-align:center;padding:40px">${eggHtml({ size: 90 })}
        <h3 style="margin:16px 0 6px">ยังไม่มีกลุ่ม Telegram</h3>
        <p class="muted" style="margin-bottom:16px">เพิ่มบอทและกลุ่มก่อนใช้งานห้องแชท</p>
        <a class="btn primary" href="#/settings?tab=telegram">ไปที่ตั้งค่า Telegram</a></div>`);
    return;
  }
  const requested = params && params.msg ? Number(params.msg) : null;
  if (requested && params.group) S.chat.groupId = params.group;
  if (!S.chat.groupId || !chats.some((c) => c.id === S.chat.groupId)) S.chat.groupId = chats[0].id;
  const active = chats.find((c) => c.id === S.chat.groupId);
  const query = requested ? `around=${requested}&limit=60` : 'limit=80';
  const [{ items: messages }, { items: outbox }, { items: topics }] = await Promise.all([
    apiGet(`/api/telegram/groups/${active.id}/messages?${query}`),
    apiGet(`/api/telegram/groups/${active.id}/outbox`),
    apiGet(`/api/telegram/groups/${active.id}/topics`),
  ]);
  if (S.chat.lastGroupId !== active.id) { S.chat.topic = 'all'; S.chat.lastGroupId = active.id; S.chat.draft = null; }
  S.chat.topics = topics;
  await apiPost(`/api/telegram/groups/${active.id}/read`).catch(() => null);
  S.chat.messages = messages;
  S.chat.failed = outbox;
  S.chat.anchored = !!requested;
  const found = requested ? messages.some((m) => m.messageId === requested) : true;
  const mentionUnread = mentions.filter((m) => !m.read).length;
  const totalUnread = chats.reduce((n, c) => n + c.unread, 0);
  const counts = { all: chats.length, mention: mentionUnread, unread: totalUnread };
  fillPage(`
    <div class="cv-page-head">
      <div>
        <h2>ห้องแชท Telegram</h2>
        <p class="muted small">จัดการข้อความจากกลุ่มที่เชื่อมต่อ คัดกรอง และตอบกลับได้ในระบบเดียว</p>
      </div>
      <div class="cv-page-tools">
        <label class="cv-search-top">${icon('search', 'sm')}<span class="sr-only">ค้นหาข้อความหรือกลุ่ม</span>
          <input class="input" type="search" placeholder="ค้นหาข้อความ / กลุ่ม..." data-input="chat-search" value="${esc(S.chat.listQuery)}"></label>
        <a class="btn icon" href="#/settings?tab=telegram&sub=filters" title="ตัวกรองข้อความ" aria-label="ตัวกรองข้อความ">${icon('filter')}</a>
        <a class="btn primary" href="#/settings?tab=telegram">${icon('settings')} จัดการ Telegram</a>
      </div>
    </div>
    <div class="cv-layout${requested || S.chat.showMobileChat ? ' show-chat' : ''}" id="chatLayout">
      <aside class="cv-list" aria-label="รายการแชท">
        <div class="cv-tabs" role="tablist">
          ${CHAT_TABS.map(([k, l]) => `<button class="cv-tab" role="tab" aria-selected="${S.chat.tab === k}" data-action="chat-tab" data-tab="${k}">
            ${esc(l)} <span class="cv-count ${k === 'mention' && counts.mention ? 'hot' : ''}">${counts[k]}</span></button>`).join('')}
        </div>
        <div class="cv-items" id="cvItems">${chatListHtml()}</div>
      </aside>
      <section class="cv-main" aria-label="ข้อความในกลุ่ม">
        <header class="cv-head">
          <button class="btn icon ghost cv-back" data-action="chat-back" aria-label="กลับไปรายการ">${icon('chevLeft')}</button>
          ${cvAvatar(active, 46)}
          <div class="cv-head-text">
            <b class="ellipsis">${esc(active.title)}</b>
            <small>${active.status === 'unlinked' ? 'ยังไม่ได้เชื่อมต่อบอท' : active.enabled ? '<span class="cv-online">เชื่อมต่อบอทแล้ว</span>' : 'ปิดการติดตามอยู่'}</small>
          </div>
          <div class="cv-head-actions">
            <button class="btn icon ghost" disabled title="ปักหมุด: ยังไม่พร้อมใช้งาน" aria-label="ปักหมุด (ยังไม่พร้อมใช้งาน)">${icon('bookmark')}</button>
            <button class="btn icon ghost" data-action="chat-search-toggle" aria-label="ค้นหาในแชท" aria-expanded="false">${icon('search')}</button>
            <button class="btn icon ghost" data-action="chat-info" aria-label="รายละเอียดกลุ่ม">${icon('alert')}</button>
          </div>
        </header>
        <nav class="cv-headtabs" aria-label="ประเภทข้อความ">
          ${CHAT_HEAD_TABS.map(([k, l]) => `<button class="cv-htab" aria-selected="${S.chat.headTab === k}" data-action="chat-htab" data-tab="${k}">${esc(l)}</button>`).join('')}
        </nav>
        ${topicRowHtml()}
        <div class="cv-search-box" id="cvSearch" hidden>
          <input class="input" placeholder="ค้นหาในข้อความที่โหลดแล้ว" data-input="chat-msg-search" value="${esc(S.chat.search)}" aria-label="ค้นหาในแชท">
        </div>
        <div class="cv-body">
          <div class="cv-messages" id="messages" tabindex="0" aria-label="ประวัติข้อความ">${messagesHtml()}</div>
          <button class="cv-jump" id="cvJump" hidden data-action="chat-jump-next">${icon('chevDown', 'sm')} ไปที่ข้อความที่แท็กคุณ</button>
        </div>
        ${S.chat.failed.length ? `<div class="cv-failed">${S.chat.failed.map((o) => `
          <div class="row between"><span class="small" style="color:var(--danger)">ส่งไม่สำเร็จ: ${esc(o.text.slice(0, 60))}${o.error ? ' · ' + esc(o.error) : ''}</span>
          <button class="btn sm" data-action="outbox-retry" data-id="${esc(o.id)}">ส่งซ้ำ</button></div>`).join('')}</div>` : ''}
        <form class="cv-composer" data-form="chat-send" data-group="${esc(active.id)}">
          <div class="cv-reply-bar" id="cvReplyBar">${replyBarHtml()}</div>
          ${topicHintHtml()}
          <div id="cvDraft" class="cv-draft"></div>
          <div class="cv-input-row">
            <div class="cv-plus-wrap">
              <button type="button" class="cv-plus" id="cvPlus" data-action="chat-plus" aria-haspopup="menu" aria-expanded="false" aria-label="เพิ่มเครื่องมือส่งข้อความ"
                ${active.enabled && active.status !== 'unlinked' ? '' : 'disabled'}>${icon('plus')}</button>
              <div class="cv-plus-menu" id="cvPlusMenu" role="menu" hidden>
                <button type="button" role="menuitem" data-action="chat-menu-file">${icon('image')}<span>รูปภาพ / ไฟล์</span></button>
                <button type="button" role="menuitem" data-action="chat-menu-templates">${icon('file')}<span>เทมเพลตข้อความ</span></button>
                <button type="button" role="menuitem" data-action="chat-menu-stickers">${icon('heart')}<span>สติกเกอร์</span></button>
              </div>
            </div>
            <textarea class="textarea cv-input" name="text" rows="1" maxlength="4000" placeholder="พิมพ์ข้อความเพื่อตอบกลับในกลุ่ม..." ${active.enabled && active.status !== 'unlinked' ? '' : 'disabled'} aria-label="ข้อความ"></textarea>
            <button type="button" class="btn icon ghost" disabled title="อีโมจิ: ยังไม่พร้อมใช้งาน" aria-label="อีโมจิ (ยังไม่พร้อมใช้งาน)">${icon('heart')}</button>
            <button class="btn primary cv-send" type="submit" aria-label="ส่งข้อความ" ${active.enabled && active.status !== 'unlinked' ? '' : 'disabled'}>${icon('send')}</button>
          </div>
          <small class="muted" data-role="form-error">${active.status === 'unlinked' ? 'กลุ่มนี้ยังไม่ได้เชื่อมต่อบอท เลือกบอทในหน้า จัดการ Telegram ก่อนส่งข้อความ' : ''}</small>
        </form>
      </section>
    </div>`);
  if (!found) {
    const body = $('#messages');
    if (body) body.insertAdjacentHTML('afterbegin', `<div class="cv-notice">ไม่พบข้อความต้นทางนี้ในประวัติที่เก็บไว้ จึงไม่ได้เลื่อนไปยังข้อความอื่น</div>`);
  }
  bindMessageArea();
  if (requested && found) setTimeout(() => scrollToMessage(requested, true), 30);
  else scrollBottom();
  S.timers.push(setInterval(() => { if (S.route === 'chat' && !S.chat.anchored) refreshChatMessages(); }, 15000));
}

// ---------------------------------------------------------------- list
function chatListHtml() {
  if (S.chat.tab === 'mention') {
    const q = S.chat.listQuery.trim().toLowerCase();
    const rows = S.chat.mentions.filter((m) => !q || (m.groupTitle + ' ' + m.senderName + ' ' + m.text).toLowerCase().includes(q));
    if (!rows.length) return emptyBox('ยังไม่มีข้อความที่แท็กคุณ');
    return rows.map((m) => {
      const group = S.chat.chats.find((c) => c.id === m.groupId) || { title: m.groupTitle };
      return `<button class="cv-item cv-mention-item ${m.read ? '' : 'is-new'}" data-action="chat-jump" data-group="${esc(m.groupId)}" data-msg="${m.messageId}">
        ${cvAvatar(group, 44)}
        <span class="cv-item-body">
          <span class="cv-row1"><b class="ellipsis">${esc(m.groupTitle)}</b><small>${esc(cvTimeLabel(m.sentAt))}</small></span>
          <span class="cv-row2"><span class="cv-tag-chip">@ ${esc(m.senderName)}</span></span>
          <span class="cv-last">${esc(m.text.slice(0, 100) || '(ไฟล์แนบ)')}</span>
        </span>
        ${m.read ? '' : '<span class="cv-dot" aria-label="ยังไม่ได้อ่าน"></span>'}
      </button>`;
    }).join('');
  }
  let list = S.chat.chats;
  if (S.chat.tab === 'unread') list = list.filter((c) => c.unread > 0);
  const q = S.chat.listQuery.trim().toLowerCase();
  if (q) list = list.filter((c) => (c.title + ' ' + c.lastText).toLowerCase().includes(q));
  if (!list.length) return emptyBox(S.chat.tab === 'unread' ? 'ไม่มีกลุ่มที่ยังไม่ได้อ่าน' : 'ไม่พบกลุ่มที่ค้นหา');
  return list.map((c) => `<button class="cv-item ${c.id === S.chat.groupId ? 'is-active' : ''} ${c.mentions ? 'has-mention' : ''}" aria-current="${c.id === S.chat.groupId}" data-action="chat-open" data-id="${esc(c.id)}">
      ${cvAvatar(c, 46)}
      <span class="cv-item-body">
        <span class="cv-row1"><b class="ellipsis">${esc(c.title)}</b><small>${esc(cvTimeLabel(c.lastAt))}</small></span>
        <span class="cv-last">${c.mentions ? `<span class="cv-tag-chip">แท็กคุณ ${c.mentions}</span> ` : ''}${esc(c.lastText || (c.enabled ? 'ยังไม่มีข้อความ' : 'ปิดการติดตาม'))}</span>
      </span>
      ${c.unread ? `<span class="cv-count-dot">${c.unread > 99 ? '99+' : c.unread}</span>` : ''}
    </button>`).join('');
}

// ---------------------------------------------------------------- messages
function highlightMentions(text) {
  return String(text).split(/(@[A-Za-z0-9_]{3,64})/).map((part) =>
    /^@[A-Za-z0-9_]{3,64}$/.test(part) ? `<span class="cv-mention-name">${esc(part)}</span>` : esc(part)).join('');
}

function attachmentsHtml(m, src) {
  const names = (m.attachments || []).map((a) => a.name);
  return (m.attachments || []).filter((a, i) => !(a.type === 'document' && names.some((n, j) => j !== i && n === a.name))).map((a) => {
    const idx = m.attachments.indexOf(a);
    const url = `/api/telegram/media/${encodeURIComponent(m.id)}/${idx}`;
    if (!a.hasFile) return `<span class="cv-file">${icon('file', 'sm')} ${esc(a.name || a.type)}</span>`;
    if (a.type === 'photo' || (a.type === 'sticker' && a.mime === 'image/webp')) return `<img class="cv-media" loading="lazy" src="${url}" alt="${esc(a.name)}">`;
    if (a.type === 'animation') return `<video class="cv-media" src="${url}" autoplay loop muted playsinline aria-label="${esc(a.name)}"></video>`;
    if (a.type === 'video' || (a.type === 'sticker' && a.mime === 'video/webm')) return `<video class="cv-media" src="${url}" controls preload="metadata"></video>`;
    if (a.type === 'voice' || a.type === 'audio') return `<audio class="cv-audio" controls preload="none" src="${url}"></audio>`;
    if (a.type === 'sticker') return `<span class="cv-file">${icon('file', 'sm')} ${esc(a.name)} (แอนิเมชัน แสดงไม่ได้)</span>`;
    return `<a class="cv-file" href="${url}" download>${icon('file', 'sm')} ${esc(a.name || 'ไฟล์')}</a>`;
  }).join('');
}

// Three bubble kinds: normal, tagged to me (yellow frame), and the SIINA bot (pink).
function bubbleHtml(m) {
  const isBot = m.isOutgoing;
  const isTag = !isBot && m.matched.includes('mention');
  const kind = isBot ? 'cv-bot' : isTag ? (m.ackedAt ? 'cv-tagged is-acked' : 'cv-tagged') : 'cv-normal';
  const reasonBadge = !isBot && m.matched.includes('reply_to_me') ? '<span class="cv-badge purple">ตอบกลับคุณ</span>' : '';
  const botName = m.botName || 'SIINA Bot';
  const avatar = isBot
    ? (m.botAvatar
      ? `<span class="cv-av cv-av-bot cv-av-pic"><img src="${esc(m.botAvatar)}" alt=""></span>`
      : `<span class="cv-av cv-av-bot">${eggHtml({ size: 40 })}</span>`)
    : `<span class="cv-av">${esc(initials(m.senderName))}</span>`;
  return `<div class="cv-row ${isBot ? 'is-bot' : ''}" data-msgid="${m.messageId}">
    ${avatar}
    <div class="cv-bubble ${kind}">
      <div class="cv-meta">
        ${S.chat.topics.length && S.chat.topic === 'all' ? `<span class="cv-topic-tag">${esc(topicName(m.threadId))}</span>` : ''}
        <b>${esc(isBot ? botName : m.senderName)}</b>
        ${isBot ? '<span class="cv-badge pink">บอท</span>' : ''}
        ${isTag ? '<span class="cv-badge yellow">★ แท็กถึงคุณ</span>' : ''}
        ${reasonBadge}
        <time>${esc(fmtTime(m.sentAt))}</time>
      </div>
      ${m.replyToText ? `<div class="cv-quote">${esc(m.replyToText)}</div>` : ''}
      <div class="cv-text">${highlightMentions(m.text || (m.attachments && m.attachments.length ? '' : '(ไม่มีข้อความ)'))}</div>
      ${attachmentsHtml(m)}
      <div class="cv-actions"><button data-action="chat-reply" data-id="${m.id}" data-msgid="${m.messageId}" data-text="${esc(m.text.slice(0, 80))}">${icon('reply', 'sm')} ตอบกลับ</button></div>
      ${isTag ? ackButtonHtml(m) : ''}
    </div>
  </div>`;
}

function ackButtonHtml(m) {
  const acked = !!m.ackedAt;
  return `<button type="button" class="cv-ack ${acked ? 'is-acked' : ''}" data-action="chat-ack" data-id="${esc(m.id)}" data-acked="${acked}"
    aria-pressed="${acked}" aria-label="${acked ? 'รับทราบแล้ว' : 'กดเพื่อรับทราบ'}" title="${acked ? 'รับทราบแล้ว' : 'กดเพื่อรับทราบ'}">
    <span class="cv-ack-emoji" aria-hidden="true">${acked ? '✓' : '👌'}</span></button>`;
}
ACTIONS['chat-ack'] = async (el) => {
  if (el.dataset.busy) return;
  const wasAcked = el.dataset.acked === 'true';
  el.dataset.busy = '1';
  el.classList.add('is-loading');
  el.disabled = true;
  try {
    const r = await apiPost(`/api/telegram/messages/${el.dataset.id}/ack`, { acked: !wasAcked });
    const m = S.chat.messages.find((x) => x.id === el.dataset.id);
    if (m) m.ackedAt = r.ackedAt;
    el.dataset.acked = String(!wasAcked);
    const bubble = el.closest('.cv-bubble');
    if (bubble) bubble.classList.toggle('is-acked', !wasAcked);
    updateJumpButton();
    el.classList.toggle('is-acked', !wasAcked);
    el.setAttribute('aria-pressed', String(!wasAcked));
    el.title = !wasAcked ? 'รับทราบแล้ว' : 'กดเพื่อรับทราบ';
    el.querySelector('.cv-ack-emoji').textContent = !wasAcked ? '✓' : '👌';
    toast(!wasAcked ? 'รับทราบแล้ว' : 'ยกเลิกการรับทราบแล้ว');
  } catch (err) {
    toast('บันทึกการรับทราบไม่สำเร็จ: ' + err.message, 'err');
  } finally {
    delete el.dataset.busy;
    el.classList.remove('is-loading');
    el.disabled = false;
  }
};

// Enter sends; Shift+Enter starts a new line.
document.addEventListener('keydown', (e) => {
  const t = e.target;
  if (!t || !t.classList || !t.classList.contains('cv-input')) return;
  if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
  e.preventDefault();
  const form = t.closest('form');
  if (form && form.requestSubmit) form.requestSubmit();
});

function visibleMessages() {
  const q = S.chat.search.trim().toLowerCase();
  return S.chat.messages.filter((m) => {
    if (S.chat.topic !== 'all' && topicOf(m) !== Number(S.chat.topic)) return false;
    if (S.chat.headTab === 'important' && !m.matched.length) return false;
    if (S.chat.headTab === 'files' && !m.attachments.length) return false;
    if (S.chat.headTab === 'links' && !/https?:\/\//i.test(m.text)) return false;
    if (q && !(m.text + ' ' + m.senderName).toLowerCase().includes(q)) return false;
    return true;
  });
}

function messagesHtml() {
  if (S.chat.headTab === 'ai') {
    return `<div class="cv-notice cv-ai"><b>สรุปด้วย AI ยังไม่พร้อมใช้งาน</b><br>ระบบจะแสดงผลสรุปเมื่อเชื่อมต่อบริการ AI แล้วเท่านั้น จึงยังไม่แสดงผลลัพธ์</div>`;
  }
  const list = visibleMessages();
  if (!list.length) return `<div class="empty">${S.chat.messages.length ? 'ไม่มีข้อความที่ตรงกับตัวกรองนี้' : 'ยังไม่มีข้อความที่บันทึกไว้'}</div>`;
  return list.map(bubbleHtml).join('');
}

function replyBarHtml() {
  if (!S.chat.replyTo) return '';
  return `<div class="cv-reply-preview">${icon('reply', 'sm')}<span class="ellipsis">ตอบกลับ: ${esc((S.chat.replyTo.text || '').slice(0, 80))}</span>
    <button type="button" class="btn icon ghost" data-action="chat-clear-reply" aria-label="ยกเลิกการตอบกลับ">${icon('close', 'sm')}</button></div>`;
}

function scrollBottom() {
  const box = $('#messages');
  if (box) box.scrollTop = box.scrollHeight;
  updateJumpButton();
}

// Scrolls only the message pane (never the page or the composer) and pulses the bubble.
function scrollToMessage(msgId, instant) {
  const box = $('#messages');
  const el = box && box.querySelector(`[data-msgid="${msgId}"]`);
  if (!el) return false;
  const reduce = document.documentElement.dataset.anim === 'off' || document.documentElement.dataset.anim === 'reduced';
  const target = el.offsetTop - box.clientHeight / 2 + el.offsetHeight / 2;
  box.scrollTo({ top: target, behavior: instant || reduce ? 'auto' : 'smooth' });
  // Safety net: if a smooth scroll has not landed (for example in a background tab), snap to the target.
  setTimeout(() => { if (Math.abs(box.scrollTop - target) > 6) box.scrollTop = target; updateJumpButton(); }, 700);
  el.classList.remove('cv-hit');
  void el.offsetWidth;
  el.classList.add('cv-hit');
  setTimeout(updateJumpButton, 450);
  return true;
}

function updateJumpButton() {
  const box = $('#messages');
  const btn = $('#cvJump');
  if (!box || !btn) return;
  const top = box.scrollTop;
  const bottom = top + box.clientHeight;
  const tagged = [...box.querySelectorAll('.cv-tagged:not(.is-acked)')];
  const offscreen = tagged.filter((el) => el.offsetTop + el.offsetHeight < top + 4 || el.offsetTop > bottom - 4);
  btn.hidden = offscreen.length === 0;
  const below = offscreen.some((el) => el.offsetTop > bottom);
  btn.dataset.direction = below ? 'down' : 'up';
  btn.innerHTML = `${icon(below ? 'chevDown' : 'chevLeft', 'sm')} ${below ? 'ไปที่ข้อความที่แท็กคุณ' : 'ไปยังข้อความที่แท็กคุณก่อนหน้า'}`;
}

function bindMessageArea() {
  const box = $('#messages');
  if (box) box.addEventListener('scroll', updateJumpButton, { passive: true });
  updateJumpButton();
}

async function refreshChatMessages() {
  if (!S.chat.groupId || document.hidden) return;
  try {
    const { items } = await apiGet(`/api/telegram/groups/${S.chat.groupId}/messages?limit=80`);
    S.chat.messages = items;
    const box = $('#messages');
    if (!box) return;
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
    box.innerHTML = messagesHtml();
    if (atBottom) box.scrollTop = box.scrollHeight;
    updateJumpButton();
  } catch (_) { /* next tick retries */ }
}

// ---------------------------------------------------------------- actions
ACTIONS['chat-open'] = (el) => {
  S.chat.groupId = el.dataset.id;
  S.chat.replyTo = null;
  S.chat.anchored = false;
  S.chat.showMobileChat = true;
  navigate('#/chat?group=' + S.chat.groupId + '&view=chat');
};
ACTIONS['chat-jump'] = (el) => {
  S.chat.groupId = el.dataset.group;
  S.chat.replyTo = null;
  S.chat.showMobileChat = true;
  navigate(`#/chat?group=${el.dataset.group}&view=chat&msg=${el.dataset.msg}`);
};
ACTIONS['chat-tab'] = (el) => {
  S.chat.tab = el.dataset.tab;
  $$('.cv-tab').forEach((b) => b.setAttribute('aria-selected', String(b === el)));
  const items = $('#cvItems');
  if (items) items.innerHTML = chatListHtml();
};
ACTIONS['chat-htab'] = (el) => {
  S.chat.headTab = el.dataset.tab;
  $$('.cv-htab').forEach((b) => b.setAttribute('aria-selected', String(b === el)));
  const box = $('#messages');
  if (box) { box.innerHTML = messagesHtml(); bindMessageArea(); }
};
ACTIONS['chat-search-toggle'] = (el) => {
  const box = $('#cvSearch');
  if (!box) return;
  box.hidden = !box.hidden;
  el.setAttribute('aria-expanded', String(!box.hidden));
  if (!box.hidden) setTimeout(() => box.querySelector('input').focus(), 20);
};
ACTIONS['chat-back'] = () => {
  S.chat.showMobileChat = false;
  const l = $('#chatLayout');
  if (l) l.classList.remove('show-chat');
};
ACTIONS['chat-reply'] = (el) => {
  S.chat.replyTo = { messageId: Number(el.dataset.msgid), text: el.dataset.text };
  const bar = $('#cvReplyBar');
  if (bar) bar.innerHTML = replyBarHtml();
  const input = $('.cv-input');
  if (input) input.focus();
};
ACTIONS['chat-topic'] = (el) => {
  // A second tap on the topic that is already selected opens the rename popup.
  if (el.getAttribute('aria-selected') === 'true' && el.dataset.id !== 'all' && el.dataset.id !== '1') {
    ACTIONS['chat-topic-rename'](el);
    return;
  }
  S.chat.topic = el.dataset.id;
  $$('.cv-topic-chip').forEach((b) => b.setAttribute('aria-selected', String(b === el)));
  const sel = document.querySelector('[name="threadId"]');
  const hint = document.querySelector('.cv-target');
  if (hint) hint.outerHTML = topicHintHtml();
  const box = $('#messages');
  if (box) { box.innerHTML = messagesHtml(); bindMessageArea(); }
};
ACTIONS['chat-topic-rename'] = (el) => {
  const threadId = el.dataset.thread;
  const current = el.dataset.name.startsWith('หัวข้อ #') ? '' : el.dataset.name;
  openModal({
    title: 'ตั้งชื่อหัวข้อ',
    body: `<form data-form="chat-topic-rename" data-group="${esc(S.chat.groupId)}" data-thread="${esc(threadId)}" class="stack">
      <p class="muted small">Telegram ไม่ได้ส่งชื่อหัวข้อนี้มาให้ระบบ จึงตั้งชื่อเองได้ที่นี่ (ชื่อในแอปเท่านั้น ไม่เปลี่ยนชื่อใน Telegram)</p>
      <label class="field"><span>ชื่อหัวข้อ</span><input class="input" name="name" maxlength="120" required value="${esc(current)}" placeholder="เช่น HR999"></label>
      <p class="small" data-role="form-error"></p>
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn ghost" data-action="close-modal">ยกเลิก</button>
        <button type="submit" class="btn primary">บันทึกชื่อ</button></div>
    </form>`,
  });
};
FORMS['chat-topic-rename'] = async (form) => {
  const name = form.querySelector('[name="name"]').value.trim();
  const btn = form.querySelector('[type="submit"]');
  try {
    await busy(btn, () => apiPatch(`/api/telegram/groups/${form.dataset.group}/topics/${form.dataset.thread}`, { name }));
    closeAllModals();
    toast('บันทึกชื่อหัวข้อแล้ว');
    renderChat({ group: S.chat.groupId });
  } catch (err) { setFormError(form, err.message); }
};
ACTIONS['chat-clear-reply'] = () => {
  S.chat.replyTo = null;
  const bar = $('#cvReplyBar');
  if (bar) bar.innerHTML = '';
};
ACTIONS['chat-jump-next'] = () => {
  const box = $('#messages');
  if (!box) return;
  const top = box.scrollTop;
  const bottom = top + box.clientHeight;
  const tagged = [...box.querySelectorAll('.cv-tagged:not(.is-acked)')];
  const below = tagged.filter((el) => el.offsetTop > bottom - 4);
  const above = tagged.filter((el) => el.offsetTop + el.offsetHeight < top + 4);
  const target = below.length ? below[0] : above[above.length - 1];
  // data-msgid sits on the row that wraps the bubble, not on the bubble itself.
  const row = target && target.closest('[data-msgid]');
  if (row) scrollToMessage(Number(row.dataset.msgid));
};
ACTIONS['chat-info'] = async () => {
  const c = S.chat.chats.find((x) => x.id === S.chat.groupId);
  if (!c) return;
  const { items } = await apiGet('/api/telegram/groups');
  const g = items.find((x) => x.id === c.id);
  openModal({
    title: 'รายละเอียดกลุ่ม',
    body: `<div class="detail-head">${cvAvatar(c, 56)}<div><h3>${esc(c.title)}</h3>
      <p class="muted small">Chat ID ${esc(g ? g.chatId : '-')}</p></div></div>
      <dl class="kv" style="margin-top:16px">
        <dt>บอทที่ใช้</dt><dd>${g && g.botId ? esc(g.botName) : '<span class="muted">ยังไม่ได้เชื่อมต่อบอท</span>'}</dd>
        <dt>สถานะการเชื่อมต่อ</dt><dd>${g ? esc(({ ready: 'พร้อมใช้งาน', error: 'มีปัญหา', unknown: 'ยังไม่ทดสอบ', unlinked: 'ยังไม่ได้เชื่อมต่อบอท' })[g.botId ? g.status : 'unlinked']) : '-'}</dd>
        <dt>การติดตาม</dt><dd>${g && g.enabled ? 'เปิดอยู่' : 'ปิดอยู่'}</dd>
        <dt>ตอบรับอัตโนมัติ</dt><dd>${g && g.autoReply ? 'เปิด' : 'ปิด'}</dd>
      </dl>`,
    footer: `<button class="btn ghost" data-action="close-modal">ปิด</button>
      <a class="btn primary" href="#/settings?tab=telegram">${icon('settings')} จัดการ Telegram</a>`,
  });
};
ACTIONS['outbox-retry'] = async (el) => {
  try {
    await busy(el, () => apiPost(`/api/telegram/outbox/${el.dataset.id}/retry`));
    toast('ส่งข้อความซ้ำแล้ว');
  } catch (err) { toast(err.message, 'err'); }
  renderChat({ group: S.chat.groupId });
};

FORMS['chat-send'] = async (form) => {
  const text = form.querySelector('[name="text"]').value.trim();
  const errBox = form.querySelector('[data-role="form-error"]');
  if (!text) return;
  // The same key is reused for retries of one attempt, so a double-tap cannot send twice.
  if (!S.chat.draftKey || S.chat.draftText !== text) { S.chat.draftKey = newKey(); S.chat.draftText = text; }
  const btn = form.querySelector('button[type="submit"]');
  errBox.textContent = 'กำลังส่งไปยัง Telegram...';
  errBox.style.color = '';
  try {
    const formatted = S.chat.draft && S.chat.draft.mode === 'formatted' && S.chat.draft.html && S.chat.draft.text === text ? S.chat.draft.html : null;
    const body = { text, formatted, replyToMessageId: S.chat.replyTo ? S.chat.replyTo.messageId : null, threadId: S.chat.topic !== 'all' ? Number(S.chat.topic) : null };
    const result = await busy(btn, () => apiPost(`/api/telegram/groups/${form.dataset.group}/send`, body, { 'x-client-key': S.chat.draftKey }));
    if (result && result.status === 'failed') {
      errBox.textContent = 'ส่งไม่สำเร็จ: ' + (result.error || 'ไม่ทราบสาเหตุ') + ' · กดส่งซ้ำได้จากรายการด้านบน';
      errBox.style.color = 'var(--danger)';
      toast('ส่งข้อความไม่สำเร็จ', 'err');
      renderChat({ group: S.chat.groupId });
      return;
    }
    S.chat.draftKey = null;
    S.chat.replyTo = null;
    S.chat.draft = null;
    renderDraft();
    form.querySelector('[name="text"]').value = '';
    autoSizeComposer();
    errBox.textContent = '';
    await refreshChatMessages();
    const bar = $('#cvReplyBar');
    if (bar) bar.innerHTML = '';
  } catch (err) {
    errBox.textContent = err.message;
    errBox.style.color = 'var(--danger)';
  }
};

// Filters that only work on the page (no reload).
document.addEventListener('input', (e) => {
  const t = e.target;
  if (!t.dataset) return;
  if (t.classList && t.classList.contains('cv-input')) {
    draftTextChanged();
    autoSizeComposer();
  }
  if (t.dataset.input === 'chat-search') {
    S.chat.listQuery = t.value;
    const items = $('#cvItems');
    if (items) items.innerHTML = chatListHtml();
  }
  if (t.dataset.input === 'chat-msg-search') {
    S.chat.search = t.value;
    const box = $('#messages');
    if (box) { box.innerHTML = messagesHtml(); bindMessageArea(); }
  }
});
