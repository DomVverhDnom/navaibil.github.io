<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { Room, RoomEvent, Track } from 'livekit-client'
import CommunityGate from '../components/CommunityGate.vue'
import { api, parseJson } from '../lib/api'
import { useAuth } from '../composables/useAuth'

const route = useRoute()
const { isSubscribed } = useAuth()

const channelKey = computed(() => String(route.params.channelKey || '').trim())

const loading = ref(true)
const configured = ref(false)
const liveActive = ref(false)
const iAmOwner = ref(false)
const roomName = ref('')
const err = ref('')
const busy = ref(false)
const inRoom = ref(false)
const hasRemoteVideo = ref(false)
const hasLocalVideo = ref(false)

let room = null
const localVideo = ref(null)
const remoteVideo = ref(null)

function clearVideoContainers() {
  if (localVideo.value) localVideo.value.innerHTML = ''
  if (remoteVideo.value) remoteVideo.value.innerHTML = ''
  hasRemoteVideo.value = false
  hasLocalVideo.value = false
}

function detachRoom() {
  if (room) {
    try {
      room.disconnect()
    } catch {
      /* ignore */
    }
    room = null
  }
  clearVideoContainers()
  inRoom.value = false
}

async function loadStatus() {
  const k = channelKey.value
  if (!k || !isSubscribed.value) {
    loading.value = false
    return
  }
  loading.value = true
  err.value = ''
  try {
    const res = await api(`/api/channels/${encodeURIComponent(k)}/live`)
    const data = await parseJson(res)
    if (!res.ok) {
      err.value = data?.error || 'Не удалось загрузить статус эфира'
      return
    }
    configured.value = !!data.configured
    liveActive.value = !!data.liveActive
    iAmOwner.value = !!data.iAmOwner
    roomName.value = data.roomName || ''
  } finally {
    loading.value = false
  }
}

async function startBroadcast() {
  const k = channelKey.value
  if (!k || busy.value) return
  err.value = ''
  busy.value = true
  try {
    const res = await api(`/api/channels/${encodeURIComponent(k)}/live/start`, { method: 'POST' })
    const data = await parseJson(res)
    if (!res.ok) {
      err.value = data?.error || 'Не удалось начать эфир'
      return
    }
    liveActive.value = true
    await connectAsPublisher(data.token, data.url)
  } finally {
    busy.value = false
  }
}

async function joinAsViewer() {
  const k = channelKey.value
  if (!k || busy.value) return
  err.value = ''
  busy.value = true
  try {
    const res = await api(`/api/channels/${encodeURIComponent(k)}/live/viewer-token`, { method: 'POST' })
    const data = await parseJson(res)
    if (!res.ok) {
      err.value = data?.error || 'Не удалось подключиться'
      return
    }
    await connectAsViewerOnly(data.token, data.url)
  } finally {
    busy.value = false
  }
}

async function connectAsPublisher(token, url) {
  detachRoom()
  clearVideoContainers()
  room = new Room({ adaptiveStream: true, dynacast: true })

  room.on(RoomEvent.LocalTrackPublished, (publication) => {
    const t = publication.track
    if (t?.kind === Track.Kind.Video && localVideo.value) {
      localVideo.value.innerHTML = ''
      localVideo.value.appendChild(t.attach())
      hasLocalVideo.value = true
    }
  })

  room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
    if (participant.isLocal) return
    if (track.kind === Track.Kind.Video && remoteVideo.value) {
      remoteVideo.value.innerHTML = ''
      remoteVideo.value.appendChild(track.attach())
      hasRemoteVideo.value = true
    }
    if (track.kind === Track.Kind.Audio) {
      track.attach()
    }
  })

  room.on(RoomEvent.Disconnected, () => {
    inRoom.value = false
    clearVideoContainers()
  })

  try {
    await room.connect(url, token)
    await room.localParticipant.enableCameraAndMicrophone()
    inRoom.value = true
  } catch (e) {
    err.value = e?.message || 'Ошибка подключения к комнате'
    detachRoom()
  }
}

