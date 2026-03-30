<script setup>
import { ref, watch, nextTick, computed } from 'vue'
import { RouterLink } from 'vue-router'
import { api, parseJson } from '../lib/api'
import { mediaUrl } from '../lib/mediaUrl'
import { useAuth } from '../composables/useAuth'

const props = defineProps({
  channelKey: { type: String, required: true },
  postId: { type: Number, required: true },
  comments: { type: Array, default: () => [] },
  /** Число из ленты (GET /posts), пока комментарии не подгружали в память */
  feedCommentCount: { type: Number, default: 0 },
  hasMoreOlder: { type: Boolean, default: false },
  /** Полное число комментариев (после первой загрузки страницы с API) */
  commentsTotal: { default: null, validator: (v) => v == null || typeof v === 'number' },
  loadingOlder: { type: Boolean, default: false },
  canModerate: { type: Boolean, default: false },
})

const emit = defineEmits(['fetch', 'append', 'removed', 'loadOlder'])

const commentLabelCount = computed(() => {
  if (props.commentsTotal != null && Number.isFinite(props.commentsTotal)) {
    return Math.max(props.commentsTotal, props.comments.length, Number(props.feedCommentCount) || 0)
  }
  return Math.max(props.comments.length, Number(props.feedCommentCount) || 0)
})

const { user } = useAuth()
const open = ref(false)
const loadedOnce = ref(false)
const text = ref('')
const sending = ref(false)
const err = ref('')
const listEl = ref(null)
const replyingTo = ref(null)
/** @type {import('vue').Ref<{ sh: number, st: number } | null>} */
const scrollRestore = ref(null)
let olderScrollCooldownUntil = 0

function snippet(t, max = 72) {
  const s = String(t || '').replace(/\s+/g, ' ').trim()
  if (s.length <= max) return s
  return `${s.slice(0, max - 1)}…`
}

function scrollCommentsToEnd() {
  nextTick(() => {
    const el = listEl.value
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  })
}

watch(
  () => props.postId,
  () => {
    open.value = false
    loadedOnce.value = false
    text.value = ''
    err.value = ''
    replyingTo.value = null
    scrollRestore.value = null
  }
)

watch(open, (v) => {
  if (v) scrollCommentsToEnd()
})

watch(
  () => [props.comments.length, props.loadingOlder],
  ([len, loading], [prevLen, prevLoading]) => {
    if (prevLoading === true && loading === false && scrollRestore.value) {
      nextTick(() => {
        const el = listEl.value
        const snap = scrollRestore.value
        scrollRestore.value = null
        if (snap && len > prevLen && el) {
          el.scrollTop = el.scrollHeight - snap.sh + snap.st
        }
      })
    }
  }
)

function triggerLoadOlder() {
  if (!props.hasMoreOlder || props.loadingOlder) return
  const el = listEl.value
  if (el) scrollRestore.value = { sh: el.scrollHeight, st: el.scrollTop }
  emit('loadOlder')
}

function onListScroll(e) {
  if (!props.hasMoreOlder || props.loadingOlder) return
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
  if (now < olderScrollCooldownUntil) return
  const el = e.target
  if (el && el.scrollTop < 56) {
    olderScrollCooldownUntil = now + 750
    triggerLoadOlder()
  }
}

function toggle() {
  open.value = !open.value
  if (open.value && !loadedOnce.value) {
    loadedOnce.value = true
    emit('fetch')
  }
}

function startReply(c) {
  replyingTo.value = {
    id: c.id,
    authorName: c.authorName,
    content: c.content,
  }
}

async function removeComment(c) {
  if (!props.canModerate || !c?.id) return
  if (!confirm('Удалить этот комментарий для всех?')) return
  err.value = ''
  const res = await api(
    `/api/channels/${encodeURIComponent(props.channelKey)}/posts/${props.postId}/comments/${c.id}`,
    { method: 'DELETE' }
  )
  const data = await parseJson(res)
  if (!res.ok) {
    err.value = data?.error || 'Не удалось удалить'
    return
  }
  emit('removed', c.id)
}

async function send() {
  const t = text.value.trim()
  if (!t || sending.value) return
  err.value = ''
  sending.value = true
  try {
    const body = { content: t }
    if (replyingTo.value?.id) body.replyToId = replyingTo.value.id
    const res = await api(
      `/api/channels/${encodeURIComponent(props.channelKey)}/posts/${props.postId}/comments`,
      {
        method: 'POST',
        body,
      }
    )
    const data = await parseJson(res)
    if (!res.ok) {
      err.value = data?.error || 'Не удалось отправить'
      return
    }
    emit('append', data.comment)
    text.value = ''
    replyingTo.value = null
    await nextTick()
    scrollCommentsToEnd()
  } finally {
    sending.value = false
  }
}

function fmtWhen(iso) {
  try {
    return new Date(iso).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return ''
  }
}

function canLinkAuthorProfile(c) {
  const id = c?.authorId
  return id != null && id !== user.value?.id
}
</script>

