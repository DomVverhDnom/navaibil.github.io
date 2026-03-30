<script setup>
import { ref, watch, computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { api, parseJson } from '../lib/api'
import { mediaUrl } from '../lib/mediaUrl'
import { useAuth } from '../composables/useAuth'

const route = useRoute()
const { user, isAdmin, refreshMe } = useAuth()

const profile = ref(null)
const loading = ref(true)
const err = ref('')
const adminErr = ref('')
const banReasonDraft = ref('')
const banDaysDraft = ref('0')
const adminBusy = ref(false)

const userId = computed(() => Number(route.params.userId))

const isSelf = computed(() => profile.value && user.value && profile.value.id === user.value.id)

const showAdminBlock = computed(
  () => isAdmin.value && profile.value && !isSelf.value && user.value?.id !== profile.value.id
)

const showChannelsSection = computed(() => {
  if (!profile.value) return false
  if (isSelf.value) return profile.value.showPublicChannels === true
  return (profile.value.publicChannels?.length || 0) > 0
})

function roleLabel(role) {
  const r = role || 'user'
  if (r === 'admin') return 'Администратор'
  if (r === 'moderator') return 'Модератор'
  return 'Участник'
}

function fmt(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return '—'
  }
}

async function load() {
  const id = userId.value
  loading.value = true
  err.value = ''
  profile.value = null
  if (!Number.isFinite(id) || id <= 0) {
    err.value = 'Некорректный пользователь'
    loading.value = false
    return
  }
  try {
    const res = await api(`/api/users/${id}`)
    const data = await parseJson(res)
    if (!res.ok) {
      err.value = data?.error || 'Не удалось загрузить профиль'
      return
    }
    profile.value = data.user || null
  } finally {
    loading.value = false
  }
}

async function banUser() {
  if (!profile.value?.id) return
  adminBusy.value = true
  adminErr.value = ''
  const days = Number(banDaysDraft.value) || 0
  const res = await api(`/api/admin/users/${profile.value.id}/ban`, {
    method: 'POST',
    body: {
      reason: banReasonDraft.value.trim() || undefined,
      days: days > 0 ? days : undefined,
    },
  })
  const data = await parseJson(res)
  adminBusy.value = false
  if (!res.ok) {
    adminErr.value = data?.error || 'Ошибка'
    return
  }
  await load()
  await refreshMe()
}

async function unbanUser() {
  if (!profile.value?.id) return
  adminBusy.value = true
  adminErr.value = ''
  const res = await api(`/api/admin/users/${profile.value.id}/unban`, { method: 'POST' })
  const data = await parseJson(res)
  adminBusy.value = false
  if (!res.ok) {
    adminErr.value = data?.error || 'Ошибка'
    return
  }
  banReasonDraft.value = ''
  banDaysDraft.value = '0'
  await load()
  await refreshMe()
}

watch(
  () => route.params.userId,
  () => load(),
  { immediate: true }
)
</script>

