<script setup>
import { ref, watch, onUnmounted, nextTick } from 'vue'
import { RouterLink } from 'vue-router'
import { io } from 'socket.io-client'
import { api, apiBase, parseJson } from '../lib/api'
import { mediaUrl } from '../lib/mediaUrl'
import { useAuth } from '../composables/useAuth'

const props = defineProps({
  channelKey: { type: String, required: true },
  fullPage: { type: Boolean, default: false },
})

const { token, user, canModerateThisChannel } = useAuth()

const messages = ref([])
const input = ref('')
const listEl = ref(null)
const statusMsg = ref('')
const channelName = ref('')
const channelBannerPath = ref(null)
const replyingTo = ref(null)
const channelId = ref(null)
const deletingMsgId = ref(null)
let socket = null

const origin = apiBase() || undefined

function roleLabel(role) {
  const r = role || 'user'
  if (r === 'admin') return 'Админ'
  if (r === 'moderator') return 'Модератор'
  return 'Участник'
}

function snippet(text, max = 72) {
  const s = String(text || '').replace(/\s+/g, ' ').trim()
  if (s.length <= max) return s
  return `${s.slice(0, max - 1)}…`
}

function scrollBottom() {
  const el = listEl.value
  if (el) el.scrollTop = el.scrollHeight
}

