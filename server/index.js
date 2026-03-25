import './load-env.js'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import http from 'http'
import os from 'os'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import multer from 'multer'
import { Server } from 'socket.io'
import { db, syncAdminRolesFromEnv } from './db.js'
import { listAdminEmailsFromEnv, normEmail } from './admin-emails.js'
import {
  listChannelsForUser,
  channelSubPayload,
  hasChannelAccess,
  isChannelStaff,
  isChannelOwner,
  isChannelRecordOwner,
  fetchChannel,
  fetchChannelBySlug,
  isValidSlug,
  getMembership,
  getChannelMemberRole,
  canManageMemberRoles,
  normalizeChannelRole,
  normalizeSocialLinksInput,
  isSiteAdminUser,
} from './channels.js'
import {
  isLivekitConfigured,
  liveRoomName,
  livekitWsUrl,
  mintPublisherToken,
  mintViewerToken,
} from './livekit.js'
import {
  assertJwtSecret,
  assertProductionCors,
  buildCorsOptions,
  getSocketCorsConfig,
  isMockSubscriptionAllowed,
  IS_PRODUCTION,
  AUTH_MIN_PASSWORD_LENGTH,
  AUTH_MAX_PASSWORD_LENGTH,
  parseCorsOrigins,
} from './security.js'
import { registerOAuthRoutes } from './oauth.js'

syncAdminRolesFromEnv()
assertJwtSecret()
assertProductionCors()
if (IS_PRODUCTION) {
  console.log(`[vibe] CORS: ${parseCorsOrigins().length} разрешённых origin`)
} else {
  console.log('[vibe] CORS: режим разработки (localhost и частные IP в LAN)')
}

const _adminList = listAdminEmailsFromEnv()
console.log(
  `[vibe] ADMIN_EMAILS: ${_adminList.length ? `${_adminList.length} адрес(ов) в списке` : 'не задан — админов из .env не назначить'}`
)

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT || 3000)
const HOST = process.env.HOST || '0.0.0.0'
const JWT_SECRET = process.env.JWT_SECRET || 'dev-change-me-in-production'
const BCRYPT_ROUNDS = IS_PRODUCTION ? 12 : 10
const MAX_POST_LEN = 8000
const MAX_POST_PHOTOS = 12
const MAX_CHAT_LEN = 2000
const MAX_COMMENT_LEN = 2000
const MAX_DM_LEN = 2000

const uploadDir = path.join(__dirname, 'uploads')
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase()
    const safe = /^\.(jpe?g|png|gif|webp)$/i.test(ext) ? ext : '.jpg'
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${safe}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(jpeg|png|gif|webp)$/i.test(file.mimetype)
    cb(ok ? null : new Error('Только изображения JPEG, PNG, GIF, WebP'), ok)
  },
})

function uploadPhotosOptional(req, res, next) {
  upload.array('photos', MAX_POST_PHOTOS)(req, res, (err) => {
    if (err) {
      res.status(400).json({ error: err.message || 'Ошибка загрузки файла' })
      return
    }
    next()
  })
}

function uploadAvatarRequired(req, res, next) {
  upload.single('avatar')(req, res, (err) => {
    if (err) {
      res.status(400).json({ error: err.message || 'Ошибка загрузки файла' })
      return
    }
    if (!req.file) {
      res.status(400).json({ error: 'Выберите файл изображения' })
      return
    }
    next()
  })
}

function uploadBannerRequired(req, res, next) {
  upload.single('banner')(req, res, (err) => {
    if (err) {
      res.status(400).json({ error: err.message || 'Ошибка загрузки файла' })
      return
    }
    if (!req.file) {
      res.status(400).json({ error: 'Выберите изображение шапки' })
      return
    }
    next()
  })
}

function safeUnlinkUpload(publicPath) {
  if (!publicPath || typeof publicPath !== 'string') return
  if (!publicPath.startsWith('/uploads/')) return
  const base = path.basename(publicPath)
  if (!base || base.includes('..')) return
  const full = path.join(uploadDir, base)
  const resolved = path.resolve(full)
  if (!resolved.startsWith(path.resolve(uploadDir))) return
  try {
    if (fs.existsSync(resolved)) fs.unlinkSync(resolved)
  } catch {
    /* ignore */
  }
}

const app = express()
if (process.env.TRUST_PROXY === '1') {
  app.set('trust proxy', 1)
}

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false,
  })
)
app.use(cors(buildCorsOptions()))
app.use(express.json({ limit: '512kb' }))

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Math.max(60, Number(process.env.RATE_LIMIT_API_MAX || 400)),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много запросов. Сделайте паузу.' },
})

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Math.max(5, Number(process.env.RATE_LIMIT_AUTH_MAX || 50)),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много попыток входа и регистрации. Подождите несколько минут.' },
})

const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Math.max(5, Number(process.env.RATE_LIMIT_FORGOT_MAX || 20)),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много запросов восстановления пароля. Попробуйте через час.' },
})

app.use('/api/', apiLimiter)
app.use('/uploads', express.static(uploadDir))

function signToken(userId) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '14d' })
}

function verifyToken(token) {
  if (!token) return null
  try {
    const p = jwt.verify(token, JWT_SECRET)
    return typeof p.sub === 'number' ? p.sub : Number(p.sub)
  } catch {
    return null
  }
}

function normalizeRole(role) {
  const r = String(role || 'user').toLowerCase()
  if (r === 'admin' || r === 'moderator' || r === 'user') return r
  return 'user'
}

function banInfo(row) {
  if (!row || !row.banned) return { active: false, reason: null, until: null }
  if (row.bannedUntil) {
    const until = new Date(row.bannedUntil)
    if (Number.isNaN(until.getTime()) || until <= new Date()) {
      return { active: false, reason: null, until: null }
    }
    return { active: true, reason: row.banReason || null, until: row.bannedUntil }
  }
  return { active: true, reason: row.banReason || null, until: null }
}

function fetchAuthUser(id) {
  return db
    .prepare(
      `SELECT id, email, display_name AS displayName, created_at AS createdAt,
              role, banned, ban_reason AS banReason, banned_until AS bannedUntil,
              avatar_path AS avatarPath
       FROM users WHERE id = ?`
    )
    .get(id)
}

function mapUserPublic(row) {
  if (!row) return null
  const b = banInfo(row)
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    createdAt: row.createdAt,
    avatarUrl: row.avatarPath || null,
    role: normalizeRole(row.role),
    banned: b.active,
    banReason: b.active ? b.reason || null : null,
    banUntil: b.active ? b.until || null : null,
  }
}

function mapDirectMessageRow(row, viewerId) {
  if (!row) return null
  return {
    id: row.id,
    content: row.content,
    createdAt: row.createdAt,
    fromUserId: row.senderId,
    toUserId: row.recipientId,
    mine: row.senderId === viewerId,
  }
}

const CHAT_MESSAGE_SQL = `
SELECT m.id, m.content, m.created_at AS createdAt,
       u.display_name AS authorName, u.id AS authorId, u.role AS authorRoleRaw,
       u.avatar_path AS authorAvatar,
       m.reply_to_id AS replyToId,
       pm.id AS replyToMsgId, pu.display_name AS replyToAuthorName, pu.id AS replyToAuthorId,
       pu.role AS replyToAuthorRoleRaw, pm.content AS replyToContent,
       pu.avatar_path AS replyToAuthorAvatar
FROM chat_messages m
JOIN users u ON u.id = m.user_id
LEFT JOIN chat_messages pm ON pm.id = m.reply_to_id
LEFT JOIN users pu ON pu.id = pm.user_id`.trim()

function mapChatMessageRow(row) {
  const out = {
    id: row.id,
    content: row.content,
    createdAt: row.createdAt,
    authorName: row.authorName,
    authorId: row.authorId,
    authorAvatar: row.authorAvatar || null,
    authorRole: normalizeRole(row.authorRoleRaw),
    replyTo: null,
  }
  if (row.replyToId && row.replyToMsgId != null) {
    const text = String(row.replyToContent ?? '')
    const preview = text.length > 160 ? `${text.slice(0, 157)}…` : text
    out.replyTo = {
      id: row.replyToMsgId,
      authorName: row.replyToAuthorName,
      authorId: row.replyToAuthorId,
      authorAvatar: row.replyToAuthorAvatar || null,
      authorRole: normalizeRole(row.replyToAuthorRoleRaw),
      preview,
    }
  }
  return out
}

function fetchChatMessageById(id, channelId) {
  const row = db.prepare(`${CHAT_MESSAGE_SQL} WHERE m.id = ? AND m.channel_id = ?`).get(id, channelId)
  return row ? mapChatMessageRow(row) : null
}

function loadChannelParam(req, res, next) {
  const raw = String(req.params.channelKey || '').trim()
  let ch = null
  if (/^\d+$/.test(raw)) {
    ch = fetchChannel(Number(raw))
  }
  if (!ch) ch = fetchChannelBySlug(raw.toLowerCase())
  if (!ch) {
    res.status(404).json({ error: 'Канал не найден' })
    return
  }
  req.channel = ch
  req.channelId = ch.id
  next()
}

function requireChannelAccess(req, res, next) {
  if (!hasChannelAccess(req.userId, req.channelId)) {
    res.status(403).json({ error: 'Нет доступа к этому каналу' })
    return
  }
  next()
}

function requireChannelStaff(req, res, next) {
  if (!isChannelStaff(req.userId, req.channelId)) {
    res.status(403).json({ error: 'Нужны права команды канала' })
    return
  }
  next()
}

function requireChannelPoster(req, res, next) {
  if (!isChannelStaff(req.userId, req.channelId)) {
    res.status(403).json({ error: 'Публиковать посты могут только команда канала' })
    return
  }
  next()
}

function requireChannelOwner(req, res, next) {
  if (isSiteAdminUser(req.userId)) {
    next()
    return
  }
  if (!isChannelOwner(req.userId, req.channelId)) {
    res.status(403).json({ error: 'Только владелец канала может это делать' })
    return
  }
  next()
}