<template>
  <div class="page">
    <RouterLink to="/channels" class="back">← К каналам</RouterLink>

    <p v-if="loading" class="muted">Загрузка…</p>
    <p v-else-if="err" class="err">{{ err }}</p>

    <template v-else-if="profile">
      <div class="hero card premium-glow">
        <header class="head">
          <img
            v-if="profile.avatarUrl"
            class="av"
            :src="mediaUrl(profile.avatarUrl)"
            alt=""
            width="96"
            height="96"
          />
          <div v-else class="av av--ph" aria-hidden="true">{{ (profile.displayName || '?').slice(0, 1) }}</div>
          <div class="head-text">
            <h1 class="title">{{ profile.displayName || 'Пользователь' }}</h1>
            <p class="sub">
              <span class="role-pill">{{ roleLabel(profile.role) }}</span>
              <span v-if="profile.banned" class="ban-pill">Заблокирован</span>
            </p>
            <p v-if="profile.createdAt" class="joined">На сайте с {{ fmt(profile.createdAt) }}</p>
            <p v-if="profile.email" class="email">{{ profile.email }}</p>
            <RouterLink v-if="isSelf" to="/cabinet" class="cabinet-link">Редактировать в кабинете</RouterLink>
          </div>
        </header>
      </div>

      <div v-if="profile.banned" class="ban-note card">
        <p v-if="profile.banReason"><strong>Причина:</strong> {{ profile.banReason }}</p>
        <p v-if="profile.banUntil"><strong>До:</strong> {{ fmt(profile.banUntil) }}</p>
        <p v-if="!profile.banReason && !profile.banUntil">Аккаунт заблокирован.</p>
      </div>

      <div v-if="!isSelf" class="actions">
        <RouterLink
          v-if="!profile.banned"
          :to="`/messages/${profile.id}`"
          class="btn btn--primary"
        >
          Написать
        </RouterLink>
        <p v-else class="muted">Личные сообщения недоступны.</p>
      </div>

      <section v-if="showChannelsSection" class="channels card">
        <h2 class="section-title">Каналы</h2>
        <p v-if="profile.publicChannels?.length" class="section-lead">
          {{ isSelf ? 'Так другие пользователи видят ваши каналы в профиле.' : 'Каналы, в которых состоит пользователь.' }}
        </p>
        <p v-else class="section-lead muted">
          Вы ещё ни в одном канале или список пуст. Вступите в канал — он появится здесь для гостей профиля.
        </p>
        <ul v-if="profile.publicChannels?.length" class="ch-grid">
          <li v-for="ch in profile.publicChannels" :key="ch.id">
            <RouterLink
              :to="`/channels/${encodeURIComponent(ch.slug)}/feed`"
              class="ch-tile"
            >
              <div
                class="ch-tile__banner"
                :class="{ 'ch-tile__banner--empty': !ch.bannerPath }"
                :style="ch.bannerPath ? { backgroundImage: `url(${mediaUrl(ch.bannerPath)})` } : {}"
              />
              <div class="ch-tile__body">
                <span class="ch-tile__name">{{ ch.name }}</span>
                <span class="ch-tile__slug">@{{ ch.slug }}</span>
              </div>
            </RouterLink>
          </li>
        </ul>
      </section>

      <section v-if="showAdminBlock" class="admin card">
        <h2 class="h2">Модерация</h2>
        <p v-if="adminErr" class="err">{{ adminErr }}</p>
        <template v-if="!profile.banned">
          <label class="lbl">
            <span>Причина блокировки</span>
            <input v-model="banReasonDraft" type="text" class="inp" maxlength="500" placeholder="Необязательно" />
          </label>
          <label class="lbl">
            <span>Срок (дней, 0 — бессрочно до разбана)</span>
            <input v-model="banDaysDraft" type="number" min="0" max="3650" class="inp inp--narrow" />
          </label>
          <button type="button" class="btn btn--danger" :disabled="adminBusy" @click="banUser">
            Заблокировать
          </button>
        </template>
        <button v-else type="button" class="btn" :disabled="adminBusy" @click="unbanUser">
          Разблокировать
        </button>
      </section>
    </template>
  </div>
</template>

<style scoped>
.page {
  max-width: min(100%, var(--layout-max));
  margin: 0 auto;
  padding: 24px 20px 64px;
}

.back {
  display: inline-block;
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--tg-gold);
  margin-bottom: 18px;
  text-decoration: none;
}

.back:hover {
  text-decoration: underline;
}

.muted {
  color: var(--tg-muted);
  font-size: 0.92rem;
}

.err {
  color: #e57373;
  font-size: 0.9rem;
}

.hero {
  margin-bottom: 20px;
}

.hero .head {
  margin-bottom: 0;
}

.head {
  display: flex;
  gap: 22px;
  align-items: flex-start;
}

.av {
  width: 96px;
  height: 96px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
  border: 2px solid var(--tg-border);
}

.av--ph {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
  font-weight: 700;
  color: var(--tg-gold);
  background: var(--tg-elevated);
  border: 2px solid var(--tg-border);
}

.head-text {
  min-width: 0;
}

