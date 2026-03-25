<script setup>
import { ref, watch, nextTick } from 'vue'
import { api, parseJson } from '../lib/api'
import { mediaUrl } from '../lib/mediaUrl'
import { useAuth } from '../composables/useAuth'

const props = defineProps({
  channelKey: { type: String, required: true },
  postId: { type: Number, required: true },
  comments: { type: Array, default: () => [] },
})

const emit = defineEmits(['fetch', 'append'])

const { user } = useAuth()
const open = ref(false)
const loadedOnce = ref(false)
const text = ref('')
const sending = ref(false)
const err = ref('')
const listEl = ref(null)

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
  }
)

watch(
  () => props.comments.length,
  () => {
    if (open.value && props.comments.length) scrollCommentsToEnd()
  }
)

watch(open, (v) => {
  if (v) scrollCommentsToEnd()
})

function toggle() {
  open.value = !open.value
  if (open.value && !loadedOnce.value) {
    loadedOnce.value = true
    emit('fetch')
  }
}

async function send() {
  const t = text.value.trim()
  if (!t || sending.value) return
  err.value = ''
  sending.value = true
  try {
    const res = await api(
      `/api/channels/${encodeURIComponent(props.channelKey)}/posts/${props.postId}/comments`,
      {
      method: 'POST',
        body: { content: t },
      }
    )
    const data = await parseJson(res)
    if (!res.ok) {
      err.value = data?.error || 'Не удалось отправить'
      return
    }
    emit('append', data.comment)
    text.value = ''
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
</script>

<template>
  <div class="pc">
    <button type="button" class="pc__toggle" @click="toggle">
      {{ open ? 'Скрыть комментарии' : `Комментарии (${comments.length})` }}
    </button>

    <div v-if="open" class="pc__body">
      <ul v-if="comments.length" ref="listEl" class="pc__list tg-scroll">
        <li v-for="c in comments" :key="c.id" class="pc__item" :class="{ 'pc__item--me': c.authorId === user?.id }">
          <img
            v-if="c.authorAvatar"
            class="pc__ava"
            :src="mediaUrl(c.authorAvatar)"
            alt=""
            width="28"
            height="28"
          />
          <div v-else class="pc__ava pc__ava--ph" aria-hidden="true" />
          <div class="pc__item-main">
          <div class="pc__meta">
            <span class="pc__author">{{ c.authorName }}</span>
            <span class="pc__time">{{ fmtWhen(c.createdAt) }}</span>
          </div>
          <p class="pc__text">{{ c.content }}</p>
          </div>
        </li>
      </ul>
      <p v-else class="pc__empty">Пока нет комментариев.</p>

      <div class="pc__composer">
        <textarea
          v-model="text"
          class="pc__input tg-scroll"
          rows="3"
          maxlength="2000"
          placeholder="Комментарий…"
          @keydown.enter.exact.prevent="send"
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
  gap: 8px;
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
