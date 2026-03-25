import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url))

/**
 * Читает ADMIN_EMAILS из .env на диске, если в process.env пусто
 * (dotenv иногда не подхватывает файл при другом cwd / порядке запуска).
 */
function readAdminEmailsFromDotEnvFiles() {
  const candidates = [
    path.join(SERVER_DIR, '..', '.env'),
    path.join(process.cwd(), '.env'),
  ]
  for (const filePath of candidates) {
    try {
      if (!fs.existsSync(filePath)) continue
      const text = fs.readFileSync(filePath, 'utf8')
      for (const line of text.split(/\r?\n/)) {
        const m = line.match(/^\s*ADMIN_EMAILS\s*=\s*(.*)$/)
        if (!m) continue
        let v = m[1].trim()
        const hash = v.indexOf('#')
        if (hash >= 0) v = v.slice(0, hash).trim()
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1).trim()
        }
        return v
      }
    } catch {
      /* ignore */
    }
  }
  return ''
}

/** Список email из ADMIN_EMAILS (BOM, CRLF, пробелы, кавычки, комментарий в строке). */
export function listAdminEmailsFromEnv() {
  let raw = (process.env.ADMIN_EMAILS || '').replace(/^\uFEFF/, '').trim()
  if (!raw) {
    raw = readAdminEmailsFromDotEnvFiles()
  }
  raw = raw.replace(/^\uFEFF/, '').trim()
  return raw
    .split(/[,;]+/)
    .map((e) => e.replace(/\r/g, '').trim().toLowerCase())
    .filter(Boolean)
}

export function normEmail(s) {
  return String(s || '')
    .replace(/\r/g, '')
    .trim()
    .toLowerCase()
}