function requireChannelRoleManager(req, res, next) {
  if (!canManageMemberRoles(req.userId, req.channelId)) {
    res.status(403).json({ error: 'Нужны права владельца или админа канала' })
    return
  }
  next()
}

function requireChannelPostDelete(req, res, next) {
  if (canManageMemberRoles(req.userId, req.channelId)) {
    next()
    return
  }
  res.status(403).json({ error: 'Удалять посты может только владелец или администратор канала' })
}

function requireChannelLiveOwner(req, res, next) {
  if (isChannelRecordOwner(req.userId, req.channel)) {
    next()
    return
  }
  res.status(403).json({ error: 'Вести эфир может только владелец канала' })
}

/** Если email в ADMIN_EMAILS — выдать admin (при каждом /api/me и входе, без перезапуска). */
function promoteAdminFromEnv(userRow) {
  if (!userRow) return null
  const emails = listAdminEmailsFromEnv()
  const em = normEmail(userRow.email)
  if (!emails.length || !emails.includes(em)) return userRow
  db.prepare(`UPDATE users SET role = 'admin' WHERE id = ?`).run(userRow.id)
  return fetchAuthUser(userRow.id)
}

function getSubscriptionRow(userId) {
  return db
    .prepare(
      `SELECT user_id AS userId, plan, status, current_period_end AS currentPeriodEnd, canceled_at AS canceledAt
       FROM subscriptions WHERE user_id = ?`
    )
    .get(userId)
}

function subscriptionPayload(row) {
  if (!row) return null
  const end = new Date(row.currentPeriodEnd)
  const active = end > new Date()
  return {
    active,
    plan: row.plan,
    currentPeriodEnd: row.currentPeriodEnd,
    status: row.status,
    canceledAt: row.canceledAt,
  }
}

function isSubscriber(userId) {
  const row = getSubscriptionRow(userId)
  if (!row) return false
  return new Date(row.currentPeriodEnd) > new Date()
}

function requireAuth(req, res, next) {
  const h = req.headers.authorization || ''
  const m = h.match(/^Bearer\s+(.+)$/i)
  const uid = verifyToken(m?.[1])
  if (!uid) {
    res.status(401).json({ error: 'Требуется вход' })
    return
  }
  let row = fetchAuthUser(uid)
  if (!row) {
    res.status(401).json({ error: 'Пользователь не найден' })
    return
  }
  row = promoteAdminFromEnv(row)
  req.userId = uid
  req.authUser = row
  next()
}

function requireNotBanned(req, res, next) {
  const b = banInfo(req.authUser)
  if (b.active) {
    res.status(403).json({
      error: b.reason ? `Аккаунт ограничен: ${b.reason}` : 'Аккаунт ограничен',
      code: 'banned',
      banReason: b.reason,
      banUntil: b.until,
    })
    return
  }
  next()
}

function requireAdmin(req, res, next) {
  if (normalizeRole(req.authUser.role) !== 'admin') {
    res.status(403).json({ error: 'Нужны права администратора' })
    return
  }
  next()
}

function requireStaff(req, res, next) {
  const r = normalizeRole(req.authUser.role)
  if (r !== 'admin' && r !== 'moderator') {
    res.status(403).json({ error: 'Нужны права модератора или администратора' })
    return
  }
  next()
}

function mapPostRow(row) {
  if (!row) return null
  return {
    id: row.id,
    content: row.content,
    createdAt: row.createdAt,
    pinnedAt: row.pinnedAt || null,
    authorName: row.authorName,
    authorId: row.authorId,
    authorAvatar: row.authorAvatar || null,
    imagePath: row.imagePath || null,
  }
}

function loadPostImagePaths(postId) {
  return db
    .prepare(`SELECT path FROM post_images WHERE post_id = ? ORDER BY sort_order, id`)
    .all(postId)
    .map((r) => r.path)
}

function loadPostImagePathsBulk(postIds) {
  if (!postIds.length) return new Map()
  const unique = [...new Set(postIds)]
  const ph = unique.map(() => '?').join(',')
  const rows = db
    .prepare(
      `SELECT post_id AS postId, path FROM post_images WHERE post_id IN (${ph}) ORDER BY post_id, sort_order, id`
    )
    .all(...unique)
  const m = new Map()
  for (const r of rows) {
    if (!m.has(r.postId)) m.set(r.postId, [])
    m.get(r.postId).push(r.path)
  }
  return m
}

function enrichPostsWithImages(posts) {
  if (!posts?.length) return posts || []
  const bulk = loadPostImagePathsBulk(posts.map((p) => p.id))
  return posts.map((p) => {
    const fromTable = bulk.get(p.id) || []
    const paths = fromTable.length ? fromTable : p.imagePath ? [p.imagePath] : []
    return { ...p, imagePaths: paths, imagePath: paths[0] || null }
  })
}

function deletePostAndAssets(postId) {
  const row = db.prepare(`SELECT id, image_path AS imagePath FROM posts WHERE id = ?`).get(postId)
  if (!row) return false
  const paths = loadPostImagePaths(postId)
  if (row.imagePath && !paths.includes(row.imagePath)) paths.push(row.imagePath)
  for (const pth of paths) safeUnlinkUpload(pth)
  db.prepare(`DELETE FROM posts WHERE id = ?`).run(postId)
  return true
}

function fetchPostRowById(postId) {
  return db
    .prepare(
      `SELECT p.id, p.content, p.created_at AS createdAt, p.pinned_at AS pinnedAt, p.image_path AS imagePath,
              u.display_name AS authorName, u.id AS authorId, u.avatar_path AS authorAvatar
       FROM posts p JOIN users u ON u.id = p.user_id WHERE p.id = ?`
    )
    .get(postId)
}

function mapCommentRow(row) {
  if (!row) return null
  const out = {
    id: row.id,
    content: row.content,
    createdAt: row.createdAt,
    authorName: row.authorName,
    authorId: row.authorId,
    authorAvatar: row.authorAvatar || null,
  }
  if (row.replyToId && row.replyToCommentId != null) {
    const text = String(row.replyToContent ?? '')
    const preview = text.length > 100 ? `${text.slice(0, 99)}…` : text
    out.replyTo = {
      id: row.replyToCommentId,
      authorName: row.replyToAuthorName,
      preview,
    }
  } else {
    out.replyTo = null
  }
  return out
}

const COMMENT_ROW_SQL = `
SELECT c.id, c.content, c.created_at AS createdAt, u.display_name AS authorName, u.id AS authorId,
       u.avatar_path AS authorAvatar,
       c.reply_to_id AS replyToId,
       pr.id AS replyToCommentId, pu.display_name AS replyToAuthorName, pr.content AS replyToContent
FROM post_comments c
JOIN users u ON u.id = c.user_id
LEFT JOIN post_comments pr ON pr.id = c.reply_to_id
LEFT JOIN users pu ON pu.id = pr.user_id`.trim()

const REACTION_KINDS = new Set(['like', 'fire', 'clap', 'heart', '100'])

function normalizeReactionKind(raw) {
  const k = String(raw || 'like').toLowerCase()
  return REACTION_KINDS.has(k) ? k : null
}

function attachPostReactions(userId, posts) {
  if (!posts.length) return posts
  const ids = posts.map((p) => p.id)
  const ph = ids.map(() => '?').join(',')
  const countsRows = db
    .prepare(
      `SELECT post_id AS postId, kind, COUNT(*) AS cnt FROM post_reactions WHERE post_id IN (${ph}) GROUP BY post_id, kind`
    )
    .all(...ids)
  const mineRows = db
    .prepare(`SELECT post_id AS postId, kind FROM post_reactions WHERE user_id = ? AND post_id IN (${ph})`)
    .all(userId, ...ids)

  const countsMap = new Map()
  for (const r of countsRows) {
    if (!countsMap.has(r.postId)) countsMap.set(r.postId, {})
    countsMap.get(r.postId)[r.kind] = r.cnt
  }
  const mineMap = new Map(mineRows.map((r) => [r.postId, r.kind]))

  return posts.map((p) => ({
    ...p,
    reactionCounts: countsMap.get(p.id) || {},
    myReaction: mineMap.get(p.id) || null,
  }))
}

function reactionSnapshot(postId, userId) {
  const countsRows = db
    .prepare(`SELECT kind, COUNT(*) AS cnt FROM post_reactions WHERE post_id = ? GROUP BY kind`)
    .all(postId)
  const mine = db.prepare(`SELECT kind FROM post_reactions WHERE post_id = ? AND user_id = ?`).get(postId, userId)
  const reactionCounts = {}
  for (const r of countsRows) reactionCounts[r.kind] = r.cnt
  return { reactionCounts, myReaction: mine?.kind || null }
}

function purgeExpiredPasswordResets() {
  db.prepare(`DELETE FROM password_reset_tokens WHERE expires_at < datetime('now')`).run()
}

function hashPasswordResetToken(raw) {
  return crypto.createHash('sha256').update(String(raw), 'utf8').digest('hex')
}