function scrollToMessage(id) {
  const el = listEl.value?.querySelector(`[data-msg-id="${id}"]`)
  el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

async function loadChannelMeta() {
  const res = await api(`/api/channels/${encodeURIComponent(props.channelKey)}/summary`)
  const data = await parseJson(res)
  if (res.ok && data?.channel) {
    channelId.value = data.channel.id
    channelName.value = data.channel.name || ''
    channelBannerPath.value = data.channel.bannerPath || null
    return data.hasAccess === true
  }
  channelId.value = null
  channelName.value = ''
  channelBannerPath.value = null
  return false
}

async function loadMessages() {
  const res = await api(`/api/channels/${encodeURIComponent(props.channelKey)}/chat/messages?limit=120`)
  const data = await parseJson(res)
  if (res.ok) {
    messages.value = data.messages || []
    if (data.channelId) channelId.value = data.channelId
    await nextTick()
    scrollBottom()
  } else {
    statusMsg.value = data?.error || 'Не удалось загрузить чат'
  }
}

function disconnect() {
  if (socket) {
    socket.removeAllListeners()
    socket.disconnect()
    socket = null
  }
}

function connect() {
  disconnect()
  statusMsg.value = ''
  socket = io(origin, {
    path: '/socket.io',
    autoConnect: false,
    auth: { token: token.value },
    transports: ['websocket', 'polling'],
  })

  socket.on('connect', () => {
    statusMsg.value = ''
    if (channelId.value) {
      socket.emit('channel:join', channelId.value)
    }
  })
  socket.on('connect_error', () => {
    statusMsg.value = 'Нет соединения с чатом. Проверьте, что API запущен.'
  })
  socket.on('chat:message', (payload) => {
    const cid = payload?.channelId
    const msg = payload?.message
    if (!msg || Number(cid) !== Number(channelId.value)) return
    messages.value.push(msg)
    nextTick().then(scrollBottom)
  })
  socket.on('chat:message:remove', (payload) => {
    const cid = payload?.channelId
    const mid = payload?.messageId
    if (mid == null || Number(cid) !== Number(channelId.value)) return
    messages.value = messages.value.filter((x) => x.id !== mid)
  })
  socket.connect()
}

function send() {
  const t = input.value.trim()
  if (!t || !socket?.connected || channelId.value == null) return
  const rid = replyingTo.value?.id
  socket.emit(
    'chat:send',
    { text: t, replyToId: rid ?? undefined, channelId: channelId.value },
    (ack) => {
      if (ack && !ack.ok) statusMsg.value = ack.error || 'Ошибка отправки'
      else if (ack?.ok) replyingTo.value = null
    }
  )
  input.value = ''
}

function startReply(m) {
  replyingTo.value = {
    id: m.id,
    authorName: m.authorName,
    content: m.content,
  }
}

async function removeChatMessage(m) {
  if (!canModerateThisChannel.value || !m?.id || deletingMsgId.value) return
  if (!confirm('Удалить это сообщение для всех участников?')) return
  deletingMsgId.value = m.id
  statusMsg.value = ''
  try {
    const res = await api(
      `/api/channels/${encodeURIComponent(props.channelKey)}/chat/messages/${m.id}`,
      { method: 'DELETE' }
    )
    const data = await parseJson(res)
    if (!res.ok) {
      statusMsg.value = data?.error || 'Не удалось удалить сообщение'
      return
    }
    messages.value = messages.value.filter((x) => x.id !== m.id)
  } finally {
    deletingMsgId.value = null
  }
}

function fmtTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function canOpenUserProfile(m) {
  const id = m?.authorId
  return id != null && id !== user.value?.id
}

watch(
  () => props.channelKey,
  async () => {
    disconnect()
    messages.value = []
    replyingTo.value = null
    statusMsg.value = ''
    const access = await loadChannelMeta()
    if (!access) {
      statusMsg.value = 'Нет доступа к чату этого канала'
      return
    }
    await loadMessages()
    connect()
  },
  { immediate: true }
)

watch(
  () => token.value,
  () => {
    disconnect()
    if (props.channelKey && channelId.value) {
      loadChannelMeta().then((ok) => {
        if (ok) {
          loadMessages()
          connect()
        }
      })
    }
  }
)

onUnmounted(() => disconnect())
</script>

<template>
  <section class="chat" :class="{ 'chat--page': fullPage }" aria-label="Чат канала">
    <div
      v-if="fullPage"
      class="chat__cover"
      :class="{ 'chat__cover--empty': !channelBannerPath }"
      :style="channelBannerPath ? { backgroundImage: `url(${mediaUrl(channelBannerPath)})` } : {}"
    />
    <header class="chat__head">
      <h2 class="chat__title">{{ channelName || 'Чат канала' }}</h2>
      <p class="chat__hint">Общение участников с доступом к каналу. Сообщения появляются у всех в реальном времени.</p>
    </header>
    <p v-if="statusMsg" class="chat__status">{{ statusMsg }}</p>
    <div ref="listEl" class="chat__list tg-scroll" role="log" aria-live="polite">
      <div
        v-for="m in messages"
        :key="m.id"
        class="msg"
        :data-msg-id="m.id"
        :class="{ 'msg--me': m.authorId === user?.id }"
      >
        <RouterLink
          v-if="canOpenUserProfile(m)"
          class="msg__profile"
          :to="`/users/${m.authorId}`"
          :title="`Профиль: ${m.authorName}`"
        >
          <img
            v-if="m.authorAvatar"
            class="msg__avatar"
            :src="mediaUrl(m.authorAvatar)"
            alt=""
            width="36"
            height="36"
          />
          <div v-else class="msg__avatar msg__avatar--placeholder" aria-hidden="true" />
        </RouterLink>
        <template v-else>
          <img
            v-if="m.authorAvatar"
            class="msg__avatar"
            :src="mediaUrl(m.authorAvatar)"
            alt=""
            width="36"
            height="36"
          />
          <div v-else class="msg__avatar msg__avatar--placeholder" aria-hidden="true" />
        </template>
        <div class="msg__body">
        <div class="msg__meta">
          <RouterLink
            v-if="canOpenUserProfile(m)"
            class="msg__author msg__author--link"
            :to="`/users/${m.authorId}`"
          >
            {{ m.authorName }}
          </RouterLink>
          <span v-else class="msg__author">{{ m.authorName }}</span>
          <span
            class="msg__role"
            :class="{
              'msg__role--admin': (m.authorRole || 'user') === 'admin',
              'msg__role--mod': m.authorRole === 'moderator',
            }"
          >
            {{ roleLabel(m.authorRole) }}
          </span>
          <span class="msg__meta-gap" aria-hidden="true" />
          <span class="msg__time">{{ fmtTime(m.createdAt) }}</span>
          <button type="button" class="msg__reply-btn" @click="startReply(m)">Ответить</button>
          <button
            v-if="canModerateThisChannel"
            type="button"
            class="msg__mod-del"
            :disabled="deletingMsgId === m.id"
            title="Удалить сообщение (модерация)"
            @click="removeChatMessage(m)"
          >
            Удалить
          </button>
        </div>
        <button
          v-if="m.replyTo"
          type="button"
          class="msg__reply-ref"
          @click="scrollToMessage(m.replyTo.id)"
        >
          <span class="msg__reply-ref-name">{{ m.replyTo.authorName }}</span>
          <span class="msg__reply-ref-text">{{ m.replyTo.preview }}</span>
        </button>
        <p class="msg__text">{{ m.content }}</p>
        </div>
      </div>
    </div>
    <div class="chat__composer">
      <div v-if="replyingTo" class="chat__reply-bar">
        <div class="chat__reply-bar-text">
          <span class="chat__reply-bar-label">Ответ для {{ replyingTo.authorName }}</span>
          <span class="chat__reply-bar-snippet">{{ snippet(replyingTo.content) }}</span>
        </div>
        <button type="button" class="chat__reply-bar-cancel" aria-label="Отменить ответ" @click="replyingTo = null">
          ×
        </button>
      </div>
      <div class="chat__composer-row">
        <textarea
          v-model="input"
          class="chat__input"
          rows="2"
          maxlength="2000"
          placeholder="Сообщение…"
          @keydown.enter.exact.prevent="send"
          @keydown.escape.prevent="replyingTo = null"
        />
        <button type="button" class="chat__send" @click="send">Отправить</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.chat {
  display: flex;
  flex-direction: column;
  min-height: 500px;
  max-height: min(78vh, 860px);
  border-radius: var(--tg-radius-lg);
  background: var(--tg-surface);
  border: 1px solid var(--tg-border);
  overflow: hidden;
}

