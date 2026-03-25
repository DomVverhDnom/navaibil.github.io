/**
 * Проверки и настройки безопасности для API и Socket.IO.
 * Переменные окружения — см. .env.example
 */

export const IS_PRODUCTION = process.env.NODE_ENV === 'production'

const DEFAULT_JWT_PLACEHOLDER = 'dev-change-me-in-production'

export function assertJwtSecret() {
  const secret = process.env.JWT_SECRET || ''
  if (!secret || secret.length < 32) {
    if (IS_PRODUCTION) {
      console.error(
        '[vibe] В production задайте JWT_SECRET длиной не менее 32 символов (например: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))")'
      )
      process.exit(1)
    }
    console.warn(
      '[vibe] JWT_SECRET короткий или не задан — сгенерируйте длинную случайную строку (≥32 символов) перед продакшеном'
    )
  }
  if (secret === DEFAULT_JWT_PLACEHOLDER) {
    if (IS_PRODUCTION) {
      console.error('[vibe] Нельзя использовать дефолтный JWT_SECRET в production')
      process.exit(1)
    }
    console.warn('[vibe] Используется небезопасный JWT_SECRET по умолчанию — замените в .env')
  }
}

export function parseCorsOrigins() {
  const raw = process.env.CORS_ORIGINS
  if (!raw || !String(raw).trim()) return []
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function assertProductionCors() {
  if (!IS_PRODUCTION) return
  if (parseCorsOrigins().length === 0) {
    console.error(
      '[vibe] В production задайте CORS_ORIGINS — список разрешённых origin через запятую (например https://mysite.ru,https://www.mysite.ru)'
    )
    process.exit(1)
  }
}

/** В dev: localhost и частные IPv4 (телефон в той же Wi‑Fi с Vite). */
function devBrowserOriginOk(origin) {
  if (!origin) return true
  try {
    const u = new URL(origin)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
    const h = u.hostname
    if (h === 'localhost' || h === '127.0.0.1' || h === '::1') return true
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return true
    if (/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(h)) return true
    return false
  } catch {
    return false
  }
}

/** Опции для пакета `cors` (Express). */
export function buildCorsOptions() {
  const explicit = parseCorsOrigins()
  return {
    origin(origin, cb) {
      if (!origin) return cb(null, true)
      if (explicit.length > 0) {
        return cb(null, explicit.includes(origin))
      }
      if (IS_PRODUCTION) return cb(null, false)
      return cb(null, devBrowserOriginOk(origin))
    },
    credentials: true,
  }
}

/** Настройка `cors` для Socket.IO (тот же набор origin). */
export function getSocketCorsConfig() {
  const explicit = parseCorsOrigins()
  if (explicit.length > 0) {
    return { origin: explicit, credentials: true }
  }
  if (IS_PRODUCTION) {
    return { origin: false, credentials: true }
  }
  return {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true)
      cb(null, devBrowserOriginOk(origin))
    },
    credentials: true,
  }
}

/**
 * «Бесплатная» активация подписки через API.
 * В production по умолчанию выключена; для тестов: ALLOW_MOCK_SUBSCRIPTION=true
 */
export function isMockSubscriptionAllowed() {
  if (!IS_PRODUCTION) return true
  const v = process.env.ALLOW_MOCK_SUBSCRIPTION
  return v === '1' || v === 'true'
}

export const AUTH_MIN_PASSWORD_LENGTH = Math.max(
  8,
  Math.min(32, Number(process.env.AUTH_MIN_PASSWORD_LENGTH) || 8)
)

export const AUTH_MAX_PASSWORD_LENGTH = 128