app.post('/api/auth/forgot-password', forgotPasswordLimiter, (req, res) => {
  const email = String(req.body?.email || '')
    .trim()
    .toLowerCase()
  const okResponse = {
    ok: true,
    message: IS_PRODUCTION
      ? 'Если этот email зарегистрирован, проверьте почту или свяжитесь с администратором.'
      : 'Если этот email зарегистрирован, ссылка для нового пароля выведена в консоль сервера (режим разработки).',
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.json(okResponse)
    return
  }
  purgeExpiredPasswordResets()
  const user = db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE').get(email)
  if (!user) {
    res.json(okResponse)
    return
  }
  db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(user.id)
  const rawToken = crypto.randomBytes(32).toString('base64url')
  const tokenHash = hashPasswordResetToken(rawToken)
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
  db.prepare(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)`
  ).run(user.id, tokenHash, expiresAt)
  const publicBase = String(process.env.APP_PUBLIC_URL || '').replace(/\/$/, '')
  const originGuess = !IS_PRODUCTION && !publicBase ? 'http://127.0.0.1:5173' : publicBase
  const resetPath = `/reset-password?token=${encodeURIComponent(rawToken)}`
  const logLink = originGuess ? `${originGuess}${resetPath}` : resetPath
  if (!IS_PRODUCTION || process.env.LOG_PASSWORD_RESET_LINK === '1') {
    console.log(`[vibe] Восстановление пароля (${email}): ${logLink}`)
  }
  res.json(okResponse)
})

app.post('/api/auth/reset-password', authLimiter, (req, res) => {
  purgeExpiredPasswordResets()
  const token = String(req.body?.token || '').trim()
  const password = String(req.body?.password || '')
  if (!token || !password) {
    res.status(400).json({ error: 'Укажите код со ссылки и новый пароль' })
    return
  }
  if (password.length > AUTH_MAX_PASSWORD_LENGTH) {
    res.status(400).json({ error: `Пароль не длиннее ${AUTH_MAX_PASSWORD_LENGTH} символов` })
    return
  }
  if (password.length < AUTH_MIN_PASSWORD_LENGTH) {
    res.status(400).json({
      error: `Пароль не короче ${AUTH_MIN_PASSWORD_LENGTH} символов`,
    })
    return
  }
  const tokenHash = hashPasswordResetToken(token)
  const row = db
    .prepare(
      `SELECT id, user_id AS userId, expires_at AS expiresAt FROM password_reset_tokens WHERE token_hash = ?`
    )
    .get(tokenHash)
  if (!row) {
    res.status(400).json({ error: 'Неверная или устаревшая ссылка. Запросите сброс пароля снова.' })
    return
  }
  if (new Date(row.expiresAt) <= new Date()) {
    db.prepare('DELETE FROM password_reset_tokens WHERE id = ?').run(row.id)
    res.status(400).json({ error: 'Срок ссылки истёк. Запросите сброс пароля снова.' })
    return
  }
  const passwordHash = bcrypt.hashSync(password, BCRYPT_ROUNDS)
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, row.userId)
  db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(row.userId)
  res.json({ ok: true, message: 'Пароль обновлён. Можно войти.' })
})

app.post('/api/auth/register', authLimiter, (req, res) => {
  const email = String(req.body?.email || '')
    .trim()
    .toLowerCase()
  const password = String(req.body?.password || '')
  let displayName = String(req.body?.displayName || '').trim()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'Укажите корректный email' })
    return
  }
  if (password.length > AUTH_MAX_PASSWORD_LENGTH) {
    res.status(400).json({ error: `Пароль не длиннее ${AUTH_MAX_PASSWORD_LENGTH} символов` })
    return
  }
  if (password.length < AUTH_MIN_PASSWORD_LENGTH) {
    res.status(400).json({
      error: `Пароль не короче ${AUTH_MIN_PASSWORD_LENGTH} символов`,
    })
    return
  }
  if (!displayName) displayName = email.split('@')[0] || 'Участник'
  const passwordHash = bcrypt.hashSync(password, BCRYPT_ROUNDS)
  try {
    const info = db
      .prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)')
      .run(email, passwordHash, displayName)
    const token = signToken(info.lastInsertRowid)
    let urow = fetchAuthUser(info.lastInsertRowid)
    urow = promoteAdminFromEnv(urow)
    const user = mapUserPublic(urow)
    res.status(201).json({ token, user })
  } catch (e) {
    if (String(e).includes('UNIQUE')) {
      res.status(409).json({ error: 'Этот email уже зарегистрирован' })
      return
    }
    throw e
  }
})

app.post('/api/auth/login', authLimiter, (req, res) => {
  const email = String(req.body?.email || '')
    .trim()
    .toLowerCase()
  const password = String(req.body?.password || '')
  if (!email || !password) {
    res.status(400).json({ error: 'Email и пароль обязательны' })
    return
  }
  if (password.length > AUTH_MAX_PASSWORD_LENGTH) {
    res.status(401).json({ error: 'Неверный email или пароль' })
    return
  }
  const row = db.prepare('SELECT id, password_hash FROM users WHERE email = ? COLLATE NOCASE').get(email)
  if (!row) {
    res.status(401).json({ error: 'Неверный email или пароль' })
    return
  }
  const hasPassword =
    row.password_hash != null && String(row.password_hash).length > 0
  if (!hasPassword) {
    res.status(401).json({
      error:
        'Для этого аккаунта задан вход через соцсеть (Google, VK или Яндекс). Пароль не используется.',
    })
    return
  }
  if (!bcrypt.compareSync(password, row.password_hash)) {
    res.status(401).json({ error: 'Неверный email или пароль' })
    return
  }
  const token = signToken(row.id)
  let urow = fetchAuthUser(row.id)
  urow = promoteAdminFromEnv(urow)
  const user = mapUserPublic(urow)
  res.json({ token, user })
})

function postLoginUser(userId) {
  let urow = fetchAuthUser(userId)
  if (!urow) return { error: 'no_user' }
  const b = banInfo(urow)
  if (b.active) {
    return { error: 'banned', message: b.reason || 'Аккаунт заблокирован' }
  }
  urow = promoteAdminFromEnv(urow)
  return { token: signToken(userId), user: mapUserPublic(urow) }
}

registerOAuthRoutes(app, { postLoginUser, authLimiter })

app.get('/api/users/search', requireAuth, requireNotBanned, (req, res) => {
  const raw = String(req.query.q || '').trim()
  const esc = raw.replace(/[%_\\]/g, '')
  if (esc.length < 2) {
    res.json({ users: [] })
    return
  }
  const like = `%${esc.toLowerCase()}%`
  const rows = db
    .prepare(
      `SELECT id, display_name AS displayName, avatar_path AS avatarUrl
       FROM users
       WHERE id != ? AND banned = 0
         AND (lower(email) LIKE ? OR lower(display_name) LIKE ?)
       ORDER BY display_name COLLATE NOCASE ASC
       LIMIT 25`
    )
    .all(req.userId, like, like)
  res.json({
    users: rows.map((r) => ({
      id: r.id,
      displayName: r.displayName,
      avatarUrl: r.avatarUrl || null,
    })),
  })
})

app.get('/api/dm/conversations', requireAuth, requireNotBanned, (req, res) => {
  const uid = req.userId
  const peerRows = db
    .prepare(
      `SELECT peerUserId, MAX(created_at) AS lastAt FROM (
         SELECT recipient_id AS peerUserId, created_at FROM direct_messages WHERE sender_id = ?
         UNION ALL
         SELECT sender_id AS peerUserId, created_at FROM direct_messages WHERE recipient_id = ?
       ) GROUP BY peerUserId ORDER BY lastAt DESC`
    )
    .all(uid, uid)
  const conversations = []
  for (const p of peerRows) {
    const peerId = p.peerUserId
    const peer = db
      .prepare(`SELECT id, display_name AS displayName, avatar_path AS avatarUrl FROM users WHERE id = ?`)
      .get(peerId)
    if (!peer) continue
    const last = db
      .prepare(
        `SELECT id, content, created_at AS createdAt, sender_id AS senderId, recipient_id AS recipientId
         FROM direct_messages
         WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
         ORDER BY id DESC LIMIT 1`
      )
      .get(uid, peerId, peerId, uid)
    conversations.push({
      peer: {
        id: peer.id,
        displayName: peer.displayName,
        avatarUrl: peer.avatarUrl || null,
      },
      lastMessage: last ? mapDirectMessageRow(last, uid) : null,
    })
  }
  res.json({ conversations })
})

app.get('/api/dm/with/:otherUserId', requireAuth, requireNotBanned, (req, res) => {
  const otherId = Number(req.params.otherUserId)
  if (!Number.isFinite(otherId) || otherId <= 0 || otherId === req.userId) {
    res.status(400).json({ error: 'Некорректный собеседник' })
    return
  }
  const other = db.prepare(`SELECT id FROM users WHERE id = ? AND banned = 0`).get(otherId)
  if (!other) {
    res.status(404).json({ error: 'Пользователь не найден' })
    return
  }
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50))
  const beforeId = Number(req.query.beforeId) || null
  let rows
  if (beforeId) {
    rows = db
      .prepare(
        `SELECT id, content, created_at AS createdAt, sender_id AS senderId, recipient_id AS recipientId
         FROM direct_messages
         WHERE ((sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?))
           AND id < ?
         ORDER BY id DESC LIMIT ?`
      )
      .all(req.userId, otherId, otherId, req.userId, beforeId, limit)
  } else {
    rows = db
      .prepare(
        `SELECT id, content, created_at AS createdAt, sender_id AS senderId, recipient_id AS recipientId
         FROM direct_messages
         WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
         ORDER BY id DESC LIMIT ?`
      )
      .all(req.userId, otherId, otherId, req.userId, limit)
  }
  rows.reverse()
  res.json({
    messages: rows.map((r) => mapDirectMessageRow(r, req.userId)),
    peer: db
      .prepare(`SELECT id, display_name AS displayName, avatar_path AS avatarUrl FROM users WHERE id = ?`)
      .get(otherId),
  })
})

app.post('/api/dm/with/:otherUserId', requireAuth, requireNotBanned, (req, res) => {
  const otherId = Number(req.params.otherUserId)
  if (!Number.isFinite(otherId) || otherId <= 0 || otherId === req.userId) {
    res.status(400).json({ error: 'Некорректный собеседник' })
    return
  }
  const other = fetchAuthUser(otherId)
  if (!other || banInfo(other).active) {
    res.status(404).json({ error: 'Пользователь недоступен' })
    return
  }
  const text = String(req.body?.content ?? '').trim()
  if (!text) {
    res.status(400).json({ error: 'Введите текст сообщения' })
    return
  }
  if (text.length > MAX_DM_LEN) {
    res.status(400).json({ error: `Максимум ${MAX_DM_LEN} символов` })
    return
  }
  const info = db
    .prepare(
      `INSERT INTO direct_messages (sender_id, recipient_id, content) VALUES (?, ?, ?)`
    )
    .run(req.userId, otherId, text)
  const row = db
    .prepare(
      `SELECT id, content, created_at AS createdAt, sender_id AS senderId, recipient_id AS recipientId
       FROM direct_messages WHERE id = ?`
    )
    .get(info.lastInsertRowid)
  const msg = mapDirectMessageRow(row, req.userId)
  const msgForPeer = mapDirectMessageRow(row, otherId)
  const fromPublic = mapUserPublic(promoteAdminFromEnv(fetchAuthUser(req.userId)))
  io.to(`u:${otherId}`).emit('dm:message', {
    message: msgForPeer,
    fromUser: fromPublic
      ? { id: fromPublic.id, displayName: fromPublic.displayName, avatarUrl: fromPublic.avatarUrl }
      : null,
  })
  res.status(201).json({ message: msg })
})

app.get('/api/me', requireAuth, (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate')
  const row = promoteAdminFromEnv(req.authUser)
  const user = mapUserPublic(row)
  const channels = listChannelsForUser(req.userId)
  res.json({ user, channels })
})

app.patch('/api/me', requireAuth, (req, res) => {
  const name = String(req.body?.displayName || '').trim()
  if (!name || name.length > 80) {
    res.status(400).json({ error: 'Имя от 1 до 80 символов' })
    return
  }
  db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(name, req.userId)
  const urow = promoteAdminFromEnv(fetchAuthUser(req.userId))
  res.json({ user: mapUserPublic(urow) })
})

app.post('/api/me/avatar', requireAuth, requireNotBanned, uploadAvatarRequired, (req, res) => {
  const prevRow = fetchAuthUser(req.userId)
  safeUnlinkUpload(prevRow?.avatarPath)
  const rel = `/uploads/${req.file.filename}`
  db.prepare('UPDATE users SET avatar_path = ? WHERE id = ?').run(rel, req.userId)
  const urow = promoteAdminFromEnv(fetchAuthUser(req.userId))
  res.json({ user: mapUserPublic(urow) })
})

function addPeriodMs(plan, fromDate) {
  const d = new Date(fromDate)
  const ms = plan === 'year' ? 365 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000
  return new Date(d.getTime() + ms).toISOString()
}

function parseChannelPriceRub(raw, max) {
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.min(max, Math.round(n))
}

app.get('/api/channels', requireAuth, (req, res) => {
  res.json({ channels: listChannelsForUser(req.userId) })
})

app.get('/api/channels/lookup', requireAuth, (req, res) => {
  const slug = String(req.query.slug || '').trim().toLowerCase()
  if (!isValidSlug(slug)) {
    res.status(400).json({ error: 'Укажите корректный адрес канала (латиница, 2–50 символов)' })
    return
  }
  const ch = fetchChannelBySlug(slug)
  if (!ch) {
    res.status(404).json({ error: 'Канал не найден' })
    return
  }
  if (ch.blocked && !isSiteAdminUser(req.userId)) {
    res.status(403).json({ error: 'Канал заблокирован администрацией сайта' })
    return
  }
  const m = getMembership(req.userId, ch.id)
  res.json({
    channel: {
      id: ch.id,
      slug: ch.slug,
      name: ch.name,
      description: ch.description || null,
      priceMonth: ch.priceMonth ?? 0,
      priceYear: ch.priceYear ?? 0,
      bannerPath: ch.bannerPath || null,
      socialLinks: ch.socialLinks || [],
      blocked: !!ch.blocked,
      blockedReason: ch.blockedReason || null,
    },
    alreadyMember: !!m,
  })
})

app.post('/api/channels', requireAuth, requireNotBanned, (req, res) => {
  const name = String(req.body?.name || '').trim()
  let slug = String(req.body?.slug || '').trim().toLowerCase()
  const descRaw = String(req.body?.description || '').trim()
  if (descRaw.length > 2000) {
    res.status(400).json({ error: 'Описание не длиннее 2000 символов' })
    return
  }
  const description = descRaw || null
  const priceMonth = parseChannelPriceRub(req.body?.priceMonth, 999_999)
  const priceYear = parseChannelPriceRub(req.body?.priceYear, 9_999_999)
  if (!name || name.length > 80) {
    res.status(400).json({ error: 'Название от 1 до 80 символов' })
    return
  }
  if (!slug) {
    const base = name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 40)
    slug = base && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(base) ? base : `club-${req.userId}-${Date.now().toString(36)}`
  }
  if (!isValidSlug(slug)) {
    res.status(400).json({ error: 'Адрес канала (slug): латиница, цифры и дефис, 2–50 символов' })
    return
  }
  try {
    const info = db
      .prepare(
        `INSERT INTO channels (slug, name, description, owner_id, price_month, price_year) VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(slug, name, description, req.userId, priceMonth, priceYear)
    const cid = info.lastInsertRowid
    db.prepare(`INSERT INTO channel_members (channel_id, user_id, role) VALUES (?, ?, 'owner')`).run(cid, req.userId)
    res.status(201).json({ channel: fetchChannel(cid) })
  } catch (e) {
    if (String(e).includes('UNIQUE')) {
      res.status(409).json({ error: 'Такой адрес канала уже занят' })
      return
    }
    throw e
  }
})

