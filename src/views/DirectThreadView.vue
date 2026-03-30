<script setup>
import { ref, watch, onUnmounted, computed, nextTick } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { io } from 'socket.io-client'
import { api, apiBase, apiForm, parseJson } from '../lib/api'
import { mediaUrl } from '../lib/mediaUrl'
import { useAuth } from '../composables/useAuth'

const route = useRoute()
const { token, user } = useAuth()

const peerId = computed(() => Number(route.params.userId))
const peer = ref(null)
const messages = ref([])
const draft = ref('')
const err = ref('')
const loading = ref(true)
const sending = ref(false)
const listEl = ref(null)
const fileInput = ref(null)
const pendingFile = ref(null)
const pendingPreview = ref(null)

const origin = apiBase() || undefined
let socket = null

function scrollBottom() {
  const el = listEl.value
  if (el) el.scrollTop = el.scrollHeight
}

function involvesPeer(msg, oid, me) {
  if (!msg || !oid || !me) return false
  return (
    (msg.fromUserId === oid && msg.toUserId === me) || (msg.fromUserId === me && msg.toUserId === oid)
  )
}

function disconnectSocket() {
  if (socket) {
    socket.removeAllListeners()
    socket.disconnect()
    socket = null
  }
}

function connectSocket(oid) {
  disconnectSocket()
  if (!token.value || !oid) return
  socket = io(origin, {
    path: '/socket.io',
    autoConnect: false,
    auth: { token: token.value },
    transports: ['websocket', 'polling'],
  })
  socket.on('connect', () => {})
  socket.on('dm:message', (payload) => {
    const msg = payload?.message
    const me = user.value?.id
    if (!msg || !involvesPeer(msg, oid, me)) return
    if (messages.value.some((m) => m.id === msg.id)) return
    messages.value.push(msg)
    nextTick().then(scrollBottom)
  })
  socket.connect()
}

async function loadThread() {
  const oid = peerId.value
  if (!Number.isFinite(oid) || oid <= 0) {
    err.value = 'Некорректный пользователь'
    loading.value = false
    return
  }
  loading.value = true
  err.value = ''
  try {
    const res = await api(`/api/dm/with/${oid}?limit=80`)
    const data = await parseJson(res)
    if (!res.ok) {
      err.value = data?.error || 'Не удалось загрузить диалог'
      peer.value = null
      messages.value = []
      return
    }
    peer.value = data.peer || null
    messages.value = data.messages || []
    await nextTick()
    scrollBottom()
    connectSocket(oid)
  } finally {
    loading.value = false
  }
}

function pickPhoto() {
  fileInput.value?.click()
}

function onFileSelected(ev) {
  const input = ev.target
  const f = input.files?.[0]
  input.value = ''
  if (!f || !/^image\//.test(f.type)) return
  if (pendingPreview.value) URL.revokeObjectURL(pendingPreview.value)
  pendingFile.value = f
  pendingPreview.value = URL.createObjectURL(f)
}

function clearPendingPhoto() {
  if (pendingPreview.value) URL.revokeObjectURL(pendingPreview.value)
  pendingPreview.value = null
  pendingFile.value = null
}

async function send() {
  const t = draft.value.trim()
  const oid = peerId.value
  const file = pendingFile.value
  if ((!t && !file) || !oid) return

  const prevDraft = draft.value
  const prevFile = file
  draft.value = ''
  clearPendingPhoto()
  sending.value = true
  err.value = ''

  try {
    let res
    if (prevFile) {
      const fd = new FormData()
      fd.append('photo', prevFile)
      fd.append('content', t)
      res = await apiForm(`/api/dm/with/${oid}`, fd)
    } else {
      res = await api(`/api/dm/with/${oid}`, { method: 'POST', body: { content: t } })
    }
    const data = await parseJson(res)
    if (!res.ok) {
      err.value = data?.error || 'Не отправлено'
      draft.value = prevDraft
      if (prevFile) {
        pendingFile.value = prevFile
        pendingPreview.value = URL.createObjectURL(prevFile)
      }
      return
    }
    if (data.message && !messages.value.some((m) => m.id === data.message.id)) {
      messages.value.push(data.message)
      await nextTick()
      scrollBottom()
    }
  } finally {
    sending.value = false
  }
}

const canSend = computed(() => {
  const oid = peerId.value
  if (!Number.isFinite(oid) || oid <= 0) return false
  return !!(draft.value.trim() || pendingFile.value)
})

function fmtWhen(iso) {
  try {
    return new Date(iso).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return ''
  }
}

watch(
  () => route.params.userId,
  () => {
    loadThread()
  },
  { immediate: true }
)

onUnmounted(() => {
  clearPendingPhoto()
  disconnectSocket()
})
</script>

<template>
  <div class="page">
    <RouterLink to="/messages" class="back">← Все диалоги</RouterLink>

    <header v-if="peer" class="head">
      <RouterLink :to="`/users/${peer.id}`" class="head-profile" title="Открыть профиль">
        <img
          v-if="peer.avatarUrl"
          class="av"
          :src="mediaUrl(peer.avatarUrl)"
          alt=""
          width="40"
          height="40"
        />
        <div v-else class="av av--ph" aria-hidden="true" />
        <div>
          <h1 class="title">{{ peer.displayName }}</h1>
          <p class="sub">Личные сообщения</p>
        </div>
      </RouterLink>
    </header>

    <p v-if="err" class="err">{{ err }}</p>
    <p v-if="loading" class="muted">Загрузка…</p>

    <div v-else ref="listEl" class="thread tg-scroll">
      <div
        v-for="m in messages"
        :key="m.id"
        class="bubble-wrap"
        :class="{ 'bubble-wrap--mine': m.fromUserId === user?.id }"
      >
        <div class="bubble">
          <a
            v-if="m.imageUrl"
            class="dm-media"
            :href="mediaUrl(m.imageUrl)"
            target="_blank"
            rel="noopener noreferrer"
          >
            <img :src="mediaUrl(m.imageUrl)" alt="" class="dm-img" />
          </a>
          <p v-if="(m.content || '').trim()" class="text">{{ m.content }}</p>
          <time class="time">{{ fmtWhen(m.createdAt) }}</time>
        </div>
      </div>
      <p v-if="!messages.length" class="hint">Напишите первое сообщение.</p>
    </div>

    <form v-if="peer && !loading" class="composer" @submit.prevent="send">
      <input
        ref="fileInput"
        type="file"
        class="visually-hidden"
        accept="image/jpeg,image/png,image/gif,image/webp"
        aria-label="Прикрепить фото"
        @change="onFileSelected"
      />
      <button
        type="button"
        class="attach"
        title="Прикрепить фото"
        :disabled="sending"
        @click="pickPhoto"
      >
        <span aria-hidden="true">📎</span>
      </button>
      <div class="composer__main">
        <div v-if="pendingPreview" class="pending-ph">
          <img :src="pendingPreview" alt="" class="pending-ph__img" />
          <button type="button" class="pending-ph__x" title="Убрать фото" @click="clearPendingPhoto">
            ×
          </button>
        </div>
        <input
          v-model="draft"
          type="text"
          class="inp"
          maxlength="2000"
          placeholder="Сообщение или подпись к фото…"
          autocomplete="off"
        />
      </div>
      <button type="submit" class="btn" :disabled="!canSend || sending">
        {{ sending ? '…' : 'Отправить' }}
      </button>
    </form>
  </div>
</template>

<style scoped>
.page {
  max-width: min(100%, 920px);
  margin: 0 auto;
  padding: 20px 20px 56px;
  display: flex;
  flex-direction: column;
  min-height: 60vh;
}

.back {
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--tg-gold);
  margin-bottom: 14px;
}