<template>
  <div class="pc">
    <button type="button" class="pc__toggle" @click="toggle">
      {{ open ? 'Скрыть комментарии' : `Комментарии (${commentLabelCount})` }}
    </button>

    <div v-if="open" class="pc__body">
      <ul
        v-if="comments.length || hasMoreOlder"
        ref="listEl"
        class="pc__list tg-scroll"
        @scroll.passive="onListScroll"
      >
        <li v-if="hasMoreOlder" class="pc__older">
          <button
            v-if="!loadingOlder"
            type="button"
            class="pc__older-btn"
            @click="triggerLoadOlder"
          >
            Загрузить ранее…
          </button>
          <span v-else class="pc__older-busy">Загрузка…</span>
        </li>
        <li v-for="c in comments" :key="c.id" class="pc__item" :class="{ 'pc__item--me': c.authorId === user?.id }">
          <RouterLink
            v-if="canLinkAuthorProfile(c)"
            :to="`/users/${c.authorId}`"
            class="pc__ava-link"
            :title="`Профиль: ${c.authorName}`"
          >
            <img
              v-if="c.authorAvatar"
              class="pc__ava"
              :src="mediaUrl(c.authorAvatar)"
              alt=""
              width="28"
              height="28"
            />
            <div v-else class="pc__ava pc__ava--ph" aria-hidden="true" />
          </RouterLink>
          <template v-else>
            <img
              v-if="c.authorAvatar"
              class="pc__ava"
              :src="mediaUrl(c.authorAvatar)"
              alt=""
              width="28"
              height="28"
            />
            <div v-else class="pc__ava pc__ava--ph" aria-hidden="true" />
          </template>
          <div class="pc__item-main">
            <div class="pc__meta">
              <RouterLink v-if="canLinkAuthorProfile(c)" :to="`/users/${c.authorId}`" class="pc__author pc__author--link">
                {{ c.authorName }}
              </RouterLink>
              <span v-else class="pc__author">{{ c.authorName }}</span>
              <span class="pc__time">{{ fmtWhen(c.createdAt) }}</span>
              <div class="pc__meta-actions">
                <button type="button" class="pc__reply-btn" @click="startReply(c)">Ответить</button>
                <button
                  v-if="canModerate"
                  type="button"
                  class="pc__mod-del"
                  title="Удалить комментарий"
                  @click="removeComment(c)"
                >
                  Удалить
                </button>
              </div>
            </div>
            <div v-if="c.replyTo" class="pc__reply-ref">
              <span class="pc__reply-ref-name">{{ c.replyTo.authorName }}</span>
              <span class="pc__reply-ref-text">{{ c.replyTo.preview }}</span>
            </div>
            <p class="pc__text">{{ c.content }}</p>
          </div>
        </li>
      </ul>
      <p v-else class="pc__empty">Пока нет комментариев.</p>

      <p
        v-if="open && commentsTotal != null && commentsTotal > comments.length"
        class="pc__range"
      >
        Показано {{ comments.length }} из {{ commentsTotal }}
      </p>

      <div v-if="replyingTo" class="pc__reply-bar">
        <div class="pc__reply-bar-text">
          <span class="pc__reply-bar-label">Ответ для {{ replyingTo.authorName }}</span>
          <span class="pc__reply-bar-snippet">{{ snippet(replyingTo.content) }}</span>
        </div>
        <button type="button" class="pc__reply-bar-cancel" aria-label="Отменить ответ" @click="replyingTo = null">
          ×
        </button>
      </div>

      <div class="pc__composer">
        <textarea
          v-model="text"
          class="pc__input tg-scroll"
          rows="3"
          maxlength="2000"
          placeholder="Комментарий…"
          @keydown.enter.exact.prevent="send"
          @keydown.escape.prevent="replyingTo = null"
        />
        <button type="button" class="pc__send" :disabled="sending || !text.trim()" @click="send">Отправить</button>
      </div>
      <p v-if="err" class="pc__err">{{ err }}</p>
    </div>
  </div>
</template>

<style scoped>
.pc {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--tg-border);
}

.pc__toggle {
  padding: 0;
  border: none;
  background: none;
  color: var(--tg-gold);
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}

.pc__toggle:hover {
  text-decoration: underline;
}

.pc__body {
  margin-top: 12px;
}

.pc__older {
  list-style: none;
  margin: 0 0 6px;
  padding: 6px 4px;
  text-align: center;
}

.pc__older-btn {
  padding: 8px 14px;
  border: 1px solid var(--tg-border);
  border-radius: var(--tg-radius-sm);
  background: color-mix(in srgb, var(--tg-gold) 10%, var(--tg-elevated));
  color: var(--tg-gold);
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
}

.pc__older-btn:hover {
  background: color-mix(in srgb, var(--tg-gold) 18%, var(--tg-elevated));
}

.pc__older-busy {
  font-size: 0.78rem;
  color: var(--tg-muted);
}

