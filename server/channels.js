import { db } from './db.js'

/** Нормализация ссылок для шапки канала (макс. 12 шт.). */
export function normalizeSocialLinksInput(input) {
  if (!input) return []
  const arr = Array.isArray(input) ? input : []
  const out = []
  for (const item of arr.slice(0, 12)) {
    const label = String(item?.label || '').trim().slice(0, 48)
    let url = String(item?.url || '').trim()
    if (!url) continue
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`
    try {
      const u = new URL(url)
      if (u.protocol !== 'http:' && u.protocol !== 'https:') continue
      out.push({ label: label || u.hostname.replace(/^www\./, ''), url: u.href })
    } catch {
      /* skip */
    }
  }
  return out
}

function socialLinksFromDb(raw) {
  if (raw == null || raw === '') return []
  try {
    const a = JSON.parse(String(raw))
    return Array.isArray(a) ? normalizeSocialLinksInput(a) : []
  } catch {
    return []
  }
}

export function hydrateChannelRow(row) {
  if (!row) return null
  const socialLinks = socialLinksFromDb(row.socialLinksJson ?? row.social_links)
  const {
    socialLinksJson,
    social_links,
    blocked: blockedRaw,
    blockedReason: br1,
    blocked_reason: br2,
    live_active,
    ...rest
  } = row
  const blocked = Number(blockedRaw) === 1
  const blockedReason = br1 ?? br2 ?? null
  const liveActive =
    Number(rest.liveActive ?? live_active ?? 0) === 1 || rest.liveActive === true
  const { liveActive: _la, ...restNoLive } = rest
  return { ...restNoLive, socialLinks, blocked, blockedReason, liveActive }
}

export function normalizeChannelRole(role) {
  const r = String(role || 'member').toLowerCase()
  if (r === 'owner' || r === 'admin' || r === 'moderator' || r === 'member') return r
  return 'member'
}

/** Глобальная роль на сайте (users.role), не путать с админом канала. */
function siteAccountRole(role) {
  const r = String(role || 'user').toLowerCase()
  if (r === 'admin' || r === 'moderator' || r === 'user') return r
  return 'user'
}

/** Администратор всего сайта — полный доступ ко всем каналам и настройкам. */
export function isSiteAdminUser(userId) {
  if (!userId) return false
  const row = db.prepare(`SELECT role FROM users WHERE id = ?`).get(userId)
  return siteAccountRole(row?.role) === 'admin'
}

export function getMembership(userId, channelId) {
  return db
    .prepare(
      `SELECT channel_id AS channelId, user_id AS userId, role
       FROM channel_members WHERE channel_id = ? AND user_id = ?`
    )
    .get(channelId, userId)
}

export function isChannelSubscriptionActive(userId, channelId) {
  const row = db
    .prepare(
      `SELECT current_period_end AS end FROM channel_subscriptions
       WHERE channel_id = ? AND user_id = ? AND status = 'active'`
    )
    .get(channelId, userId)
  if (!row) return false
  return new Date(row.end) > new Date()
}

export function hasChannelAccess(userId, channelId) {
  if (isSiteAdminUser(userId)) return true
  const bl = db.prepare(`SELECT COALESCE(blocked, 0) AS b FROM channels WHERE id = ?`).get(channelId)
  if (bl?.b === 1) return false
  const m = getMembership(userId, channelId)
  if (!m) return false
  const r = normalizeChannelRole(m.role)
  if (r === 'owner' || r === 'admin' || r === 'moderator') return true
  return isChannelSubscriptionActive(userId, channelId)
}

export function isChannelStaff(userId, channelId) {
  if (isSiteAdminUser(userId)) return true
  const m = getMembership(userId, channelId)
  if (!m) return false
  const r = normalizeChannelRole(m.role)
  return r === 'owner' || r === 'admin' || r === 'moderator'
}

export function isChannelOwner(userId, channelId) {
  const m = getMembership(userId, channelId)
  return m && normalizeChannelRole(m.role) === 'owner'
}

/** Владелец канала по записи channels.owner_id (для эфира и критичных действий). */
export function isChannelRecordOwner(userId, channel) {
  if (!userId || !channel) return false
  return Number(channel.ownerId) === Number(userId)
}

export function getChannelMemberRole(userId, channelId) {
  const m = getMembership(userId, channelId)
  return m ? normalizeChannelRole(m.role) : null
}

/** Владелец или админ канала — могут менять роли участников (с ограничениями в роуте). */
export function canManageMemberRoles(actorUserId, channelId) {
  if (isSiteAdminUser(actorUserId)) return true
  const r = getChannelMemberRole(actorUserId, channelId)
  return r === 'owner' || r === 'admin'
}

export function fetchChannel(channelId) {
  const row = db
    .prepare(
      `SELECT c.id, c.slug, c.name, c.description, c.owner_id AS ownerId, c.created_at AS createdAt,
              COALESCE(c.price_month, 0) AS priceMonth, COALESCE(c.price_year, 0) AS priceYear,
              c.banner_path AS bannerPath, c.social_links AS socialLinksJson,
              COALESCE(c.blocked, 0) AS blocked, c.blocked_reason AS blockedReason,
              COALESCE(c.live_active, 0) AS liveActive
       FROM channels c WHERE c.id = ?`
    )
    .get(channelId)
  return hydrateChannelRow(row)
}

export function fetchChannelBySlug(slug) {
  const s = String(slug || '').trim().toLowerCase()
  if (!s) return null
  const row = db
    .prepare(
      `SELECT c.id, c.slug, c.name, c.description, c.owner_id AS ownerId, c.created_at AS createdAt,
              COALESCE(c.price_month, 0) AS priceMonth, COALESCE(c.price_year, 0) AS priceYear,
              c.banner_path AS bannerPath, c.social_links AS socialLinksJson,
              COALESCE(c.blocked, 0) AS blocked, c.blocked_reason AS blockedReason,
              COALESCE(c.live_active, 0) AS liveActive
       FROM channels c WHERE lower(c.slug) = ?`
    )
    .get(s)
  return hydrateChannelRow(row)
}

export function listChannelsForUser(userId) {
  const globalAdmin = isSiteAdminUser(userId)
  const rows = globalAdmin
    ? db
        .prepare(
      `SELECT c.id, c.slug, c.name, c.description, c.owner_id AS ownerId, c.created_at AS createdAt,
              COALESCE(c.price_month, 0) AS priceMonth, COALESCE(c.price_year, 0) AS priceYear,
              c.banner_path AS bannerPath, c.social_links AS socialLinksJson,
              COALESCE(c.blocked, 0) AS blocked, c.blocked_reason AS blockedReason,
              COALESCE(c.live_active, 0) AS liveActive,
              cm.role AS membershipRole,
              cs.plan AS subPlan, cs.status AS subStatus, cs.current_period_end AS subEnd
           FROM channels c
           LEFT JOIN channel_members cm ON cm.channel_id = c.id AND cm.user_id = ?
           LEFT JOIN channel_subscriptions cs ON cs.channel_id = c.id AND cs.user_id = ?
           ORDER BY c.name COLLATE NOCASE ASC`
        )
        .all(userId, userId)
    : db
        .prepare(
          `SELECT c.id, c.slug, c.name, c.description, c.owner_id AS ownerId, c.created_at AS createdAt,
                  COALESCE(c.price_month, 0) AS priceMonth, COALESCE(c.price_year, 0) AS priceYear,
                  c.banner_path AS bannerPath, c.social_links AS socialLinksJson,
                  COALESCE(c.blocked, 0) AS blocked, c.blocked_reason AS blockedReason,
                  COALESCE(c.live_active, 0) AS liveActive,
                  cm.role AS membershipRole,
                  cs.plan AS subPlan, cs.status AS subStatus, cs.current_period_end AS subEnd
           FROM channels c
           INNER JOIN channel_members cm ON cm.channel_id = c.id AND cm.user_id = ?
           LEFT JOIN channel_subscriptions cs ON cs.channel_id = c.id AND cs.user_id = ?
           WHERE COALESCE(c.blocked, 0) = 0
           ORDER BY c.name COLLATE NOCASE ASC`
        )
        .all(userId, userId)

  return rows.map((r) => {
    const role = r.membershipRole != null ? normalizeChannelRole(r.membershipRole) : null
    const subActive = r.subEnd && new Date(r.subEnd) > new Date() && r.subStatus === 'active'
    const staff = role === 'owner' || role === 'admin' || role === 'moderator'
    let effectiveRole = role || 'member'
    if (globalAdmin && (!role || role === 'member')) {
      effectiveRole = 'moderator'
    }
    const chBlocked = Number(r.blocked) === 1
    const canAccess = globalAdmin ? true : !chBlocked && (staff || subActive)
    return {
      id: r.id,
      slug: r.slug,
      name: r.name,
      description: r.description || null,
      ownerId: r.ownerId,
      createdAt: r.createdAt,
      priceMonth: r.priceMonth ?? 0,
      priceYear: r.priceYear ?? 0,
      bannerPath: r.bannerPath || null,
      socialLinks: socialLinksFromDb(r.socialLinksJson),
      blocked: chBlocked,
      blockedReason: r.blockedReason || null,
      liveActive: Number(r.liveActive) === 1,
      myRole: effectiveRole,
      siteAdminAccess: globalAdmin || undefined,
      subscription: staff
        ? null
        : {
            active: subActive,
            plan: r.subPlan || null,
            currentPeriodEnd: r.subEnd || null,
            status: r.subStatus || null,
          },
      canAccess,
    }
  })
}

export function channelSubPayload(channelId, userId) {
  const staff = isChannelStaff(userId, channelId)
  if (staff) {
    return { active: true, plan: null, currentPeriodEnd: null, status: 'staff', canceledAt: null }
  }
  const row = db
    .prepare(
      `SELECT plan, status, current_period_end AS currentPeriodEnd, canceled_at AS canceledAt
       FROM channel_subscriptions WHERE channel_id = ? AND user_id = ?`
    )
    .get(channelId, userId)
  if (!row) return null
  const active = row.status === 'active' && new Date(row.currentPeriodEnd) > new Date()
  return {
    active,
    plan: row.plan,
    currentPeriodEnd: row.currentPeriodEnd,
    status: row.status,
    canceledAt: row.canceledAt,
  }
}

export function isValidSlug(slug) {
  const s = String(slug || '').trim().toLowerCase()
  if (s.length < 2 || s.length > 50) return false
  if (s.startsWith('-') || s.endsWith('-')) return false
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)
}