app.post('/api/channels/join', requireAuth, requireNotBanned, (req, res) => {
  const slug = String(req.body?.slug || '').trim().toLowerCase()
  const ch = fetchChannelBySlug(slug)
  if (!ch) {
    res.status(404).json({ error: 'Канал не найден' })
    return
  }
  if (ch.blocked && !isSiteAdminUser(req.userId)) {
    res.status(403).json({ error: 'Канал заблокирован, вступление недоступно' })
    return
  }
  db.prepare(`INSERT OR IGNORE INTO channel_members (channel_id, user_id, role) VALUES (?, ?, 'member')`).run(
    ch.id,
    req.userId
  )
  res.json({ channel: ch })
})

app.get('/api/channels/:channelKey/summary', requireAuth, loadChannelParam, (req, res) => {
  const m = getMembership(req.userId, req.channelId)
  res.json({
    channel: req.channel,
    myRole: m ? normalizeChannelRole(m.role) : null,
    subscription: channelSubPayload(req.channelId, req.userId),
    hasAccess: hasChannelAccess(req.userId, req.channelId),
  })
})

app.post('/api/channels/:channelKey/subscription/activate', requireAuth, requireNotBanned, loadChannelParam, (req, res) => {
  if (req.channel?.blocked && !isSiteAdminUser(req.userId)) {
    res.status(403).json({ error: 'Канал заблокирован' })
    return
  }
  if (!getMembership(req.userId, req.channelId)) {
    res.status(403).json({ error: 'Сначала присоединитесь к каналу (вступление по адресу)' })
    return
  }
  if (isChannelStaff(req.userId, req.channelId)) {
    res.json({ subscription: channelSubPayload(req.channelId, req.userId) })
    return
  }
  if (!isMockSubscriptionAllowed()) {
    res.status(503).json({
      error: 'Продление подписки через сайт пока недоступно. Ожидается подключение оплаты.',
      code: 'payment_required',
    })
    return
  }
  const plan = req.body?.plan === 'year' ? 'year' : 'month'
  const now = new Date()
  const existing = db
    .prepare(`SELECT * FROM channel_subscriptions WHERE channel_id = ? AND user_id = ?`)
    .get(req.channelId, req.userId)
  let newEnd
  if (!existing) {
    newEnd = addPeriodMs(plan, now)
    db.prepare(
      `INSERT INTO channel_subscriptions (channel_id, user_id, plan, status, current_period_end, canceled_at, updated_at)
       VALUES (?, ?, ?, 'active', ?, NULL, datetime('now'))`
    ).run(req.channelId, req.userId, plan, newEnd)
  } else {
    const prevEnd = new Date(existing.current_period_end)
    const base = prevEnd > now ? prevEnd : now
    newEnd = addPeriodMs(plan, base)
    db.prepare(
      `UPDATE channel_subscriptions SET plan = ?, status = 'active', current_period_end = ?, canceled_at = NULL, updated_at = datetime('now')
       WHERE channel_id = ? AND user_id = ?`
    ).run(plan, newEnd, req.channelId, req.userId)
  }
  db.prepare(`INSERT OR IGNORE INTO channel_members (channel_id, user_id, role) VALUES (?, ?, 'member')`).run(
    req.channelId,
    req.userId
  )
  res.json({ subscription: channelSubPayload(req.channelId, req.userId) })
})

app.post('/api/channels/:channelKey/subscription/cancel', requireAuth, loadChannelParam, (req, res) => {
  if (isChannelStaff(req.userId, req.channelId)) {
    res.status(400).json({ error: 'Для команды канала подписка не оформляется' })
    return
  }
  const row = db
    .prepare(`SELECT * FROM channel_subscriptions WHERE channel_id = ? AND user_id = ?`)
    .get(req.channelId, req.userId)
  if (!row) {
    res.status(400).json({ error: 'Подписка на канал не найдена' })
    return
  }
  if (new Date(row.current_period_end) <= new Date()) {
    res.status(400).json({ error: 'Период уже истёк' })
    return
  }
  db.prepare(
    `UPDATE channel_subscriptions SET status = 'canceled', canceled_at = datetime('now'), updated_at = datetime('now')
     WHERE channel_id = ? AND user_id = ?`
  ).run(req.channelId, req.userId)
  res.json({ subscription: channelSubPayload(req.channelId, req.userId) })
})

app.post(
  '/api/channels/:channelKey/banner',
  requireAuth,
  requireNotBanned,
  loadChannelParam,
  requireChannelOwner,
  uploadBannerRequired,
  (req, res) => {
    const ch = fetchChannel(req.channelId)
    safeUnlinkUpload(ch?.bannerPath)
    const rel = `/uploads/${req.file.filename}`
    db.prepare('UPDATE channels SET banner_path = ? WHERE id = ?').run(rel, req.channelId)
    res.json({ channel: fetchChannel(req.channelId) })
  }
)

