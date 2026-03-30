/** Реакции к постам: полный каталог и настройки на канал. */

export const REACTION_CATALOG = [
  { kind: 'like', emoji: '👍' },
  { kind: 'heart', emoji: '❤️' },
  { kind: 'fire', emoji: '🔥' },
  { kind: 'clap', emoji: '👏' },
  { kind: '100', emoji: '💯' },
  { kind: 'joy', emoji: '😂' },
  { kind: 'cry', emoji: '😢' },
  { kind: 'think', emoji: '🤔' },
  { kind: 'eyes', emoji: '👀' },
  { kind: 'rocket', emoji: '🚀' },
  { kind: 'party', emoji: '🎉' },
  { kind: 'ok', emoji: '👌' },
  { kind: 'star', emoji: '⭐' },
  { kind: 'thumbs_down', emoji: '👎' },
  { kind: 'pray', emoji: '🙏' },
  { kind: 'muscle', emoji: '💪' },
  { kind: 'sparkles', emoji: '✨' },
  { kind: 'bulb', emoji: '💡' },
  { kind: 'handshake', emoji: '🤝' },
  { kind: 'wave', emoji: '👋' },
  { kind: 'raised_hands', emoji: '🙌' },
  { kind: 'melting', emoji: '🫠' },
  { kind: 'skull', emoji: '💀' },
  { kind: 'goat', emoji: '🐐' },
  { kind: 'chart', emoji: '📈' },
  { kind: 'target', emoji: '🎯' },
  { kind: 'coffee', emoji: '☕' },
  { kind: 'pizza', emoji: '🍕' },
  { kind: 'moon', emoji: '🌙' },
  { kind: 'sun', emoji: '☀️' },
  { kind: 'gift', emoji: '🎁' },
  { kind: 'warning', emoji: '⚠️' },
  { kind: 'question', emoji: '❓' },
]

export const REACTION_KINDS = new Set(REACTION_CATALOG.map((r) => r.kind))

const DEFAULT_ORDER = REACTION_CATALOG.map((r) => r.kind)

function parseJsonKindArray(raw) {
  if (raw == null || raw === '') return []
  try {
    const a = JSON.parse(String(raw))
    if (!Array.isArray(a)) return []
    return [...new Set(a.map((x) => String(x || '').toLowerCase().trim()).filter(Boolean))].filter((k) =>
      REACTION_KINDS.has(k)
    )
  } catch {
    return []
  }
}

/**
 * @param {string|null|undefined} quickJson
 * @param {string|null|undefined} enabledJson
 */
export function normalizeChannelReactions(quickJson, enabledJson) {
  let enabled = parseJsonKindArray(enabledJson)
  if (!enabled.length) enabled = [...DEFAULT_ORDER]

  let quick = parseJsonKindArray(quickJson).filter((k) => enabled.includes(k))
  if (quick.length > 5) quick = quick.slice(0, 5)
  if (!quick.length) quick = enabled.slice(0, Math.min(5, enabled.length))

  return { quick, enabled }
}

export function emojiForKind(kind) {
  return REACTION_CATALOG.find((r) => r.kind === kind)?.emoji ?? '·'
}

export function clientReactionPayload(quick, enabled) {
  const quickSet = new Set(quick)
  const bar = quick.map((k) => ({ kind: k, emoji: emojiForKind(k) }))
  const overflow = enabled.filter((k) => !quickSet.has(k)).map((k) => ({ kind: k, emoji: emojiForKind(k) }))
  return { bar, overflow }
}

export function normalizeReactionKind(raw) {
  const k = String(raw || 'like').toLowerCase()
  return REACTION_KINDS.has(k) ? k : null
}