.chat--page {
  min-height: min(88vh, 920px);
  max-height: 88vh;
}

.chat__cover {
  height: 120px;
  background-size: cover;
  background-position: center;
  border-bottom: 1px solid var(--tg-border);
}

.chat__cover--empty {
  background: linear-gradient(135deg, #1a2330 0%, var(--tg-surface) 100%);
}

.chat__head {
  padding: 16px 18px 12px;
  border-bottom: 1px solid var(--tg-border);
}

.chat__title {
  margin: 0 0 4px;
  font-size: 1.05rem;
  font-weight: 600;
}

.chat__hint {
  margin: 0;
  font-size: 0.78rem;
  color: var(--tg-muted);
  line-height: 1.4;
}

.chat__status {
  margin: 0;
  padding: 8px 14px;
  font-size: 0.82rem;
  color: #ffcc80;
  background: rgba(255, 152, 0, 0.08);
}

.msg {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.msg__avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
  border: 1px solid var(--tg-border);
}

.msg__avatar--placeholder {
  background: color-mix(in srgb, var(--tg-border) 40%, transparent);
}

.msg__profile {
  flex-shrink: 0;
  line-height: 0;
  border-radius: 50%;
  text-decoration: none;
  color: inherit;
  transition: transform 0.12s ease;
}

.msg__profile:hover {
  transform: scale(1.04);
}

.msg__profile:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--tg-accent) 70%, transparent);
  outline-offset: 2px;
}

.msg__profile:hover .msg__avatar,
.msg__profile:focus-visible .msg__avatar {
  border-color: color-mix(in srgb, var(--tg-gold) 45%, var(--tg-border));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--tg-gold) 35%, transparent);
}

.msg__body {
  min-width: 0;
  flex: 1;
}

.chat__list {
  flex: 1;
  overflow-y: auto;
  padding: 14px 22px 14px 16px;
  scrollbar-gutter: stable;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.msg__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  margin-bottom: 4px;
  font-size: 0.78rem;
}

.msg__author {
  font-weight: 600;
  color: var(--tg-gold);
}

.msg__author--link {
  text-decoration: none;
  cursor: pointer;
  border-radius: 4px;
}

