import { db } from './db.js'

const MAX_TIERS = 8
const MAX_TIER_NAME = 64

export function listTiersForChannel(channelId) {
  return db
    .prepare(
      `SELECT id, sort_order AS sortOrder, name, price_month AS priceMonth, price_year AS priceYear
       FROM channel_subscription_tiers WHERE channel_id = ? ORDER BY sort_order ASC, id ASC`
    )
    .all(channelId)
}

/** Активная подписка: sort_order уровня или null */
export function getActiveSubscriptionTierSort(userId, channelId) {
  const row = db
    .prepare(
      `SELECT t.sort_order AS sortOrder
       FROM channel_subscriptions cs
       JOIN channel_subscription_tiers t ON t.id = cs.tier_id
       WHERE cs.channel_id = ? AND cs.user_id = ? AND cs.status = 'active'
         AND datetime(cs.current_period_end) > datetime('now')`
    )
    .get(channelId, userId)
  return row?.sortOrder != null ? Number(row.sortOrder) : null
}

export function getDefaultTierIdForChannel(channelId) {
  const row = db
    .prepare(
      `SELECT id FROM channel_subscription_tiers WHERE channel_id = ? ORDER BY sort_order ASC, id ASC LIMIT 1`
    )
    .get(channelId)
  return row?.id ?? null
}

export function tierIdBelongsToChannel(tierId, channelId) {
  const row = db
    .prepare(`SELECT 1 AS x FROM channel_subscription_tiers WHERE id = ? AND channel_id = ?`)
    .get(tierId, channelId)
  return !!row
}

export function minTierSortExistsForChannel(channelId, sortOrder) {
  if (sortOrder == null) return true
  const n = Number(sortOrder)
  if (!Number.isFinite(n)) return false
  const row = db
    .prepare(
      `SELECT 1 AS x FROM channel_subscription_tiers WHERE channel_id = ? AND sort_order = ? LIMIT 1`
    )
    .get(channelId, n)
  return !!row
}

/**
 * Сохранить уровни подписки (полная замена списка с upsert по id).
 * @param {number} channelId
 * @param {Array<{ id?: number, sortOrder: number, name: string, priceMonth: number, priceYear: number }>} tiers
 */
export function saveChannelTiers(channelId, tiers) {
  if (!Array.isArray(tiers) || tiers.length === 0) {
    throw new Error('Нужен хотя бы один уровень подписки')
  }
  if (tiers.length > MAX_TIERS) {
    throw new Error(`Не больше ${MAX_TIERS} уровней`)
  }

  const normalized = []
  const sortSet = new Set()
  for (const raw of tiers) {
    const sortOrder = Math.round(Number(raw.sortOrder))
    const name = String(raw.name || '').trim().slice(0, MAX_TIER_NAME)
    const priceMonth = Math.max(0, Math.min(999_999, Math.round(Number(raw.priceMonth) || 0)))
    const priceYear = Math.max(0, Math.min(9_999_999, Math.round(Number(raw.priceYear) || 0)))
    if (!Number.isFinite(sortOrder) || sortOrder < 1 || sortOrder > 99) {
      throw new Error('Порядок уровня: число от 1 до 99')
    }
    if (sortSet.has(sortOrder)) throw new Error('Порядок уровней не должен повторяться')
    sortSet.add(sortOrder)
    if (!name) throw new Error('Укажите название каждого уровня')
    const rawId =
      raw.id != null && raw.id !== '' && String(raw.id).trim() !== '' ? Number(raw.id) : null
    normalized.push({
      id: rawId != null && Number.isFinite(rawId) && rawId > 0 ? rawId : null,
      sortOrder,
      name,
      priceMonth,
      priceYear,
    })
  }

  normalized.sort((a, b) => a.sortOrder - b.sortOrder)

  const existing = listTiersForChannel(channelId)
  const existingById = new Map(existing.map((t) => [t.id, t]))
  const payloadIds = new Set(normalized.map((t) => t.id).filter((id) => id != null && id > 0))

  for (const ex of existing) {
    if (!payloadIds.has(ex.id)) {
      const { c } = db.prepare(`SELECT COUNT(*) AS c FROM channel_subscriptions WHERE tier_id = ?`).get(ex.id)
      if (c > 0) {
        throw new Error('Нельзя удалить уровень, на которого оформлены подписки')
      }
      db.prepare(`DELETE FROM channel_subscription_tiers WHERE id = ? AND channel_id = ?`).run(ex.id, channelId)
    }
  }

  const upd = db.prepare(
    `UPDATE channel_subscription_tiers SET sort_order = ?, name = ?, price_month = ?, price_year = ?
     WHERE id = ? AND channel_id = ?`
  )
  const ins = db.prepare(
    `INSERT INTO channel_subscription_tiers (channel_id, sort_order, name, price_month, price_year)
     VALUES (?, ?, ?, ?, ?)`
  )

  for (const t of normalized) {
    if (t.id && existingById.has(t.id)) {
      upd.run(t.sortOrder, t.name, t.priceMonth, t.priceYear, t.id, channelId)
    } else {
      ins.run(channelId, t.sortOrder, t.name, t.priceMonth, t.priceYear)
    }
  }

  const first = listTiersForChannel(channelId)[0]
  if (first) {
    db.prepare(`UPDATE channels SET price_month = ?, price_year = ? WHERE id = ?`).run(
      first.priceMonth,
      first.priceYear,
      channelId
    )
  }

  return listTiersForChannel(channelId)
}