.head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.head-profile {
  display: flex;
  align-items: center;
  gap: 12px;
  text-decoration: none;
  color: inherit;
  min-width: 0;
}

.head-profile:hover .title {
  color: var(--tg-gold);
}

.av {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid var(--tg-border);
}

.av--ph {
  background: var(--tg-elevated);
}

.title {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 700;
}

.sub {
  margin: 2px 0 0;
  font-size: 0.82rem;
  color: var(--tg-muted);
}

.thread {
  flex: 1;
  overflow-y: auto;
  padding: 14px 22px 14px 12px;
  scrollbar-gutter: stable;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: min(64vh, 680px);
}

.bubble-wrap {
  display: flex;
  justify-content: flex-start;
}

.bubble-wrap--mine {
  justify-content: flex-end;
}

.bubble {
  max-width: 85%;
  padding: 10px 14px;
  border-radius: var(--tg-radius-md);
  background: var(--tg-surface);
  border: 1px solid var(--tg-border);
}

.bubble-wrap--mine .bubble {
  background: var(--tg-accent-soft);
  border-color: var(--tg-accent-line);
}

.text {
  margin: 0 0 6px;
  font-size: 0.92rem;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}

.time {
  font-size: 0.72rem;
  color: var(--tg-muted);
}

.hint {
  margin: auto;
  color: var(--tg-muted);
  font-size: 0.9rem;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.composer {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--tg-border);
}

.composer__main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.attach {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  padding: 0;
  border-radius: var(--tg-radius-sm);
  border: 1px solid var(--tg-border);
  background: var(--tg-elevated);
  color: var(--tg-text);
  font-size: 1.1rem;
  line-height: 1;
  cursor: pointer;
}

.attach:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.pending-ph {
  position: relative;
  display: inline-block;
  max-width: 120px;
}

.pending-ph__img {
  display: block;
  max-width: 120px;
  max-height: 88px;
  border-radius: var(--tg-radius-sm);
  object-fit: cover;
  border: 1px solid var(--tg-border);
}

.pending-ph__x {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--tg-surface);
  color: var(--tg-text);
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
}

.dm-media {
  display: block;
  margin: 0 0 8px;
  border-radius: var(--tg-radius-sm);
  overflow: hidden;
  max-width: min(100%, 280px);
}

.dm-img {
  display: block;
  width: 100%;
  height: auto;
}

.inp {
  flex: 1;
  padding: 12px 14px;
  border-radius: var(--tg-radius-sm);
  border: 1px solid var(--tg-border);
  background: var(--tg-elevated);
  color: var(--tg-text);
  font-size: 0.95rem;
}

.btn {
  padding: 12px 18px;
  border-radius: var(--tg-radius-sm);
  border: none;
  font-weight: 600;
  cursor: pointer;
  color: var(--tg-on-accent);
  background: var(--tg-gradient-primary);
}

.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.err {
  color: #ff8a80;
  font-size: 0.88rem;
}

.muted {
  color: var(--tg-muted);
}
</style>