async function connectAsViewerOnly(token, url) {
  detachRoom()
  clearVideoContainers()
  room = new Room({ adaptiveStream: true, dynacast: true })

  room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
    if (participant.isLocal) return
    if (track.kind === Track.Kind.Video && remoteVideo.value) {
      remoteVideo.value.innerHTML = ''
      remoteVideo.value.appendChild(track.attach())
      hasRemoteVideo.value = true
    }
    if (track.kind === Track.Kind.Audio) {
      track.attach()
    }
  })

  room.on(RoomEvent.Disconnected, () => {
    inRoom.value = false
    clearVideoContainers()
  })

  try {
    await room.connect(url, token)
    inRoom.value = true
  } catch (e) {
    err.value = e?.message || 'Ошибка подключения'
    detachRoom()
  }
}

async function stopBroadcast() {
  const k = channelKey.value
  detachRoom()
  if (!k) return
  busy.value = true
  err.value = ''
  try {
    const res = await api(`/api/channels/${encodeURIComponent(k)}/live/stop`, { method: 'POST' })
    const data = await parseJson(res)
    if (!res.ok) {
      err.value = data?.error || 'Не удалось завершить эфир'
      return
    }
    liveActive.value = false
  } finally {
    busy.value = false
  }
}

function leaveViewer() {
  detachRoom()
}

watch(
  () => [channelKey.value, isSubscribed.value],
  () => {
    detachRoom()
    loadStatus()
  },
  { immediate: true }
)

onUnmounted(() => {
  detachRoom()
})
</script>

<template>
  <div class="page">
    <CommunityGate>
      <header class="head">
        <RouterLink :to="`/channels/${encodeURIComponent(channelKey)}/feed`" class="head__back">
          ← К ленте
        </RouterLink>
        <h1 class="head__title">Прямой эфир</h1>
        <p class="head__lead">
          Видео и звук идут через сервер
          <a
            href="https://docs.livekit.io/home/self-hosting/deployment/"
            target="_blank"
            rel="noopener noreferrer"
            class="head__doc"
            >LiveKit</a
          >. Доступ имеют участники канала с подпиской; вести эфир может только владелец.
        </p>
      </header>

      <div v-if="loading" class="card muted">Загрузка…</div>

      <template v-else-if="!configured">
        <section class="card card--warn">
          <h2 class="h2">Сервер эфиров не подключён</h2>
          <p class="p">
            Администратору сайта нужно развернуть
            <a href="https://livekit.io/" target="_blank" rel="noopener noreferrer">LiveKit</a>
            и задать в <code>.env</code> переменные:
          </p>
          <ul class="ul">
            <li><code>LIVEKIT_URL</code> — WebSocket, например <code>wss://livekit.example.com</code></li>
            <li><code>LIVEKIT_API_KEY</code> и <code>LIVEKIT_API_SECRET</code> — из конфигурации LiveKit</li>
          </ul>
        </section>
      </template>

      <template v-else>
        <section class="card">
          <p v-if="liveActive" class="badge">Сейчас объявлен эфир в этом канале</p>
          <p v-else class="muted small">Эфир не объявлен. Владелец может начать трансляцию ниже.</p>

          <div class="stage">
            <div class="stage__col">
              <h3 class="stage__label">Трансляция</h3>
              <div class="stage__video">
                <div ref="remoteVideo" class="stage__fill" />
                <p v-if="!hasRemoteVideo" class="stage__placeholder">Здесь появится видео ведущего</p>
              </div>
            </div>
            <div v-if="iAmOwner" class="stage__col">
              <h3 class="stage__label">Ваше видео</h3>
              <div class="stage__video">
                <div ref="localVideo" class="stage__fill" />
                <p v-if="!hasLocalVideo" class="stage__placeholder">После старта эфира — превью с камеры</p>
              </div>
            </div>
          </div>

          <div class="actions">
            <template v-if="iAmOwner">
              <button
                v-if="!inRoom"
                type="button"
                class="btn btn--primary"
                :disabled="busy"
                @click="startBroadcast"
              >
                Начать эфир
              </button>
              <template v-else>
                <button type="button" class="btn btn--danger" :disabled="busy" @click="stopBroadcast">
                  Завершить эфир
                </button>
              </template>
            </template>
            <template v-else>
              <button
                v-if="liveActive && !inRoom"
                type="button"
                class="btn btn--primary"
                :disabled="busy"
                @click="joinAsViewer"
              >
                Смотреть эфир
              </button>
              <button v-if="inRoom" type="button" class="btn btn--ghost" :disabled="busy" @click="leaveViewer">
                Отключиться
              </button>
            </template>
          </div>

          <p v-if="roomName" class="tech muted small">Комната: {{ roomName }}</p>
          <p v-if="err" class="err">{{ err }}</p>
        </section>
      </template>
    </CommunityGate>
  </div>