export function memberCanViewPostMinTier(userId, channelId, postMinTierSort, isStaff) {
  if (isStaff) return true
  if (postMinTierSort == null || postMinTierSort === '') return true
  const need = Number(postMinTierSort)
  if (!Number.isFinite(need)) return true
  const s = getActiveSubscriptionTierSort(userId, channelId)
  if (s == null) return false
  return s >= need
}

export function migrateSubscriptionTiersFromLegacy() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS channel_subscription_tiers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL,
      name TEXT NOT NULL,
      price_month INTEGER NOT NULL DEFAULT 0,
      price_year INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (channel_id, sort_order)
    );
    CREATE INDEX IF NOT EXISTS idx_cst_channel ON channel_subscription_tiers(channel_id);
  `)

  const cols = db.prepare(`PRAGMA table_info(channel_subscriptions)`).all()
  if (!cols.some((c) => c.name === 'tier_id')) {
    db.exec(`ALTER TABLE channel_subscriptions ADD COLUMN tier_id INTEGER REFERENCES channel_subscription_tiers(id)`)
  }

  const postCols = db.prepare(`PRAGMA table_info(posts)`).all()
  if (!postCols.some((c) => c.name === 'min_tier_sort')) {
    db.exec(`ALTER TABLE posts ADD COLUMN min_tier_sort INTEGER`)
  }

  const channels = db.prepare(`SELECT id, price_month, price_year FROM channels`).all()
  for (const ch of channels) {
    const n = db
      .prepare(`SELECT COUNT(*) AS c FROM channel_subscription_tiers WHERE channel_id = ?`)
      .get(ch.id).c
    if (n > 0) continue
    db.prepare(
      `INSERT INTO channel_subscription_tiers (channel_id, sort_order, name, price_month, price_year)
       VALUES (?, 1, 'Участник', ?, ?)`
    ).run(ch.id, ch.price_month ?? 0, ch.price_year ?? 0)
  }

  const orphanSubs = db
    .prepare(`SELECT channel_id, user_id FROM channel_subscriptions WHERE tier_id IS NULL`)
    .all()
  for (const s of orphanSubs) {
    const tid = getDefaultTierIdForChannel(s.channel_id)
    if (tid) {
      db.prepare(`UPDATE channel_subscriptions SET tier_id = ? WHERE channel_id = ? AND user_id = ?`).run(
        tid,
        s.channel_id,
        s.user_id
      )
    }
  }
}
