'use strict';
// SQLite storage (built into Node 22.13+ via node:sqlite). Data persists in DATA_DIR.
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'siina.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL DEFAULT '',
  avatar_data TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Bangkok',
  telegram_user_id TEXT,
  password_hash TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS otp_requests (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  used_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_otp_email ON otp_requests(email, created_at);

CREATE TABLE IF NOT EXISTS login_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  user_agent TEXT
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT 'folder',
  image_data TEXT,
  status TEXT NOT NULL DEFAULT 'in_progress',
  open_url TEXT,
  editor_url TEXT,
  start_date TEXT,
  notes TEXT NOT NULL DEFAULT '',
  is_favorite INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id, archived, status);

CREATE TABLE IF NOT EXISTS calendar_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  symbol TEXT NOT NULL DEFAULT 'calendar',
  color TEXT NOT NULL DEFAULT '#FF4F9A',
  category TEXT NOT NULL DEFAULT 'notice',
  start_date TEXT NOT NULL,
  start_time TEXT,
  end_date TEXT,
  end_time TEXT,
  start_at TEXT NOT NULL,
  end_at TEXT,
  details TEXT NOT NULL DEFAULT '',
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  reminder_minutes INTEGER,
  reminder_due_at TEXT,
  reminder_sent_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_user_start ON calendar_events(user_id, start_date);
CREATE INDEX IF NOT EXISTS idx_events_reminder ON calendar_events(reminder_due_at, reminder_sent_at);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  remind_at TEXT NOT NULL,
  read_at TEXT,
  email_sent_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, source_type, source_id, remind_at)
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at);

CREATE TABLE IF NOT EXISTS telegram_bots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  username TEXT,
  token_enc TEXT NOT NULL,
  token_hint TEXT NOT NULL,
  avatar_data TEXT,
  mode TEXT NOT NULL DEFAULT 'polling',
  webhook_secret TEXT NOT NULL,
  update_offset INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'unknown',
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS telegram_groups (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bot_id TEXT REFERENCES telegram_bots(id) ON DELETE SET NULL,
  previous_bot_id TEXT,
  title TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  auto_reply INTEGER NOT NULL DEFAULT 0,
  avatar_data TEXT,
  status TEXT NOT NULL DEFAULT 'unknown',
  last_error TEXT,
  last_tested_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(bot_id, chat_id)
);

CREATE TABLE IF NOT EXISTS telegram_messages (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES telegram_groups(id) ON DELETE CASCADE,
  message_id INTEGER NOT NULL,
  sender_id TEXT,
  sender_name TEXT NOT NULL DEFAULT '',
  sender_username TEXT,
  text TEXT NOT NULL DEFAULT '',
  attachments TEXT NOT NULL DEFAULT '[]',
  reply_to_message_id INTEGER,
  reply_to_sender_id TEXT,
  reply_to_text TEXT,
  matched TEXT NOT NULL DEFAULT '[]',
  is_outgoing INTEGER NOT NULL DEFAULT 0,
  sent_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  read_at TEXT,
  UNIQUE(group_id, message_id)
);
CREATE INDEX IF NOT EXISTS idx_tgmsg_group ON telegram_messages(group_id, sent_at);

CREATE TABLE IF NOT EXISTS telegram_filters (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  value TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, type, value)
);

CREATE TABLE IF NOT EXISTS telegram_outbox (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES telegram_groups(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  reply_to_message_id INTEGER,
  client_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sending',
  telegram_message_id INTEGER,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, client_key)
);

CREATE TABLE IF NOT EXISTS summary_states (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  state TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, source_type, source_id)
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_logs_user ON activity_logs(user_id, created_at);

CREATE TABLE IF NOT EXISTS telegram_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  event TEXT NOT NULL,
  bot_name TEXT,
  group_title TEXT,
  status TEXT NOT NULL DEFAULT 'success',
  detail TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_tglogs_user ON telegram_logs(user_id, created_at);

CREATE TABLE IF NOT EXISTS error_logs (
  id TEXT PRIMARY KEY,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  context TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
`);

// Migration for databases created before password login existed.
try {
  db.exec('ALTER TABLE users ADD COLUMN password_hash TEXT');
} catch (_) {
  // column already exists
}

// ---- Migrations for databases created before these changes (existing rows are kept) ----
function columnsOf(table) {
  return db.prepare(`PRAGMA table_info(${table})`).all();
}
if (!columnsOf('telegram_bots').some((c) => c.name === 'avatar_data')) {
  db.exec('ALTER TABLE telegram_bots ADD COLUMN avatar_data TEXT');
}
{
  const cols = columnsOf('telegram_groups');
  const botNotNull = cols.find((c) => c.name === 'bot_id')?.notnull === 1;
  const missingNew = !cols.some((c) => c.name === 'avatar_data') || !cols.some((c) => c.name === 'previous_bot_id');
  if (botNotNull || missingNew) {
    // Back up first (consistent copy, includes WAL data).
    const backup = path.join(DATA_DIR, `siina-before-telegram-migration-${Date.now()}.db`);
    db.exec(`VACUUM INTO '${backup.replace(/'/g, "''")}'`);
    db.exec('PRAGMA foreign_keys = OFF');
    try {
      db.exec('BEGIN');
      db.exec(`CREATE TABLE telegram_groups_new (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        bot_id TEXT REFERENCES telegram_bots(id) ON DELETE SET NULL,
        previous_bot_id TEXT,
        title TEXT NOT NULL,
        chat_id TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        auto_reply INTEGER NOT NULL DEFAULT 0,
        avatar_data TEXT,
        status TEXT NOT NULL DEFAULT 'unknown',
        last_error TEXT,
        last_tested_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(bot_id, chat_id)
      )`);
      db.exec(`INSERT INTO telegram_groups_new (id, user_id, bot_id, previous_bot_id, title, chat_id, enabled, auto_reply, avatar_data, status, last_error, last_tested_at, created_at, updated_at)
        SELECT id, user_id, bot_id, NULL, title, chat_id, enabled, 0, NULL, status, last_error, last_tested_at, created_at, updated_at FROM telegram_groups`);
      db.exec('DROP TABLE telegram_groups');
      db.exec('ALTER TABLE telegram_groups_new RENAME TO telegram_groups');
      if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('foreign key check failed');
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    } finally {
      db.exec('PRAGMA foreign_keys = ON');
    }
  }
}

module.exports = { db, DATA_DIR };