.pc__range {
  margin: 0 0 10px;
  font-size: 0.75rem;
  color: var(--tg-muted);
}

.pc__list {
  list-style: none;
  margin: 0 0 12px;
  padding: 8px 6px 8px 4px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 120px;
  max-height: clamp(240px, min(52vh, 520px), 640px);
  overflow-y: auto;
  overflow-x: hidden;
  scroll-behavior: smooth;
  overscroll-behavior: contain;
  border-radius: var(--tg-radius-md);
  border: 1px solid var(--tg-border);
  background: color-mix(in srgb, var(--tg-bg) 55%, var(--tg-surface));
}

.pc__item {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 10px 12px;
  border-radius: var(--tg-radius-sm);
  background: var(--tg-elevated);
  border: 1px solid var(--tg-border);
}

.pc__ava {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
  border: 1px solid var(--tg-border);
}

.pc__ava--ph {
  background: color-mix(in srgb, var(--tg-border) 45%, transparent);
}

.pc__ava-link {
  flex-shrink: 0;
  text-decoration: none;
  border-radius: 50%;
}

.pc__author--link {
  text-decoration: none;
}

.pc__author--link:hover {
  text-decoration: underline;
}

.pc__item-main {
  min-width: 0;
  flex: 1;
}

.pc__item--me {
  border-color: var(--tg-accent-line);
}

.pc__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  margin-bottom: 4px;
  font-size: 0.75rem;
}

.pc__author {
  font-weight: 600;
  color: var(--tg-gold);
}

.pc__time {
  color: var(--tg-muted);
}

.pc__meta-actions {
  margin-left: auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.pc__reply-btn {
  padding: 2px 8px;
  border: none;
  border-radius: var(--tg-radius-sm);
  background: color-mix(in srgb, var(--tg-gold) 12%, transparent);
  color: var(--tg-gold);
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
}

.pc__reply-btn:hover {
  background: color-mix(in srgb, var(--tg-gold) 22%, transparent);
}

.pc__mod-del {
  margin-left: auto;
  padding: 2px 8px;
  border: 1px solid color-mix(in srgb, #e57373 45%, var(--tg-border));
  border-radius: var(--tg-radius-sm);
  background: color-mix(in srgb, #e57373 10%, transparent);
  color: #ffcdd2;
  font-size: 0.68rem;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
}

.pc__mod-del:hover {
  background: color-mix(in srgb, #e57373 22%, transparent);
}

.pc__reply-ref {
  margin: 0 0 6px;
  padding: 6px 8px;
  border-radius: var(--tg-radius-sm);
  border-left: 3px solid var(--tg-gold);
  background: color-mix(in srgb, var(--tg-bg) 70%, var(--tg-surface));
  font-size: 0.78rem;
  line-height: 1.35;
}

.pc__reply-ref-name {
  display: block;
  font-weight: 600;
  color: var(--tg-gold);
  margin-bottom: 2px;
}

.pc__reply-ref-text {
  color: var(--tg-muted);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.pc__text {
  margin: 0;
  font-size: 0.88rem;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}

.pc__empty {
  margin: 0 0 12px;
  font-size: 0.85rem;
  color: var(--tg-muted);
}

.pc__reply-bar {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 8px;
  padding: 8px 10px;
  border-radius: var(--tg-radius-sm);
  border: 1px solid var(--tg-accent-line);
  background: var(--tg-accent-soft);
}

.pc__reply-bar-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 0.78rem;
}

.pc__reply-bar-label {
  font-weight: 600;
  color: var(--tg-gold);
}

.pc__reply-bar-snippet {
  color: var(--tg-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pc__reply-bar-cancel {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: var(--tg-radius-sm);
  background: color-mix(in srgb, var(--tg-border) 40%, transparent);
  color: var(--tg-text);
  font-size: 1.1rem;
  line-height: 1;
  cursor: pointer;
}

.pc__reply-bar-cancel:hover {
  background: color-mix(in srgb, var(--tg-border) 60%, transparent);
}

.pc__composer {
  display: flex;
  gap: 8px;
  align-items: flex-end;
}

.pc__input {
  flex: 1;
  min-height: 4.5rem;
  max-height: 11rem;
  resize: vertical;
  padding: 10px 12px;
  border-radius: var(--tg-radius-sm);
  border: 1px solid var(--tg-border);
  background: var(--tg-bg);
  color: var(--tg-text);
  font-family: inherit;
  font-size: 0.88rem;
  line-height: 1.45;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.pc__input:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--tg-accent) 35%, var(--tg-border));
}

.pc__send {
  flex-shrink: 0;
  padding: 8px 12px;
  border-radius: var(--tg-radius-sm);
  font-weight: 600;
  font-size: 0.82rem;
  border: none;
  cursor: pointer;
  color: var(--tg-on-accent);
  background: var(--tg-gradient-primary-strong);
}

.pc__send:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.pc__err {
  margin: 8px 0 0;
  font-size: 0.8rem;
  color: #ff8a80;
}
</style>
