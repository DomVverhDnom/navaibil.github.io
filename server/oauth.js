import crypto from 'crypto'
import express from 'express'
import { db } from './db.js'

const STATE_TTL_MS = 10 * 60 * 1000
const CODE_TTL_MS = 5 * 60 * 1000
const oauthStates = new Map()
const oauthCodes = new Map()

function cleanupMaps() {
  const now = Date.now()
  for (const [k, exp] of oauthStates) {
    if (exp < now) oauthStates.delete(k)
  }
  for (const [k, v] of oauthCodes) {
    if (v.exp < now) oauthCodes.delete(k)
  }
}
setInterval(cleanupMaps, 60_000)

export function oauthProvidersConfigured() {
  return {
    google: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    vk: !!(process.env.VK_CLIENT_ID && process.env.VK_CLIENT_SECRET),
    yandex: !!(process.env.YANDEX_CLIENT_ID && process.env.YANDEX_CLIENT_SECRET),
  }
}

function apiPublicOrigin() {
  const ex = (process.env.OAUTH_SERVER_PUBLIC_URL || process.env.API_PUBLIC_URL || '').replace(/\/$/, '')
  if (ex) return ex
  const port = Number(process.env.PORT || 3000)
  return `http://127.0.0.1:${port}`
}

function appPublicUrl() {
  return String(process.env.APP_PUBLIC_URL || 'http://127.0.0.1:5173').replace(/\/$/, '')
}

function redirectUri(provider) {
  return `${apiPublicOrigin()}/api/auth/oauth/${provider}/callback`
}

async function postForm(url, bodyObj) {
  const body = new URLSearchParams(bodyObj)
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    /* ignore */
  }
  return { ok: res.ok, status: res.status, json, text }
}

async function fetchGoogleProfile(code, redir) {
  const cid = process.env.GOOGLE_CLIENT_ID
  const sec = process.env.GOOGLE_CLIENT_SECRET
  const { ok, json } = await postForm('https://oauth2.googleapis.com/token', {
    code,
    client_id: cid,
    client_secret: sec,
    redirect_uri: redir,
    grant_type: 'authorization_code',
  })
  if (!ok || !json?.access_token) throw new Error('google_token')
  const ures = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${json.access_token}` },
  })
  const u = await ures.json()
  if (!u?.sub) throw new Error('google_profile')
  return {
    subject: String(u.sub),
    email: u.email ? String(u.email).toLowerCase() : null,
    displayName: String(u.name || u.email || 'Google').slice(0, 80),
  }
}

async function fetchVkProfile(code, redir) {
  const cid = process.env.VK_CLIENT_ID
  const sec = process.env.VK_CLIENT_SECRET
  const url =
    `https://oauth.vk.com/access_token?client_id=${encodeURIComponent(cid)}` +
    `&client_secret=${encodeURIComponent(sec)}` +
    `&redirect_uri=${encodeURIComponent(redir)}` +
    `&code=${encodeURIComponent(code)}`
  const res = await fetch(url)
  const json = await res.json()
  if (json.error || !json.user_id) {
    throw new Error(json.error_description || json.error || 'vk_token')
  }
  const email = json.email ? String(json.email).toLowerCase() : null
  const uid = String(json.user_id)
  let displayName = `VK ${uid}`
  if (json.access_token) {
    try {
      const inf = await fetch(
        `https://api.vk.com/method/users.get?user_ids=${encodeURIComponent(uid)}&fields=photo_200&access_token=${encodeURIComponent(json.access_token)}&v=5.131`
      )
      const data = await inf.json()
      const u = data?.response?.[0]
      if (u) {
        const fn = [u.first_name, u.last_name].filter(Boolean).join(' ').trim()
        if (fn) displayName = fn.slice(0, 80)
      }
    } catch {
      /* ignore */
    }
  }
  return { subject: uid, email, displayName }
}

async function fetchYandexProfile(code, redir) {
  const cid = process.env.YANDEX_CLIENT_ID
  const sec = process.env.YANDEX_CLIENT_SECRET
  const { ok, json } = await postForm('https://oauth.yandex.ru/token', {
    grant_type: 'authorization_code',
    code,
    client_id: cid,
    client_secret: sec,
    redirect_uri: redir,
  })
  if (!ok || !json?.access_token) throw new Error('yandex_token')
  const ures = await fetch('https://login.yandex.ru/info?format=json', {
    headers: { Authorization: `OAuth ${json.access_token}` },
  })
  const u = await ures.json()
  if (!u?.id) throw new Error('yandex_profile')
  const email = u.default_email ? String(u.default_email).toLowerCase() : null
  const displayName = String(u.display_name || u.login || email || 'Яндекс').slice(0, 80)
  return { subject: String(u.id), email, displayName }
}

async function fetchProfile(provider, code) {
  const redir = redirectUri(provider)
  if (provider === 'google') return fetchGoogleProfile(code, redir)
  if (provider === 'vk') return fetchVkProfile(code, redir)
  if (provider === 'yandex') return fetchYandexProfile(code, redir)
  throw new Error('unknown_provider')
}