app.patch(
  '/api/channels/:channelKey/settings',
  requireAuth,
  requireNotBanned,
  loadChannelParam,
  requireChannelOwner,
  (req, res) => {
    let did = false
    if (req.body?.description !== undefined) {
      const t = String(req.body.description || '').trim()
      if (t.length > 2000) {
        res.status(400).json({ error: 'Описание не длиннее 2000 символов' })
        return
      }
      db.prepare('UPDATE channels SET description = ? WHERE id = ?').run(t || null, req.channelId)
      did = true
    }
    if (req.body?.socialLinks !== undefined) {
      const links = normalizeSocialLinksInput(req.body.socialLinks)
      db.prepare('UPDATE channels SET social_links = ? WHERE id = ?').run(JSON.stringify(links), req.channelId)
      did = true
    }
    if (!did) {
      res.status(400).json({ error: 'Укажите description и/или socialLinks' })
      return
    }
    res.json({ channel: fetchChannel(req.channelId) })
  }
)

app.get(
  '/api/channels/:channelKey/members',
  requireAuth,
  requireNotBanned,
  loadChannelParam,
  requireChannelStaff,
  (req, res) => {
    const rows = db
      .prepare(
        `SELECT u.id, u.email, u.display_name AS displayName, u.avatar_path AS avatarUrl, cm.role
         FROM channel_members cm JOIN users u ON u.id = cm.user_id
         WHERE cm.channel_id = ? ORDER BY cm.role DESC, u.display_name COLLATE NOCASE`
      )
      .all(req.channelId)
    res.json({
      members: rows.map((r) => ({
        id: r.id,
        email: r.email,
        displayName: r.displayName,
        avatarUrl: r.avatarUrl || null,
        role: normalizeChannelRole(r.role),
      })),
    })
  }
)

function pastDayKeys(count) {
  const out = []
  const now = new Date()
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const da = String(d.getDate()).padStart(2, '0')
    out.push(`${y}-${m}-${da}`)
  }
  return out
}

function seriesFromRows(keys, rows, valueKey = 'cnt') {
  const map = new Map(rows.map((r) => [r.d, r[valueKey]]))
  return keys.map((k) => ({ date: k, count: map.get(k) ?? 0 }))
}

app.get(
  '/api/channels/:channelKey/analytics',
  requireAuth,
  requireNotBanned,
  loadChannelParam,
  requireChannelAccess,
  requireChannelRoleManager,
  (req, res) => {
    const cid = req.channelId
    const ch = req.channel
    const priceMonth = Number(ch.priceMonth) || 0
    const priceYear = Number(ch.priceYear) || 0

    const roleRows = db
      .prepare(
        `SELECT lower(trim(role)) AS role, COUNT(*) AS c FROM channel_members WHERE channel_id = ? GROUP BY lower(trim(role))`
      )
      .all(cid)
    const byRole = { owner: 0, admin: 0, moderator: 0, member: 0 }
    let membersTotal = 0
    for (const r of roleRows) {
      const k = normalizeChannelRole(r.role)
      if (k in byRole) {
        byRole[k] = r.c
        membersTotal += r.c
      }
    }

    const activeSubRow = db
      .prepare(
        `SELECT COUNT(*) AS c FROM channel_subscriptions
         WHERE channel_id = ? AND status = 'active' AND datetime(current_period_end) > datetime('now')`
      )
      .get(cid)
    const activeSubscriptions = activeSubRow?.c ?? 0

    const planRows = db
      .prepare(
        `SELECT plan, COUNT(*) AS c FROM channel_subscriptions
         WHERE channel_id = ? AND status = 'active' AND datetime(current_period_end) > datetime('now')
         GROUP BY plan`
      )
      .all(cid)
    let activeMonthPlan = 0
    let activeYearPlan = 0
    for (const p of planRows) {
      if (p.plan === 'year') activeYearPlan = p.c
      else activeMonthPlan = p.c
    }

    const expiringRow = db
      .prepare(
        `SELECT COUNT(*) AS c FROM channel_subscriptions
         WHERE channel_id = ? AND status = 'active'
           AND datetime(current_period_end) > datetime('now')
           AND datetime(current_period_end) <= datetime('now', '+7 days')`
      )
      .get(cid)
    const expiringIn7Days = expiringRow?.c ?? 0

    const inactiveSubRow = db
      .prepare(
        `SELECT COUNT(*) AS c FROM channel_subscriptions
         WHERE channel_id = ?
           AND (status = 'canceled' OR (status = 'active' AND datetime(current_period_end) <= datetime('now')))`
      )
      .get(cid)
    const inactiveOrCanceled = inactiveSubRow?.c ?? 0

    const postsTotal =
      db.prepare(`SELECT COUNT(*) AS c FROM posts WHERE channel_id = ?`).get(cid)?.c ?? 0
    const postsLast7 =
      db
        .prepare(
          `SELECT COUNT(*) AS c FROM posts WHERE channel_id = ? AND created_at >= datetime('now', '-7 days')`
        )
        .get(cid)?.c ?? 0
    const postsLast30 =
      db
        .prepare(
          `SELECT COUNT(*) AS c FROM posts WHERE channel_id = ? AND created_at >= datetime('now', '-30 days')`
        )
        .get(cid)?.c ?? 0
    const pinnedPosts =
      db
        .prepare(`SELECT COUNT(*) AS c FROM posts WHERE channel_id = ? AND pinned_at IS NOT NULL`)
        .get(cid)?.c ?? 0

    const commentsTotal =
      db
        .prepare(
          `SELECT COUNT(*) AS c FROM post_comments pc
           INNER JOIN posts p ON p.id = pc.post_id WHERE p.channel_id = ?`
        )
        .get(cid)?.c ?? 0
    const commentsLast7 =
      db
        .prepare(
          `SELECT COUNT(*) AS c FROM post_comments pc
           INNER JOIN posts p ON p.id = pc.post_id
           WHERE p.channel_id = ? AND pc.created_at >= datetime('now', '-7 days')`
        )
        .get(cid)?.c ?? 0

    const chatTotal =
      db.prepare(`SELECT COUNT(*) AS c FROM chat_messages WHERE channel_id = ?`).get(cid)?.c ?? 0
    const chatLast7 =
      db
        .prepare(
          `SELECT COUNT(*) AS c FROM chat_messages WHERE channel_id = ? AND created_at >= datetime('now', '-7 days')`
        )
        .get(cid)?.c ?? 0

    const dayKeys = pastDayKeys(14)
    const postDayRows = db
      .prepare(
        `SELECT date(created_at) AS d, COUNT(*) AS cnt FROM posts
         WHERE channel_id = ? AND date(created_at) >= date('now', '-13 days')
         GROUP BY date(created_at)`
      )
      .all(cid)
    const chatDayRows = db
      .prepare(
        `SELECT date(created_at) AS d, COUNT(*) AS cnt FROM chat_messages
         WHERE channel_id = ? AND date(created_at) >= date('now', '-13 days')
         GROUP BY date(created_at)`
      )
      .all(cid)

    const recentSubs = db
      .prepare(
        `SELECT u.id AS userId, u.display_name AS displayName, u.email,
                cs.plan, cs.status, cs.current_period_end AS currentPeriodEnd,
                cs.updated_at AS updatedAt, cs.canceled_at AS canceledAt
         FROM channel_subscriptions cs
         JOIN users u ON u.id = cs.user_id
         WHERE cs.channel_id = ?
         ORDER BY datetime(cs.updated_at) DESC LIMIT 25`
      )
      .all(cid)

    const estimatedMonthlyRub = activeMonthPlan * priceMonth + activeYearPlan * Math.round(priceYear / 12)

    res.json({
      channel: {
        name: ch.name,
        slug: ch.slug,
        priceMonth,
        priceYear,
        createdAt: ch.createdAt,
      },
      members: { total: membersTotal, byRole },
      subscriptions: {
        active: activeSubscriptions,
        activeByPlan: { month: activeMonthPlan, year: activeYearPlan },
        expiringIn7Days,
        inactiveOrCanceled,
        estimatedMonthlyRub,
      },
      content: {
        postsTotal,
        postsLast7Days: postsLast7,
        postsLast30Days: postsLast30,
        pinnedPosts,
        commentsTotal,
        commentsLast7Days: commentsLast7,
        chatMessagesTotal: chatTotal,
        chatMessagesLast7Days: chatLast7,
      },
      series: {
        postsPerDay: seriesFromRows(dayKeys, postDayRows),
        chatMessagesPerDay: seriesFromRows(dayKeys, chatDayRows),
      },
      recentSubscriptions: recentSubs.map((r) => ({
        userId: r.userId,
        displayName: r.displayName,
        email: r.email,
        plan: r.plan,
        status: r.status,
        currentPeriodEnd: r.currentPeriodEnd,
        updatedAt: r.updatedAt,
        canceledAt: r.canceledAt,
      })),
    })
  }
)

app.patch(
  '/api/channels/:channelKey/members/:memberUserId',
  requireAuth,
  requireNotBanned,
  loadChannelParam,
  requireChannelRoleManager,
  (req, res) => {
    const actorRole = getChannelMemberRole(req.userId, req.channelId)
    const isOwner = actorRole === 'owner' || isSiteAdminUser(req.userId)

    const targetId = Number(req.params.memberUserId)
    if (!Number.isFinite(targetId)) {
      res.status(400).json({ error: 'Некорректный пользователь' })
      return
    }
    if (targetId === req.userId) {
      res.status(400).json({ error: 'Нельзя изменить свою роль здесь' })
      return
    }
    if (targetId === req.channel.ownerId) {
      res.status(400).json({ error: 'Роль владельца не меняется этим способом' })
      return
    }
    const targetM = getMembership(targetId, req.channelId)
    if (!targetM) {
      res.status(404).json({ error: 'Пользователь не в канале' })
      return
    }
    if (normalizeChannelRole(targetM.role) === 'owner') {
      res.status(400).json({ error: 'Нельзя изменить владельца' })
      return
    }
    const role = String(req.body?.role || '').toLowerCase()
    if (!['member', 'moderator', 'admin'].includes(role)) {
      res.status(400).json({ error: 'Роль: member, moderator или admin' })
      return
    }
    if (role === 'admin' && !isOwner) {
      res.status(403).json({ error: 'Только владелец может назначать админов канала' })
      return
    }
    const targetRole = normalizeChannelRole(targetM.role)
    if (!isOwner && targetRole === 'admin') {
      res.status(403).json({ error: 'Нельзя менять роль другого админа канала' })
      return
    }
    db.prepare(`UPDATE channel_members SET role = ? WHERE channel_id = ? AND user_id = ?`).run(
      role,
      req.channelId,
      targetId
    )
    res.json({ ok: true })
  }
)

