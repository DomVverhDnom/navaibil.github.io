import { apiBase } from './api.js'

export function mediaUrl(relativePath) {
  if (!relativePath) return ''
  if (/^https?:\/\//i.test(relativePath)) return relativePath
  const base = apiBase()
  return `${base}${relativePath.startsWith('/') ? relativePath : `/${relativePath}`}`
}