.msg__author--link:hover {
  text-decoration: underline;
  text-underline-offset: 2px;
}

.msg__author--link:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--tg-accent) 70%, transparent);
  outline-offset: 1px;
}

.msg__role {
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--tg-muted);
  background: color-mix(in srgb, var(--tg-border) 55%, transparent);
}

.msg__role--mod {
  color: #b39ddb;
  background: rgba(179, 157, 219, 0.12);
}

.msg__role--admin {
  color: #81d4fa;
  background: rgba(51, 144, 236, 0.16);
}

.msg__meta-gap {
  flex: 1;
  min-width: 8px;
}

.msg__time {
  color: var(--tg-muted);
}

.msg__reply-btn {
  padding: 2px 8px;
  border-radius: var(--tg-radius-sm);
  border: 1px solid color-mix(in srgb, var(--tg-border) 70%, transparent);
  background: transparent;
  color: var(--tg-muted);
  font-size: 0.68rem;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
}

.msg__reply-btn:hover {
  color: var(--tg-gold);
  border-color: color-mix(in srgb, var(--tg-gold) 35%, var(--tg-border));
}

.msg__mod-del {
  padding: 2px 8px;
  border-radius: var(--tg-radius-sm);
  border: 1px solid color-mix(in srgb, #e57373 45%, var(--tg-border));
  background: color-mix(in srgb, #e57373 10%, transparent);
  color: #ffcdd2;
  font-size: 0.68rem;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
}

.msg__mod-del:hover:not(:disabled) {
  background: color-mix(in srgb, #e57373 22%, transparent);
}

.msg__mod-del:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.msg__reply-ref {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  max-width: 100%;
  margin: 0 0 6px;
  padding: 6px 10px;
  text-align: left;
  border: none;
  border-radius: var(--tg-radius-sm);
  border-left: 3px solid var(--tg-gold-mid);
  background: color-mix(in srgb, var(--tg-bg) 65%, var(--tg-surface));
  cursor: pointer;
  font-family: inherit;
}

.msg__reply-ref-name {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--tg-gold);
}

.msg__reply-ref-text {
  font-size: 0.75rem;
  color: var(--tg-muted);
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.msg__text {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}

.msg--me .msg__author {
  color: #9cdcfe;
}

.msg--me .msg__text {
  padding: 8px 10px;
  border-radius: var(--tg-radius-sm);
  background: var(--tg-accent-soft);
}

.chat__composer {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 0 0 14px;
  border-top: 1px solid var(--tg-border);
  background: color-mix(in srgb, var(--tg-bg) 40%, var(--tg-surface));
}

.chat__reply-bar {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--tg-border);
  background: color-mix(in srgb, var(--tg-accent) 8%, var(--tg-surface));
}

.chat__reply-bar-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.chat__reply-bar-label {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--tg-gold);
}

.chat__reply-bar-snippet {
  font-size: 0.75rem;
  color: var(--tg-muted);
  line-height: 1.35;
}

.chat__reply-bar-cancel {
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

.chat__reply-bar-cancel:hover {
  background: color-mix(in srgb, var(--tg-border) 65%, transparent);
}

.chat__composer-row {
  display: flex;
  gap: 10px;
  align-items: flex-end;
  padding: 12px 14px 0;
}

.chat__input {
  flex: 1;
  resize: none;
  padding: 10px 12px;
  border-radius: var(--tg-radius-sm);
  border: 1px solid var(--tg-border);
  background: var(--tg-elevated);
  color: var(--tg-text);
  font-family: inherit;
  font-size: 0.92rem;
}

.chat__input:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--tg-accent) 35%, var(--tg-border));
}

.chat__send {
  flex-shrink: 0;
  padding: 10px 16px;
  border-radius: var(--tg-radius-sm);
  font-weight: 600;
  font-size: 0.88rem;
  border: none;
  cursor: pointer;
  color: var(--tg-on-accent);
  background: var(--tg-gradient-primary-strong);
}

.chat__send:hover {
  opacity: 0.95;
}
</style>