app.get(
  '/api/channels/:channelKey/posts',
  requireAuth,
  requireNotBanned,
  loadChannelParam,
  requireChannelAccess,
  (req, res) => {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50))
    const rows = db
      .prepare(
        `SELECT p.id, p.content, p.created_at AS createdAt, p.pinned_at AS pinnedAt, p.image_path AS imagePath,
                u.display_name AS authorName, u.id AS authorId, u.avatar_path AS authorAvatar
         FROM posts p JOIN users u ON u.id = p.user_id
         WHERE p.channel_id = ?
         ORDER BY (CASE WHEN p.pinned_at IS NOT NULL THEN 0 ELSE 1 END),
                  p.pinned_at DESC,
                  p.created_at DESC
         LIMIT ?`
      )
      .all(req.channelId, limit)
    const list = enrichPostsWithImages(rows.map(mapPostRow))
    res.json({ posts: attachPostReactions(req.userId, list), channelId: req.channelId })
  }
)

app.post(
  '/api/channels/:channelKey/posts',
  requireAuth,
  requireNotBanned,
  loadChannelParam,
  requireChannelAccess,
  requireChannelPoster,
  uploadPhotosOptional,
  (req, res) => {
    const content = String(req.body?.content ?? '').trim()
    const files = Array.isArray(req.files) ? req.files : []
    if (!content && !files.length) {
      res.status(400).json({ error: 'Добавьте текст или фото' })
      return
    }
    if (content.length > MAX_POST_LEN) {
      res.status(400).json({ error: `Максимум ${MAX_POST_LEN} символов` })
      return
    }
    const insertPostWithImages = db.transaction((userId, text, channelId, uploaded) => {
      const info = db
        .prepare('INSERT INTO posts (user_id, content, image_path, channel_id) VALUES (?, ?, ?, ?)')
        .run(userId, text || '', uploaded[0] ? `/uploads/${uploaded[0].filename}` : null, channelId)
      const postId = info.lastInsertRowid
      const insImg = db.prepare(
        'INSERT INTO post_images (post_id, path, sort_order) VALUES (?, ?, ?)'
      )
      for (let i = 0; i < uploaded.length; i++) {
        insImg.run(postId, `/uploads/${uploaded[i].filename}`, i)
      }
      return postId
    })
    const postId = insertPostWithImages(req.userId, content, req.channelId, files)
    const row = db
      .prepare(
        `SELECT p.id, p.content, p.created_at AS createdAt, p.pinned_at AS pinnedAt, p.image_path AS imagePath,
                u.display_name AS authorName, u.id AS authorId, u.avatar_path AS authorAvatar
         FROM posts p JOIN users u ON u.id = p.user_id WHERE p.id = ?`
      )
      .get(postId)
    const [enriched] = enrichPostsWithImages([mapPostRow(row)])
    const post = { ...enriched, reactionCounts: {}, myReaction: null }
    res.status(201).json({ post, channelId: req.channelId })
  }
)

app.patch(
  '/api/channels/:channelKey/posts/:postId/pin',
  requireAuth,
  requireNotBanned,
  loadChannelParam,
  requireChannelAccess,
  requireChannelPostDelete,
  (req, res) => {
    const postId = Number(req.params.postId)
    if (!Number.isFinite(postId)) {
      res.status(400).json({ error: 'Некорректный пост' })
      return
    }
    const row = db.prepare(`SELECT id FROM posts WHERE id = ? AND channel_id = ?`).get(postId, req.channelId)
    if (!row) {
      res.status(404).json({ error: 'Пост не найден' })
      return
    }
    const wantPin = req.body?.pinned === true
    if (wantPin) {
      db.prepare(`UPDATE posts SET pinned_at = datetime('now') WHERE id = ? AND channel_id = ?`).run(
        postId,
        req.channelId
      )
    } else {
      db.prepare(`UPDATE posts SET pinned_at = NULL WHERE id = ? AND channel_id = ?`).run(postId, req.channelId)
    }
    const fresh = db
      .prepare(
        `SELECT p.id, p.content, p.created_at AS createdAt, p.pinned_at AS pinnedAt, p.image_path AS imagePath,
                u.display_name AS authorName, u.id AS authorId, u.avatar_path AS authorAvatar
         FROM posts p JOIN users u ON u.id = p.user_id WHERE p.id = ?`
      )
      .get(postId)
    const [enriched] = enrichPostsWithImages([mapPostRow(fresh)])
    const withReactions = attachPostReactions(req.userId, [enriched])[0]
    io.to(`ch:${req.channelId}`).emit('post:pin', {
      channelId: req.channelId,
      postId,
      pinnedAt: withReactions.pinnedAt || null,
    })
    res.json({ post: withReactions, channelId: req.channelId })
  }
)

app.delete(
  '/api/channels/:channelKey/posts/:postId',
  requireAuth,
  requireNotBanned,
  loadChannelParam,
  requireChannelAccess,
  requireChannelPostDelete,
  (req, res) => {
    const postId = Number(req.params.postId)
    if (!Number.isFinite(postId)) {
      res.status(400).json({ error: 'Некорректный пост' })
      return
    }
    const row = db.prepare(`SELECT id FROM posts WHERE id = ? AND channel_id = ?`).get(postId, req.channelId)
    if (!row) {
      res.status(404).json({ error: 'Пост не найден' })
      return
    }
    deletePostAndAssets(postId)
    io.to(`ch:${req.channelId}`).emit('post:remove', { channelId: req.channelId, postId })
    res.json({ ok: true, postId })
  }
)

app.post(
  '/api/channels/:channelKey/posts/:postId/react',
  requireAuth,
  requireNotBanned,
  loadChannelParam,
  requireChannelAccess,
  (req, res) => {
    const postId = Number(req.params.postId)
    if (!Number.isFinite(postId)) {
      res.status(400).json({ error: 'Некорректный пост' })
      return
    }
    const post = db.prepare('SELECT id FROM posts WHERE id = ? AND channel_id = ?').get(postId, req.channelId)
    if (!post) {
      res.status(404).json({ error: 'Пост не найден' })
      return
    }
    const kind = normalizeReactionKind(req.body?.kind)
    if (!kind) {
      res.status(400).json({ error: 'Некорректная реакция' })
      return
    }
    const existing = db
      .prepare('SELECT kind FROM post_reactions WHERE post_id = ? AND user_id = ?')
      .get(postId, req.userId)
    if (existing?.kind === kind) {
      db.prepare('DELETE FROM post_reactions WHERE post_id = ? AND user_id = ?').run(postId, req.userId)
    } else {
      db.prepare(
        `INSERT INTO post_reactions (post_id, user_id, kind) VALUES (?, ?, ?)
         ON CONFLICT(post_id, user_id) DO UPDATE SET kind = excluded.kind, created_at = datetime('now')`
      ).run(postId, req.userId, kind)
    }
    const snap = reactionSnapshot(postId, req.userId)
    io.to(`ch:${req.channelId}`).emit('post:react', {
      channelId: req.channelId,
      postId,
      reactionCounts: snap.reactionCounts,
    })
    res.json({ postId, ...snap })
  }
)

app.get(
  '/api/channels/:channelKey/posts/:postId/comments',
  requireAuth,
  requireNotBanned,
  loadChannelParam,
  requireChannelAccess,
  (req, res) => {
    const postId = Number(req.params.postId)
    if (!Number.isFinite(postId)) {
      res.status(400).json({ error: 'Некорректный пост' })
      return
    }
    const post = db.prepare('SELECT id FROM posts WHERE id = ? AND channel_id = ?').get(postId, req.channelId)
    if (!post) {
      res.status(404).json({ error: 'Пост не найден' })
      return
    }
    const rows = db
      .prepare(
        `${COMMENT_ROW_SQL}
         WHERE c.post_id = ?
         ORDER BY c.created_at ASC, c.id ASC`
      )
      .all(postId)
    res.json({ comments: rows.map(mapCommentRow) })
  }
)

app.get(
  '/api/channels/:channelKey/chat/messages',
  requireAuth,
  requireNotBanned,
  loadChannelParam,
  requireChannelAccess,
  (req, res) => {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 80))
    const beforeId = Number(req.query.beforeId) || null
    let rows
    if (beforeId) {
      rows = db
        .prepare(
          `${CHAT_MESSAGE_SQL} WHERE m.channel_id = ? AND m.id < ? ORDER BY m.id DESC LIMIT ?`
        )
        .all(req.channelId, beforeId, limit)
    } else {
      rows = db
        .prepare(`${CHAT_MESSAGE_SQL} WHERE m.channel_id = ? ORDER BY m.id DESC LIMIT ?`)
        .all(req.channelId, limit)
    }
    rows.reverse()
    res.json({ messages: rows.map(mapChatMessageRow), channelId: req.channelId })
  }
)

app.get('/api/admin/users', requireAuth, requireStaff, (req, res) => {
  const q = String(req.query.q || '').trim()
  const esc = q.replace(/[%_\\]/g, '')
  let where = ''
  const params = []
  if (esc.length >= 1) {
    where = ` WHERE (lower(u.email) LIKE ? OR lower(u.display_name) LIKE ? OR CAST(u.id AS TEXT) LIKE ?)`
    const like = `%${esc.toLowerCase()}%`
    params.push(like, like, `%${esc}%`)
  }
  const rows = db
    .prepare(
      `SELECT u.id, u.email, u.display_name AS displayName, u.role, u.banned, u.ban_reason AS banReason, u.banned_until AS bannedUntil,
              u.created_at AS createdAt, s.current_period_end AS subscriptionEnds
       FROM users u
       LEFT JOIN subscriptions s ON s.user_id = u.id
       ${where}
       ORDER BY u.id ASC`
    )
    .all(...params)
  const users = rows.map((r) => {
    const b = banInfo({ banned: r.banned, banReason: r.banReason, bannedUntil: r.bannedUntil })
    return {
      id: r.id,
      email: r.email,
      displayName: r.displayName,
      role: normalizeRole(r.role),
      banned: b.active,
      banReason: b.active ? b.reason : null,
      banUntil: b.active ? b.until : null,
      createdAt: r.createdAt,
      subscriptionEnds: r.subscriptionEnds || null,
    }
  })
  res.json({ users })
})

