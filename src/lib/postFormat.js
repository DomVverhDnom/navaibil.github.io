/** Безопасное форматирование текста поста (подмножество разметки). */

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function attrEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

function sanitizeUrl(href) {
  const t = String(href || '').trim()
  if (!/^https?:\/\//i.test(t)) return ''
  try {
    const u = new URL(t)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return ''
    return u.href
  } catch {
    return ''
  }
}

const MARK_START = '\uE020'
const MARK_END = '\uE021'
const HR_TOKEN = `${MARK_START}hr${MARK_END}`

/**
 * @param {string} raw
 * @returns {string}
 */
export function formatPostHtml(raw) {
  let t = String(raw ?? '')
  t = t.replace(/^---\s*$/gm, HR_TOKEN)
  let s = escapeHtml(t)
  s = s.split(HR_TOKEN).join('<hr class="post-hr" />')

  const codes = []
  s = s.replace(/`([^`\n]+)`/g, (_, inner) => {
    const i = codes.length
    codes.push(`<code class="post-code">${inner}</code>`)
    return `${MARK_START}c${i}${MARK_END}`
  })

  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (full, label, href) => {
    const u = sanitizeUrl(href)
    if (!u) return full
    return `<a class="post-link" href="${attrEscape(u)}" target="_blank" rel="noopener noreferrer">${label}</a>`
  })

  s = s.replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/~~([\s\S]+?)~~/g, '<del>$1</del>')
  s = s.replace(/\*([^*\n]+?)\*/g, '<em>$1</em>')

  s = s.replace(/\n/g, '<br />')

  s = s.replace(new RegExp(`${MARK_START}c(\\d+)${MARK_END}`, 'g'), (_, i) => codes[Number(i)] ?? '')

  return s
}
