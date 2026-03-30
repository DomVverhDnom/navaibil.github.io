import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { listAdminEmailsFromEnv } from './admin-emails.js'
import { migrateSubscriptionTiersFromLegacy } from './subscription-tiers.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(__dirname, 'data')
const dbPath = process.env.SQLITE_PATH || path.join(dataDir, 'app.db')

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

export const db = new Database(dbPath)

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    avatar_path TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS subscriptions (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    plan TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    current_period_end TEXT NOT NULL,
    canceled_at TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);

  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_chat_created ON chat_messages(created_at DESC);

  CREATE TABLE IF NOT EXISTS post_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_pc_post ON post_comments(post_id, id);

  CREATE TABLE IF NOT EXISTS channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    description TEXT,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    price_month INTEGER NOT NULL DEFAULT 0,
    price_year INTEGER NOT NULL DEFAULT 0,
    banner_path TEXT,
    social_links TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS channel_members (
    channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member',
    PRIMARY KEY (channel_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS channel_subscriptions (
    channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    current_period_end TEXT NOT NULL,
    canceled_at TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (channel_id, user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_cm_user ON channel_members(user_id);
  CREATE INDEX IF NOT EXISTS idx_cs_user ON channel_subscriptions(user_id);
`)

const postCols = db.prepare(`PRAGMA table_info(posts)`).all()
if (!postCols.some((c) => c.name === 'image_path')) {
  db.exec(`ALTER TABLE posts ADD COLUMN image_path TEXT`)
}

function ensureUserColumn(colName, alterSql) {
  const cols = db.prepare(`PRAGMA table_info(users)`).all()
  if (!cols.some((c) => c.name === colName)) {
    db.exec(alterSql)
  }
}

ensureUserColumn('role', `ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'`)
ensureUserColumn('banned', `ALTER TABLE users ADD COLUMN banned INTEGER NOT NULL DEFAULT 0`)
ensureUserColumn('ban_reason', `ALTER TABLE users ADD COLUMN ban_reason TEXT`)
ensureUserColumn('banned_until', `ALTER TABLE users ADD COLUMN banned_until TEXT`)
ensureUserColumn('avatar_path', `ALTER TABLE users ADD COLUMN avatar_path TEXT`)
ensureUserColumn(
  'show_public_channels',
  `ALTER TABLE users ADD COLUMN show_public_channels INTEGER NOT NULL DEFAULT 0`
)

function ensureChatColumn(colName, alterSql) {
  const cols = db.prepare(`PRAGMA table_info(chat_messages)`).all()
  if (!cols.some((c) => c.name === colName)) {
    db.exec(alterSql)
  }
}

ensureChatColumn('reply_to_id', `ALTER TABLE chat_messages ADD COLUMN reply_to_id INTEGER`)

function ensurePostCommentColumn(colName, alterSql) {
  const cols = db.prepare(`PRAGMA table_info(post_comments)`).all()
  if (!cols.some((c) => c.name === colName)) {
    db.exec(alterSql)
  }
}

ensurePostCommentColumn('reply_to_id', `ALTER TABLE post_comments ADD COLUMN reply_to_id INTEGER`)

const postCols2 = db.prepare(`PRAGMA table_info(posts)`).all()
if (!postCols2.some((c) => c.name === 'channel_id')) {
  db.exec(`ALTER TABLE posts ADD COLUMN channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE`)
}

const postColsPinned = db.prepare(`PRAGMA table_info(posts)`).all()
if (!postColsPinned.some((c) => c.name === 'pinned_at')) {
  db.exec(`ALTER TABLE posts ADD COLUMN pinned_at TEXT`)
}

const chatCols2 = db.prepare(`PRAGMA table_info(chat_messages)`).all()
if (!chatCols2.some((c) => c.name === 'channel_id')) {
  db.exec(`ALTER TABLE chat_messages ADD COLUMN channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE`)
}

const channelCols = db.prepare(`PRAGMA table_info(channels)`).all()
if (!channelCols.some((c) => c.name === 'price_month')) {
  db.exec(`ALTER TABLE channels ADD COLUMN price_month INTEGER NOT NULL DEFAULT 0`)
}
if (!channelCols.some((c) => c.name === 'price_year')) {
  db.exec(`ALTER TABLE channels ADD COLUMN price_year INTEGER NOT NULL DEFAULT 0`)
}

const channelColsBanner = db.prepare(`PRAGMA table_info(channels)`).all()
if (!channelColsBanner.some((c) => c.name === 'banner_path')) {
  db.exec(`ALTER TABLE channels ADD COLUMN banner_path TEXT`)
}

const channelColsSocial = db.prepare(`PRAGMA table_info(channels)`).all()
if (!channelColsSocial.some((c) => c.name === 'social_links')) {
  db.exec(`ALTER TABLE channels ADD COLUMN social_links TEXT`)
}

let channelColsBlocked = db.prepare(`PRAGMA table_info(channels)`).all()
if (!channelColsBlocked.some((c) => c.name === 'blocked')) {
  db.exec(`ALTER TABLE channels ADD COLUMN blocked INTEGER NOT NULL DEFAULT 0`)
}
channelColsBlocked = db.prepare(`PRAGMA table_info(channels)`).all()
if (!channelColsBlocked.some((c) => c.name === 'blocked_reason')) {
  db.exec(`ALTER TABLE channels ADD COLUMN blocked_reason TEXT`)
}

const channelColsLive = db.prepare(`PRAGMA table_info(channels)`).all()
if (!channelColsLive.some((c) => c.name === 'live_active')) {
  db.exec(`ALTER TABLE channels ADD COLUMN live_active INTEGER NOT NULL DEFAULT 0`)
}

let channelColsReact = db.prepare(`PRAGMA table_info(channels)`).all()
if (!channelColsReact.some((c) => c.name === 'reaction_quick_json')) {
  db.exec(`ALTER TABLE channels ADD COLUMN reaction_quick_json TEXT`)
}
channelColsReact = db.prepare(`PRAGMA table_info(channels)`).all()
if (!channelColsReact.some((c) => c.name === 'reaction_enabled_json')) {
  db.exec(`ALTER TABLE channels ADD COLUMN reaction_enabled_json TEXT`)
}

db.exec(`
  CREATE TABLE IF NOT EXISTS post_reactions (
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (post_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_post_reactions_post ON post_reactions(post_id);
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS post_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    path TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_post_images_post ON post_images(post_id, sort_order, id);
`)

;(function migratePostImagesFromLegacy() {
  const n = db.prepare(`SELECT COUNT(*) AS c FROM post_images`).get().c
  if (n > 0) return
  const rows = db
    .prepare(`SELECT id, image_path FROM posts WHERE image_path IS NOT NULL AND trim(image_path) != ''`)
    .all()
  const ins = db.prepare(`INSERT INTO post_images (post_id, path, sort_order) VALUES (?, ?, 0)`)
  for (const r of rows) {
    ins.run(r.id, r.image_path)
  }
})()

db.exec(`
  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_prt_user ON password_reset_tokens(user_id);
  CREATE INDEX IF NOT EXISTS idx_prt_expires ON password_reset_tokens(expires_at);
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS user_oauth (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    subject TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (provider, subject)
  );
  CREATE INDEX IF NOT EXISTS idx_user_oauth_user ON user_oauth(user_id);
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS direct_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_dm_sender_time ON direct_messages(sender_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_dm_recipient_time ON direct_messages(recipient_id, created_at DESC);
`)

function ensureDirectMessageColumn(colName, alterSql) {
  const cols = db.prepare(`PRAGMA table_info(direct_messages)`).all()
  if (!cols.some((c) => c.name === colName)) {
    db.exec(alterSql)
  }
}

ensureDirectMessageColumn('image_path', `ALTER TABLE direct_messages ADD COLUMN image_path TEXT`)

/** Убрать устаревшее «Общее сообщество» / slug general — ссылки станут /channels/archive-{id}/… */
function renameLegacyGeneralCommunity() {
  const generalRows = db.prepare(`SELECT id FROM channels WHERE lower(slug) = 'general'`).all()
  for (const r of generalRows) {
    const newSlug = `archive-${r.id}`
    db.prepare(`UPDATE channels SET name = 'Архив', slug = ? WHERE id = ?`).run(newSlug, r.id)
  }
  db.prepare(`UPDATE channels SET name = 'Архив' WHERE name = 'Общее сообщество'`).run()
}

function migrateLegacyChannels() {
  const chCount = db.prepare(`SELECT COUNT(*) AS c FROM channels`).get().c
  const orphanPosts = db.prepare(`SELECT COUNT(*) AS c FROM posts WHERE channel_id IS NULL`).get().c
  const orphanChat = db.prepare(`SELECT COUNT(*) AS c FROM chat_messages WHERE channel_id IS NULL`).get().c
  if (chCount > 0 && orphanPosts === 0 && orphanChat === 0) return

  let channelId = db.prepare(`SELECT id FROM channels ORDER BY id LIMIT 1`).get()?.id
  if (!channelId) {
    const u = db.prepare(`SELECT id FROM users ORDER BY id LIMIT 1`).get()
    if (!u) return
    const legacySlug = `import-${Date.now().toString(36)}`
    const ins = db
      .prepare(
        `INSERT INTO channels (slug, name, description, owner_id, price_month, price_year) VALUES (?, 'Импорт', NULL, ?, 0, 0)`
      )
      .run(legacySlug, u.id)
    channelId = ins.lastInsertRowid
    db.prepare(`INSERT OR IGNORE INTO channel_members (channel_id, user_id, role) VALUES (?, ?, 'owner')`).run(
      channelId,
      u.id
    )
  }

  if (orphanPosts > 0) {
    db.prepare(`UPDATE posts SET channel_id = ? WHERE channel_id IS NULL`).run(channelId)
  }
  if (orphanChat > 0) {
    db.prepare(`UPDATE chat_messages SET channel_id = ? WHERE channel_id IS NULL`).run(channelId)
  }

  const legacySubs = db.prepare(`SELECT user_id, plan, status, current_period_end, canceled_at FROM subscriptions`).all()
  for (const s of legacySubs) {
    db.prepare(
      `INSERT INTO channel_subscriptions (channel_id, user_id, plan, status, current_period_end, canceled_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(channel_id, user_id) DO UPDATE SET
         plan = excluded.plan,
         status = excluded.status,
         current_period_end = excluded.current_period_end,
         canceled_at = excluded.canceled_at,
         updated_at = datetime('now')`
    ).run(channelId, s.user_id, s.plan, s.status, s.current_period_end, s.canceled_at)
    db.prepare(`INSERT OR IGNORE INTO channel_members (channel_id, user_id, role) VALUES (?, ?, 'member')`).run(
      channelId,
      s.user_id
    )
  }
}

migrateLegacyChannels()
renameLegacyGeneralCommunity()
migrateSubscriptionTiersFromLegacy()

/** Вызывать из index.js после load-env — иначе ADMIN_EMAILS может быть пустым (порядок ESM-импортов). */
export function syncAdminRolesFromEnv() {
  const emails = listAdminEmailsFromEnv()

  if (!emails.length) {
    return
  }

  const stmt = db.prepare(`UPDATE users SET role = 'admin' WHERE email = ? COLLATE NOCASE`)
  let total = 0
  for (const email of emails) {
    const { changes } = stmt.run(email)
    total += changes
    if (changes === 0) {
      console.warn(`ADMIN_EMAILS: пользователь с email «${email}» не найден в БД (зарегистрируйтесь этим адресом или проверьте написание)`)
    } else {
      console.log(`ADMIN_EMAILS: роль admin → ${email}`)
    }
  }
  console.log(`ADMIN_EMAILS: обновлено записей: ${total} из ${emails.length}`)
}