app.patch('/api/admin/users/:id/role', requireAuth, requireAdmin, (req, res) => {
  const targetId = Number(req.params.id)
  const raw = String(req.body?.role || '').toLowerCase()
  if (!['user', 'moderator', 'admin'].includes(raw)) {
    res.status(400).json({ error: 'Укажите роль: user, moderator или admin' })
    return
  }
  if (targetId === req.userId) {
    res.status(400).json({ error: 'Нельзя изменить свою роль здесь' })
    return
  }
  const target = fetchAuthUser(targetId)
  if (!target) {
    res.status(404).json({ error: 'Пользователь не найден' })
    return
  }
  const prev = normalizeRole(target.role)
  if (prev === 'admin' && raw !== 'admin') {
    const { c } = db.prepare(`SELECT COUNT(*) AS c FROM users WHERE lower(role) = 'admin'`).get()
    if (c <= 1) {
      res.status(400).json({ error: 'Нельзя снять последнего администратора' })
      return
    }
  }
  db.prepare(`UPDATE users SET role = ? WHERE id = ?`).run(raw, targetId)
  res.json({ user: mapUserPublic(fetchAuthUser(targetId)) })
})

app.post('/api/admin/users/:id/ban', requireAuth, requireAdmin, (req, res) => {
  const targetId = Number(req.params.id)
  if (targetId === req.userId) {
    res.status(400).json({ error: 'Нельзя заблокировать себя' })
    return
  }
  const target = fetchAuthUser(targetId)
  if (!target) {
    res.status(404).json({ error: 'Пользователь не найден' })
    return
  }
  const reason = String(req.body?.reason || '').trim() || null
  const days = Number(req.body?.days) || 0
  let bannedUntil = null
  if (days > 0) {
    bannedUntil = new Date(Date.now() + days * 86400 * 1000).toISOString()
  }
  db.prepare(`UPDATE users SET banned = 1, ban_reason = ?, banned_until = ? WHERE id = ?`).run(reason, bannedUntil, targetId)
  res.json({ user: mapUserPublic(fetchAuthUser(targetId)) })
})

app.post('/api/admin/users/:id/unban', requireAuth, requireAdmin, (req, res) => {
  const targetId = Number(req.params.id)
  const target = fetchAuthUser(targetId)
  if (!target) {
    res.status(404).json({ error: 'Пользователь не найден' })
    return
  }
  db.prepare(`UPDATE users SET banned = 0, ban_reason = NULL, banned_until = NULL WHERE id = ?`).run(targetId)
  res.json({ user: mapUserPublic(fetchAuthUser(targetId)) })
})

app.get('/api/admin/channels', requireAuth, requireAdmin, (_req, res) => {
  const rows = db
    .prepare(
      `SELECT c.id, c.slug, c.name, COALESCE(c.blocked, 0) AS blocked, c.blocked_reason AS blockedReason,
              c.owner_id AS ownerId, u.display_name AS ownerName, u.email AS ownerEmail
       FROM channels c JOIN users u ON u.id = c.owner_id
       ORDER BY c.id ASC`
    )
    .all()
  res.json({ channels: rows })
})

app.patch('/api/admin/channels/:id', requireAuth, requireAdmin, (req, res) => {
  const cid = Number(req.params.id)
  if (!Number.isFinite(cid) || cid <= 0) {
    res.status(400).json({ error: 'Некорректный канал' })
    return
  }
  const ch = fetchChannel(cid)
  if (!ch) {
    res.status(404).json({ error: 'Канал не найден' })
    return
  }
  if (req.body?.blocked === undefined) {
    res.status(400).json({ error: 'Укажите blocked: true/false' })
    return
  }
  const b = req.body.blocked === true || req.body.blocked === 1 || req.body.blocked === '1'
  const reason = b ? String(req.body.blockedReason || '').trim() || null : null
  db.prepare(`UPDATE channels SET blocked = ?, blocked_reason = ? WHERE id = ?`).run(b ? 1 : 0, reason, cid)
  res.json({ channel: fetchChannel(cid) })
})

app.patch('/api/admin/content/posts/:postId', requireAuth, requireAdmin, (req, res) => {
  const postId = Number(req.params.postId)
  if (!Number.isFinite(postId)) {
    res.status(400).json({ error: 'Некорректный пост' })
    return
  }
  const existing = db.prepare(`SELECT id, image_path AS imagePath FROM posts WHERE id = ?`).get(postId)
  if (!existing) {
    res.status(404).json({ error: 'Пост не найден' })
    return
  }
  let did = false
  if (req.body?.content !== undefined) {
    const t = String(req.body.content ?? '').trim()
    if (t.length > MAX_POST_LEN) {
      res.status(400).json({ error: `Максимум ${MAX_POST_LEN} символов` })
      return
    }
    db.prepare(`UPDATE posts SET content = ? WHERE id = ?`).run(t, postId)
    did = true
  }
  if (req.body?.clearImage === true) {
    const paths = loadPostImagePaths(postId)
    if (existing.imagePath && !paths.includes(existing.imagePath)) paths.push(existing.imagePath)
    for (const pth of paths) safeUnlinkUpload(pth)
    db.prepare(`DELETE FROM post_images WHERE post_id = ?`).run(postId)
    db.prepare(`UPDATE posts SET image_path = NULL WHERE id = ?`).run(postId)
    did = true
  }
  if (!did) {
    res.status(400).json({ error: 'Укажите content и/или clearImage: true' })
    return
  }
  const row = fetchPostRowById(postId)
  const [post] = enrichPostsWithImages([mapPostRow(row)])
  res.json({ post })
})

app.delete('/api/admin/content/posts/:postId', requireAuth, requireAdmin, (req, res) => {
  const postId = Number(req.params.postId)
  if (!Number.isFinite(postId)) {
    res.status(400).json({ error: 'Некорректный пост' })
    return
  }
  const ok = deletePostAndAssets(postId)
  if (!ok) {
    res.status(404).json({ error: 'Пост не найден' })
    return
  }
  res.json({ ok: true })
})

app.patch('/api/admin/content/comments/:commentId', requireAuth, requireAdmin, (req, res) => {
  const commentId = Number(req.params.commentId)
  if (!Number.isFinite(commentId)) {
    res.status(400).json({ error: 'Некорректный комментарий' })
    return
  }
  const text = String(req.body?.content ?? '').trim()
  if (!text) {
    res.status(400).json({ error: 'Пустой текст' })
    return
  }
  if (text.length > MAX_COMMENT_LEN) {
    res.status(400).json({ error: `Максимум ${MAX_COMMENT_LEN} символов` })
    return
  }
  const info = db.prepare(`UPDATE post_comments SET content = ? WHERE id = ?`).run(text, commentId)
  if (info.changes === 0) {
    res.status(404).json({ error: 'Комментарий не найден' })
    return
  }
  const row = db.prepare(`${COMMENT_ROW_SQL} WHERE c.id = ?`).get(commentId)
  res.json({ comment: mapCommentRow(row) })
})

app.delete('/api/admin/content/comments/:commentId', requireAuth, requireAdmin, (req, res) => {
  const commentId = Number(req.params.commentId)
  if (!Number.isFinite(commentId)) {
    res.status(400).json({ error: 'Некорректный комментарий' })
    return
  }
  const info = db.prepare(`DELETE FROM post_comments WHERE id = ?`).run(commentId)
  if (info.changes === 0) {
    res.status(404).json({ error: 'Комментарий не найден' })
    return
  }
  res.json({ ok: true })
})

app.patch('/api/admin/content/chat-messages/:messageId', requireAuth, requireAdmin, (req, res) => {
  const messageId = Number(req.params.messageId)
  if (!Number.isFinite(messageId)) {
    res.status(400).json({ error: 'Некорректное сообщение' })
    return
  }
  const text = String(req.body?.content ?? '').trim()
  if (!text) {
    res.status(400).json({ error: 'Пустой текст' })
    return
  }
  if (text.length > MAX_CHAT_LEN) {
    res.status(400).json({ error: `Максимум ${MAX_CHAT_LEN} символов` })
    return
  }
  const meta = db.prepare(`SELECT channel_id AS channelId FROM chat_messages WHERE id = ?`).get(messageId)
  if (!meta?.channelId) {
    res.status(404).json({ error: 'Сообщение не найдено' })
    return
  }
  const info = db.prepare(`UPDATE chat_messages SET content = ? WHERE id = ?`).run(text, messageId)
  if (info.changes === 0) {
    res.status(404).json({ error: 'Сообщение не найдено' })
    return
  }
  const msg = fetchChatMessageById(messageId, meta.channelId)
  res.json({ message: msg })
})

app.delete('/api/admin/content/chat-messages/:messageId', requireAuth, requireAdmin, (req, res) => {
  const messageId = Number(req.params.messageId)
  if (!Number.isFinite(messageId)) {
    res.status(400).json({ error: 'Некорректное сообщение' })
    return
  }
  const info = db.prepare(`DELETE FROM chat_messages WHERE id = ?`).run(messageId)
  if (info.changes === 0) {
    res.status(404).json({ error: 'Сообщение не найдено' })
    return
  }
  res.json({ ok: true })
})

const server = http.createServer(app)
const io = new Server(server, {
  cors: getSocketCorsConfig(),
})