function findOrCreateUser(provider, profile) {
  const linked = db
    .prepare(`SELECT user_id AS userId FROM user_oauth WHERE provider = ? AND subject = ?`)
    .get(provider, profile.subject)
  if (linked) return linked.userId

  let email = profile.email
  if (!email) email = `${provider}_${profile.subject}@oauth.local`

  const dup = db.prepare(`SELECT id FROM users WHERE email = ? COLLATE NOCASE`).get(email)
  if (dup) {
    const err = new Error('email_busy')
    err.code = 'EMAIL_BUSY'
    throw err
  }

  const info = db
    .prepare(`INSERT INTO users (email, password_hash, display_name) VALUES (?, '', ?)`)
    .run(email, profile.displayName || 'Участник')
  const userId = info.lastInsertRowid
  db.prepare(`INSERT INTO user_oauth (user_id, provider, subject) VALUES (?, ?, ?)`).run(
    userId,
    provider,
    profile.subject
  )
  return userId
}

/**
 * @param {import('express').Express} app
 * @param {{ postLoginUser: (userId: number) => { token?: string, user?: object, error?: string, message?: string }, authLimiter: import('express-rate-limit').RateLimitRequestHandler }} deps
 */
export function registerOAuthRoutes(app, { postLoginUser, authLimiter }) {
  const router = express.Router()

  router.get('/providers', (_req, res) => {
    res.json(oauthProvidersConfigured())
  })

  router.get('/:provider/start', (req, res) => {
    const provider = String(req.params.provider || '')
    const cfg = oauthProvidersConfigured()
    if (!['google', 'vk', 'yandex'].includes(provider) || !cfg[provider]) {
      res.status(503).json({ error: 'Вход через этот сервис не настроен' })
      return
    }
    const state = crypto.randomBytes(24).toString('hex')
    oauthStates.set(state, Date.now() + STATE_TTL_MS)
    const redir = redirectUri(provider)

    if (provider === 'google') {
      const q = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        redirect_uri: redir,
        response_type: 'code',
        scope: 'openid email profile',
        state,
        access_type: 'online',
        include_granted_scopes: 'true',
      })
      res.redirect(302, `https://accounts.google.com/o/oauth2/v2/auth?${q}`)
      return
    }

    if (provider === 'vk') {
      const q = new URLSearchParams({
        client_id: process.env.VK_CLIENT_ID,
        redirect_uri: redir,
        display: 'page',
        scope: 'email',
        response_type: 'code',
        state,
        v: '5.131',
      })
      res.redirect(302, `https://oauth.vk.com/authorize?${q}`)
      return
    }

    const q = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.YANDEX_CLIENT_ID,
      redirect_uri: redir,
      state,
    })
    res.redirect(302, `https://oauth.yandex.ru/authorize?${q}`)
  })

  router.get('/:provider/callback', async (req, res) => {
    const provider = String(req.params.provider || '')
    if (!['google', 'vk', 'yandex'].includes(provider)) {
      res.redirect(302, `${appPublicUrl()}/login?oauth_error=invalid`)
      return
    }
    const front = appPublicUrl()
    if (req.query.error) {
      res.redirect(302, `${front}/login?oauth_error=denied`)
      return
    }
    const code = String(req.query.code || '')
    const state = String(req.query.state || '')
    const until = oauthStates.get(state)
    if (!code || !state || until == null || until < Date.now()) {
      if (state) oauthStates.delete(state)
      res.redirect(302, `${front}/login?oauth_error=state`)
      return
    }
    oauthStates.delete(state)
    try {
      const profile = await fetchProfile(provider, code)
      const userId = findOrCreateUser(provider, profile)
      const completeCode = crypto.randomBytes(24).toString('hex')
      oauthCodes.set(completeCode, { userId, exp: Date.now() + CODE_TTL_MS })
      res.redirect(302, `${front}/login?oauth_code=${encodeURIComponent(completeCode)}`)
    } catch (e) {
      const codeErr = e.code === 'EMAIL_BUSY' ? 'email_busy' : 'fail'
      res.redirect(302, `${front}/login?oauth_error=${encodeURIComponent(codeErr)}`)
    }
  })

  router.post('/complete', authLimiter, (req, res) => {
    const code = String(req.body?.oauth_code || '').trim()
    const row = oauthCodes.get(code)
    if (!row || row.exp < Date.now()) {
      res.status(400).json({ error: 'Код устарел. Войдите через соцсеть снова.' })
      return
    }
    oauthCodes.delete(code)
    const out = postLoginUser(row.userId)
    if (out.error === 'banned') {
      res.status(403).json({ error: out.message || 'Аккаунт заблокирован' })
      return
    }
    if (out.error || !out.token) {
      res.status(400).json({ error: 'Не удалось завершить вход' })
      return
    }
    res.json({ token: out.token, user: out.user })
  })

  app.use('/api/auth/oauth', router)
}
