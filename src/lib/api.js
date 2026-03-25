/**
 * База URL API.
 * - Production / одна сборка с API: пустая строка (тот же origin).
 * - Dev без VITE_API_URL: относительные пути — тот же хост, что у Vite (удобно с телефона/ноутбука в LAN);
 *   прокси в vite.config: /api, /uploads, /socket.io → localhost:3000.
 * - VITE_API_URL: явный бэкенд (другой домен или нестандартный порт без прокси).
 */
export function apiBase() {
  const fromEnv = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
  if (fromEnv) return fromEnv
  if (import.meta.env.DEV) {
    return ''
  }
  return ''
}

/** Полный URL старта OAuth (редирект в браузере). */
export function oauthStartUrl(provider) {
  const path = `/api/auth/oauth/${provider}/start`
  const base = apiBase()
  if (typeof window === 'undefined') return path
  if (base) return `${base}${path}`
  return `${window.location.origin}${path}`
}

export async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) }
  const t = typeof localStorage !== 'undefined' ? localStorage.getItem('vibe_token') : null
  if (t) headers.Authorization = `Bearer ${t}`

  let body = options.body
  if (body !== undefined && body !== null && typeof body === 'object' && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(body)
  }

  const url = `${apiBase()}${path.startsWith('/') ? path : `/${path}`}`
  const method = (options.method || 'GET').toUpperCase()
  const cache = options.cache ?? (method === 'GET' ? 'no-store' : 'default')
  return fetch(url, { ...options, headers, body, cache })
}

export function apiForm(path, formData, method = 'POST') {
  const headers = {}
  const t = typeof localStorage !== 'undefined' ? localStorage.getItem('vibe_token') : null
  if (t) headers.Authorization = `Bearer ${t}`
  const url = `${apiBase()}${path.startsWith('/') ? path : `/${path}`}`
  return fetch(url, { method, headers, body: formData })
}

export async function parseJson(res) {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