app.get(
  '/api/channels/:channelKey/live',
  requireAuth,
  requireNotBanned,
  loadChannelParam,
  requireChannelAccess,
  (req, res) => {
    const configured = isLivekitConfigured()
    const ch = fetchChannel(req.channelId)
    const liveActive = ch?.liveActive === true
    res.json({
      configured,
      liveActive,
      channelId: req.channelId,
      url: configured ? livekitWsUrl() : null,
      roomName: configured ? liveRoomName(req.channelId) : null,
      iAmOwner: isChannelRecordOwner(req.userId, req.channel),
    })
  }
)

app.post(
  '/api/channels/:channelKey/live/start',
  requireAuth,
  requireNotBanned,
  loadChannelParam,
  requireChannelLiveOwner,
  async (req, res) => {
    if (!isLivekitConfigured()) {
      res.status(503).json({
        error: 'Прямые эфиры не настроены. Задайте LIVEKIT_URL, LIVEKIT_API_KEY и LIVEKIT_API_SECRET.',
      })
      return
    }
    const roomName = liveRoomName(req.channelId)
    const u = db.prepare('SELECT display_name AS displayName FROM users WHERE id = ?').get(req.userId)
    try {
      const token = await mintPublisherToken({
        roomName,
        identity: `u${req.userId}`,
        name: u?.displayName || `user-${req.userId}`,
      })
      db.prepare(`UPDATE channels SET live_active = 1 WHERE id = ?`).run(req.channelId)
      io.to(`ch:${req.channelId}`).emit('channel:live', { channelId: req.channelId, live: true })
      res.json({ token, url: livekitWsUrl(), roomName })
    } catch (e) {
      console.error('[live] start', e)
      res.status(500).json({ error: 'Не удалось выдать токен эфира' })
    }
  }
)

app.post(
  '/api/channels/:channelKey/live/stop',
  requireAuth,
  requireNotBanned,
  loadChannelParam,
  requireChannelLiveOwner,
  (req, res) => {
    db.prepare(`UPDATE channels SET live_active = 0 WHERE id = ?`).run(req.channelId)
    io.to(`ch:${req.channelId}`).emit('channel:live', { channelId: req.channelId, live: false })
    res.json({ ok: true })
  }
)

app.post(
  '/api/channels/:channelKey/live/viewer-token',
  requireAuth,
  requireNotBanned,
  loadChannelParam,
  requireChannelAccess,
  async (req, res) => {
    if (!isLivekitConfigured()) {
      res.status(503).json({ error: 'Прямые эфиры не настроены на сервере.' })
      return
    }
    const ch = fetchChannel(req.channelId)
    if (!ch?.liveActive) {
      res.status(400).json({ error: 'Сейчас нет объявленного эфира в этом канале.' })
      return
    }
    const roomName = liveRoomName(req.channelId)
    const u = db.prepare('SELECT display_name AS displayName FROM users WHERE id = ?').get(req.userId)
    try {
      const token = await mintViewerToken({
        roomName,
        identity: `u${req.userId}`,
        name: u?.displayName || `user-${req.userId}`,
      })
      res.json({ token, url: livekitWsUrl(), roomName })
    } catch (e) {
      console.error('[live] viewer-token', e)
      res.status(500).json({ error: 'Не удалось выдать токен зрителя' })
    }
  }
)

app.post(
  '/api/channels/:channelKey/posts/:postId/comments',
  requireAuth,
  requireNotBanned,
  loadChannelParam,
  requireChannelAccess,
  (req, res) => {
    const postId = Number(req.params.postId)
    if (!Number.isFinite(postId)) {
      res.status(400).json({ error: 'Некорректный пост' })
      return
    }
    const post = db.prepare('SELECT id FROM posts WHERE id = ? AND channel_id = ?').get(postId, req.channelId)
    if (!post) {
      res.status(404).json({ error: 'Пост не найден' })
      return
    }
    const text = String(req.body?.content ?? '').trim()
    if (!text) {
      res.status(400).json({ error: 'Пустой комментарий' })
      return
    }
    if (text.length > MAX_COMMENT_LEN) {
      res.status(400).json({ error: `Максимум ${MAX_COMMENT_LEN} символов` })
      return
    }
    let replyToId = null
    const rawReply = req.body?.replyToId
    if (rawReply != null && rawReply !== '') {
      const rid = Number(rawReply)
      if (Number.isFinite(rid) && rid > 0) {
        const parent = db
          .prepare('SELECT id FROM post_comments WHERE id = ? AND post_id = ?')
          .get(rid, postId)
        if (parent) replyToId = rid
      }
    }
    const info = db
      .prepare(
        'INSERT INTO post_comments (post_id, user_id, content, reply_to_id) VALUES (?, ?, ?, ?)'
      )
      .run(postId, req.userId, text, replyToId)
    const row = db.prepare(`${COMMENT_ROW_SQL} WHERE c.id = ?`).get(info.lastInsertRowid)
    const comment = mapCommentRow(row)
    io.to(`ch:${req.channelId}`).emit('post:comment', {
      channelId: req.channelId,
      postId,
      comment,
    })
    res.status(201).json({ comment })
  }
)

io.use((socket, next) => {
  const token = socket.handshake.auth?.token
  const uid = verifyToken(typeof token === 'string' ? token : '')
  if (!uid) {
    next(new Error('unauthorized'))
    return
  }
  const row = fetchAuthUser(uid)
  if (!row) {
    next(new Error('unauthorized'))
    return
  }
  if (banInfo(row).active) {
    next(new Error('banned'))
    return
  }
  socket.data.userId = uid
  next()
})

io.on('connection', (socket) => {
  const dmUid = socket.data.userId
  if (dmUid) socket.join(`u:${dmUid}`)

  socket.on('channel:join', (channelId, cb) => {
    const cid = Number(channelId)
    if (!Number.isFinite(cid) || cid <= 0) {
      if (typeof cb === 'function') cb({ ok: false, error: 'Некорректный канал' })
      return
    }
    const uid = socket.data.userId
    if (!hasChannelAccess(uid, cid)) {
      if (typeof cb === 'function') cb({ ok: false, error: 'Нет доступа к каналу' })
      return
    }
    for (const room of socket.rooms) {
      if (room.startsWith('ch:')) socket.leave(room)
    }
    socket.join(`ch:${cid}`)
    if (typeof cb === 'function') cb({ ok: true })
  })

  socket.on('chat:send', (payload, cb) => {
    const text = String(payload?.text ?? '').trim()
    const channelId = Number(payload?.channelId)
    if (!text) {
      if (typeof cb === 'function') cb({ ok: false, error: 'Пустое сообщение' })
      return
    }
    if (!Number.isFinite(channelId) || channelId <= 0) {
      if (typeof cb === 'function') cb({ ok: false, error: 'Укажите канал' })
      return
    }
    if (text.length > MAX_CHAT_LEN) {
      if (typeof cb === 'function') cb({ ok: false, error: 'Слишком длинное сообщение' })
      return
    }
    const uid = socket.data.userId
    if (!hasChannelAccess(uid, channelId)) {
      if (typeof cb === 'function') cb({ ok: false, error: 'Нет доступа к каналу' })
      return
    }
    let replyToId = null
    const rawReply = payload?.replyToId
    if (rawReply != null && rawReply !== '') {
      const rid = Number(rawReply)
      if (Number.isFinite(rid) && rid > 0) {
        const parent = db.prepare('SELECT channel_id FROM chat_messages WHERE id = ?').get(rid)
        if (parent && parent.channel_id === channelId) replyToId = rid
      }
    }
    const info = db
      .prepare('INSERT INTO chat_messages (user_id, content, reply_to_id, channel_id) VALUES (?, ?, ?, ?)')
      .run(uid, text, replyToId, channelId)
    const msg = fetchChatMessageById(info.lastInsertRowid, channelId)
    if (!msg) {
      if (typeof cb === 'function') cb({ ok: false, error: 'Не удалось сохранить сообщение' })
      return
    }
    io.to(`ch:${channelId}`).emit('chat:message', { channelId, message: msg })
    if (typeof cb === 'function') cb({ ok: true, message: msg })
  })
})

const distPath = process.env.DIST_PATH ? path.resolve(process.env.DIST_PATH) : path.join(__dirname, '..', 'dist')
const distIndex = path.join(distPath, 'index.html')
const serveSpa = IS_PRODUCTION && process.env.SERVE_SPA !== '0' && fs.existsSync(distIndex)

if (IS_PRODUCTION && process.env.SERVE_SPA !== '0' && !fs.existsSync(distIndex)) {
  console.warn(`[vibe] SPA: нет ${distIndex} — выполните «npm run build» или отключите ожидание (SERVE_SPA=0)`)
}
if (serveSpa) {
  console.log(`[vibe] SPA: статика и маршруты Vue из ${distPath}`)
  app.use(
    express.static(distPath, {
      index: false,
      maxAge: '1y',
      immutable: true,
      setHeaders(res, filePath) {
        if (path.basename(filePath) === 'index.html') {
          res.setHeader('Cache-Control', 'no-store')
        }
      },
    })
  )
  // Express 5 / path-to-regexp: маршрут '*' недопустим — SPA через middleware после static
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next()
      return
    }
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io') || req.path.startsWith('/uploads')) {
      next()
      return
    }
    res.sendFile(distIndex, (err) => (err ? next(err) : undefined))
  })
}

app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    res.status(404).json({ error: 'Не найдено' })
    return
  }
  res.status(404).type('txt').send('Not found')
})

function logListenUrls() {
  const tail = serveSpa ? ', SPA (Vue)' : ''
  console.log(`Сервер: http://localhost:${PORT} — API, /uploads, WebSocket${tail}`)
  if (isLivekitConfigured()) {
    console.log('[vibe] Прямые эфиры: LiveKit (LIVEKIT_*) настроен')
  } else {
    console.log('[vibe] Прямые эфиры: задайте LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET — см. .env.example')
  }
  if (HOST === '0.0.0.0') {
    const nets = os.networkInterfaces()
    for (const name of Object.keys(nets)) {
      for (const n of nets[name] || []) {
        if (n.family === 'IPv4' && !n.internal) {
          console.log(`В сети (другие устройства): http://${n.address}:${PORT}`)
        }
      }
    }
  }
}

server.listen(PORT, HOST, logListenUrls)