.title {
  margin: 0 0 8px;
  font-size: clamp(1.35rem, 2.5vw, 1.75rem);
  line-height: 1.2;
}

.cabinet-link {
  display: inline-block;
  margin-top: 10px;
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--tg-gold);
}

.cabinet-link:hover {
  text-decoration: underline;
}

.section-title {
  margin: 0 0 8px;
  font-size: 1.1rem;
  font-weight: 650;
}

.section-lead {
  margin: 0 0 16px;
  font-size: 0.88rem;
  color: var(--tg-muted);
  line-height: 1.45;
}

.section-lead a {
  color: var(--tg-gold);
  font-weight: 600;
}

.ch-grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 14px;
}

.ch-tile {
  display: flex;
  flex-direction: column;
  border-radius: var(--tg-radius-md);
  border: 1px solid var(--tg-border);
  background: var(--tg-elevated);
  overflow: hidden;
  text-decoration: none;
  color: inherit;
  transition:
    border-color 0.15s ease,
    transform 0.15s ease;
}

.ch-tile:hover {
  border-color: color-mix(in srgb, var(--tg-gold) 35%, var(--tg-border));
  transform: translateY(-2px);
}

.ch-tile__banner {
  height: 72px;
  background-size: cover;
  background-position: center;
  background-color: color-mix(in srgb, var(--tg-border) 40%, var(--tg-elevated));
}

.ch-tile__banner--empty {
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--tg-accent) 18%, var(--tg-elevated)),
    var(--tg-elevated)
  );
}

.ch-tile__body {
  padding: 12px 14px;
}

.ch-tile__name {
  display: block;
  font-weight: 650;
  font-size: 0.95rem;
}

.ch-tile__slug {
  display: block;
  font-size: 0.78rem;
  color: var(--tg-muted);
  margin-top: 4px;
}

.sub {
  margin: 0 0 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  font-size: 0.88rem;
}

.role-pill {
  padding: 2px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--tg-gold) 14%, transparent);
  color: var(--tg-gold);
  font-weight: 600;
}

.ban-pill {
  padding: 2px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, #e57373 22%, transparent);
  color: #ffab91;
  font-weight: 600;
}

.joined {
  margin: 0;
  font-size: 0.82rem;
  color: var(--tg-muted);
}

.email {
  margin: 6px 0 0;
  font-size: 0.85rem;
  word-break: break-all;
  color: var(--tg-muted);
}

.card {
  padding: 16px 18px;
  border-radius: var(--tg-radius-md);
  border: 1px solid var(--tg-border);
  background: color-mix(in srgb, var(--tg-bg) 55%, var(--tg-surface));
  margin-bottom: 16px;
}

.ban-note p {
  margin: 0 0 6px;
  font-size: 0.88rem;
}

.ban-note p:last-child {
  margin-bottom: 0;
}

.actions {
  margin-bottom: 20px;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px 18px;
  border-radius: var(--tg-radius-sm);
  border: 1px solid var(--tg-border);
  background: var(--tg-surface);
  color: var(--tg-text);
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
  text-decoration: none;
}

.btn:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--tg-gold) 35%, var(--tg-border));
}

.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.btn--primary {
  background: color-mix(in srgb, var(--tg-gold) 18%, var(--tg-surface));
  border-color: color-mix(in srgb, var(--tg-gold) 40%, var(--tg-border));
  color: var(--tg-gold);
}

.btn--danger {
  margin-top: 12px;
  border-color: color-mix(in srgb, #e57373 45%, var(--tg-border));
  color: #ffab91;
  background: color-mix(in srgb, #e57373 12%, transparent);
}

.admin .h2 {
  margin: 0 0 14px;
  font-size: 1rem;
}

.lbl {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
  font-size: 0.82rem;
  color: var(--tg-muted);
}

.inp {
  padding: 10px 12px;
  border-radius: var(--tg-radius-sm);
  border: 1px solid var(--tg-border);
  background: var(--tg-bg);
  color: var(--tg-text);
  font-size: 0.92rem;
}

.inp--narrow {
  max-width: 120px;
}
</style>