</template>

<style scoped>
.page {
  max-width: var(--layout-max);
  margin: 0 auto;
  padding: 28px 20px 56px;
}

.head__back {
  display: inline-block;
  margin-bottom: 10px;
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--tg-gold);
}

.head__title {
  margin: 0 0 8px;
  font-size: 1.5rem;
  font-weight: 700;
}

.head__lead {
  margin: 0 0 20px;
  font-size: 0.88rem;
  color: var(--tg-muted);
  line-height: 1.5;
  max-width: 52rem;
}

.head__doc {
  color: var(--tg-accent);
  font-weight: 600;
}

.card {
  padding: 20px;
  border-radius: var(--tg-radius-lg);
  border: 1px solid var(--tg-border);
  background: var(--tg-surface);
}

.card--warn {
  border-color: color-mix(in srgb, var(--tg-accent) 25%, var(--tg-border));
}

.h2 {
  margin: 0 0 12px;
  font-size: 1.1rem;
}

.p {
  margin: 0 0 10px;
  line-height: 1.5;
  font-size: 0.9rem;
}

.ul {
  margin: 0;
  padding-left: 1.2rem;
  font-size: 0.88rem;
  line-height: 1.55;
  color: var(--tg-muted);
}

code {
  font-size: 0.85em;
  padding: 0.1em 0.35em;
  border-radius: 6px;
  background: var(--tg-elevated);
  border: 1px solid var(--tg-border);
}

.badge {
  margin: 0 0 16px;
  padding: 8px 12px;
  border-radius: var(--tg-radius-sm);
  background: color-mix(in srgb, #f44336 12%, transparent);
  border: 1px solid color-mix(in srgb, #f44336 35%, var(--tg-border));
  color: #ffcdd2;
  font-size: 0.88rem;
  font-weight: 600;
}

.small {
  font-size: 0.85rem;
}

.stage {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 18px;
}

@media (max-width: 720px) {
  .stage {
    grid-template-columns: 1fr;
  }
}

.stage__col {
  position: relative;
  min-width: 0;
}

.stage__label {
  margin: 0 0 8px;
  font-size: 0.78rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--tg-muted);
}

.stage__video {
  position: relative;
  aspect-ratio: 16 / 10;
  border-radius: var(--tg-radius-md);
  background: var(--tg-bg);
  border: 1px solid var(--tg-border);
  overflow: hidden;
}

.stage__fill {
  position: absolute;
  inset: 0;
  z-index: 1;
}

.stage__fill :deep(video) {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.stage__placeholder {
  position: absolute;
  inset: 0;
  z-index: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 12px;
  text-align: center;
  font-size: 0.85rem;
  color: var(--tg-muted);
  pointer-events: none;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.btn {
  padding: 10px 18px;
  border-radius: var(--tg-radius-md);
  font-weight: 600;
  font-size: 0.9rem;
  border: none;
  cursor: pointer;
  font-family: inherit;
}

.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn--primary {
  color: var(--tg-on-accent);
  background: var(--tg-gradient-primary-strong);
}

.btn--danger {
  color: #fff;
  background: linear-gradient(135deg, #e57373, #c62828);
}

.btn--ghost {
  background: transparent;
  color: var(--tg-muted);
  border: 1px solid var(--tg-border);
}

.tech {
  margin: 12px 0 0;
}

.err {
  margin: 12px 0 0;
  font-size: 0.85rem;
  color: #ff8a80;
}

.muted {
  color: var(--tg-muted);
}
</style>
