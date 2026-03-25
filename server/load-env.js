import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const serverDir = path.dirname(fileURLToPath(import.meta.url))
const candidates = [
  path.join(serverDir, '..', '.env'),
  path.join(process.cwd(), '.env'),
]

for (const p of candidates) {
  try {
    if (fs.existsSync(p)) {
      dotenv.config({ path: p, override: true })
      break
    }
  } catch {
    /* ignore */
  }
}

if (!process.env.JWT_SECRET && !process.env.ADMIN_EMAILS) {
  dotenv.config()
}
