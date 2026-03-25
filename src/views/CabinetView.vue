<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import { mediaUrl } from '../lib/mediaUrl'

const { user, channels, updateProfile, uploadAvatar, cancelSubscription, loading, isStaff, isBanned, refreshMe } =
  useAuth()

onMounted(() => {
  refreshMe()
})

const roleLabel = computed(() => {
  const r = user.value?.role
  if (r === 'admin') return 'Администратор'
  if (r === 'moderator') return 'Модератор'
  return 'Участник'
})

const nameDraft = ref('')
const avatarInput = ref(null)
const busy = ref(false)
const msg = ref('')
const err = ref('')

watch(
  () => user.value?.displayName,
  (v) => {
    if (v != null) nameDraft.value = v
  },
  { immediate: true }
)

function channelRoleLabel(role) {
  if (role === 'owner') return 'владелец'
  if (role === 'admin') return 'админ'
  if (role === 'moderator') return 'модератор'
  return 'участник'
}

function subLine(c) {
  const s = c.subscription
  if (!s) return `Доступ по роли (${channelRoleLabel(c.myRole)}), подписка не нужна.`
  if (!s.plan && !s.active) return 'Подписка не оформлена.'
  const plan = s.plan === 'year' ? 'годовой' : 'месячный'
  if (s.status === 'canceled') return `Отменена · тариф ${plan} (доступ до конца периода).`
  if (!s.active) return 'Подписка неактивна или срок истёк.'
  return `Тариф: ${plan}`
}

function fmt(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return '—'
  }
}

async function onAvatarChange(e) {
  const f = e.target?.files?.[0]
  if (!f) return
  err.value = ''
  msg.value = ''
  busy.value = true
  try {
    await uploadAvatar(f)
    msg.value = 'Аватар обновлён'
  } catch (e) {
    err.value = e.message || 'Ошибка'
  } finally {
    busy.value = false
    if (avatarInput.value) avatarInput.value.value = ''
  }
}

async function saveName() {
  err.value = ''
  msg.value = ''
  busy.value = true
  try {
    await updateProfile(nameDraft.value.trim())
    msg.value = 'Имя сохранено'
  } catch (e) {
    err.value = e.message || 'Ошибка'
  } finally {
    busy.value = false
  }
}

async function cancelSub(slug) {
  if (!confirm('Отменить автопродление? Доступ сохранится до конца оплаченного периода.')) return
  err.value = ''
  msg.value = ''
  busy.value = true
  try {
    await cancelSubscription(slug)
    msg.value = 'Подписка отменена: доступ до даты окончания периода.'
  } catch (e) {
    err.value = e.message || 'Ошибка'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="page">
    <h1 class="page__title">Личный кабинет</h1>
    <p class="page__lead">Профиль и управление подпиской на сервере.</p>

    <div v-if="isBanned" class="ban-banner">
      <strong>Доступ к каналам ограничен.</strong>
      <span v-if="user?.banReason"> Причина: {{ user.banReason }}.</span>
      <span v-if="user?.banUntil"> До {{ fmt(user.banUntil) }}.</span>
    </div>

    <section class="block premium-glow">
      <h2 class="block__title">Профиль</h2>
      <div class="avatar-row">
        <div class="avatar-wrap">
          <img
            v-if="user?.avatarUrl"
            class="avatar-img"
            :src="mediaUrl(user.avatarUrl)"
            alt=""
            width="72"
            height="72"
          />
          <div v-else class="avatar-ph" aria-hidden="true">{{ (user?.displayName || '?').slice(0, 1) }}</div>
        </div>
        <div class="avatar-actions">
          <label class="tg-file-btn avatar-file-label" :class="{ 'tg-file-btn--disabled': busy || loading }">
            <input
              ref="avatarInput"
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              class="tg-file-hidden"
              tabindex="-1"
              :disabled="busy || loading"
              @change="onAvatarChange"
            />
            <span class="tg-file-btn__icon" aria-hidden="true">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            </span>
            Сменить фото
          </label>
          <p class="muted avatar-hint">JPEG, PNG, GIF или WebP, до 8 МБ.</p>
        </div>
      </div>
      <p class="muted">Email: <strong class="strong">{{ user?.email }}</strong></p>
      <p class="role">Роль: <strong>{{ roleLabel }}</strong></p>
      <p v-if="isStaff" class="admin-link">
        <RouterLink to="/admin">Панель модерации →</RouterLink>
      </p>
      <label class="field">
        <span>Отображаемое имя</span>
        <div class="row">
          <input v-model="nameDraft" type="text" maxlength="80" />
          <button type="button" class="btn btn--secondary" :disabled="busy || loading" @click="saveName">
            Сохранить
          </button>
        </div>
      </label>
    </section>

    <section class="block">
      <h2 class="block__title">Каналы и подписки</h2>
      <p class="muted lead-block">У каждого канала своя лента, чат и подписка. Команда канала (владелец, админ, модератор) ходит без оплаты.</p>
      <ul v-if="channels?.length" class="ch-list">
        <li v-for="c in channels" :key="c.id" class="ch-card">
          <div class="ch-card__head">
            <strong class="ch-name">{{ c.name }}</strong>
            <span class="ch-slug">@{{ c.slug }}</span>
          </div>
          <p class="ch-sub">{{ subLine(c) }}</p>
          <template v-if="c.subscription">
            <ul v-if="c.subscription.currentPeriodEnd" class="facts">
              <li>Период до: <strong>{{ fmt(c.subscription.currentPeriodEnd) }}</strong></li>
              <li v-if="c.subscription.status === 'canceled'">Статус: отменена (доступ до даты выше)</li>
              <li v-else-if="c.subscription.active">Статус: активна</li>
            </ul>
            <div
              v-if="c.subscription.active && c.subscription.status !== 'canceled'"
              class="actions"
            >
              <button type="button" class="btn btn--ghost" :disabled="busy" @click="cancelSub(c.slug)">
                Отменить продление
              </button>
            </div>
            <p v-else-if="!c.subscription.active && c.subscription.plan" class="muted">
              Срок истёк или нет доступа.
              <RouterLink :to="`/channels/${encodeURIComponent(c.slug)}/subscribe`">Продлить</RouterLink>
            </p>
          </template>
          <div class="ch-links">
            <RouterLink class="link link--inline" :to="`/channels/${encodeURIComponent(c.slug)}/feed`">Лента</RouterLink>
            <RouterLink class="link link--inline" :to="`/channels/${encodeURIComponent(c.slug)}/chat`">Чат</RouterLink>
            <RouterLink
              v-if="!c.canAccess"
              class="link link--inline"
              :to="`/channels/${encodeURIComponent(c.slug)}/subscribe`"
            >
              Подписка
            </RouterLink>
          </div>
        </li>
      </ul>
      <p v-else class="muted">Вы пока не состоите ни в одном канале.</p>
      <RouterLink to="/channels" class="link">Все каналы</RouterLink>
    </section>

    <p v-if="msg" class="ok">{{ msg }}</p>
    <p v-if="err" class="bad">{{ err }}</p>
  </div>
</template>

<style scoped>
.page {
  max-width: var(--layout-max);
  margin: 0 auto;
  padding: 32px 20px 64px;
}

.page__title {
  margin: 0 0 8px;
  font-size: 1.65rem;
  font-weight: 700;
}

.page__lead {
  margin: 0 0 28px;
  color: var(--tg-muted);
  font-size: 0.95rem;
}

.ban-banner {
  margin: 0 0 16px;
  padding: 14px 16px;
  border-radius: var(--tg-radius-md);
  background: rgba(255, 107, 107, 0.1);
  border: 1px solid rgba(255, 107, 107, 0.25);
  font-size: 0.9rem;
  color: #ffab91;
  line-height: 1.45;
}

.role {
  margin: 0 0 12px;
  font-size: 0.9rem;
  color: var(--tg-muted);
}

.admin-link {
  margin: 0 0 16px;
  font-size: 0.88rem;
}

.admin-link a {
  color: var(--tg-gold);
  font-weight: 600;
}

.block {
  padding: 22px 20px;
  border-radius: var(--tg-radius-lg);
  background: var(--tg-surface);
  border: 1px solid var(--tg-border);
  margin-bottom: 16px;
}

.block__title {
  margin: 0 0 14px;
  font-size: 1.05rem;
  font-weight: 600;
}

.avatar-row {
  display: flex;
  gap: 16px;
  align-items: center;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.avatar-wrap {
  flex-shrink: 0;
}

.avatar-img {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid var(--tg-border);
}

.avatar-ph {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--tg-gold);
  background: var(--tg-elevated);
  border: 2px solid var(--tg-border);
}

.avatar-actions {
  flex: 1;
  min-width: 160px;
}

.avatar-file-label {
  margin-bottom: 6px;
}

.avatar-hint {
  margin: 0;
  font-size: 0.78rem;
}

.muted {
  margin: 0 0 16px;
  font-size: 0.9rem;
  color: var(--tg-muted);
}

.strong {
  color: var(--tg-text);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 0.85rem;
  color: var(--tg-muted);
}

.row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.row input {
  flex: 1;
  min-width: 160px;
  padding: 10px 12px;
  border-radius: var(--tg-radius-sm);
  border: 1px solid var(--tg-border);
  background: var(--tg-elevated);
  color: var(--tg-text);
  font-size: 1rem;
}

.row input:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--tg-accent) 40%, var(--tg-border));
}

.lead-block {
  margin-bottom: 18px;
}

.ch-list {
  list-style: none;
  margin: 0 0 12px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.ch-card {
  padding: 14px 16px;
  border-radius: var(--tg-radius-md);
  border: 1px solid var(--tg-border);
  background: var(--tg-elevated);
}

.ch-card__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px 12px;
  margin-bottom: 6px;
}

.ch-name {
  color: var(--tg-text);
}

.ch-slug {
  font-size: 0.82rem;
  color: var(--tg-muted);
}

.ch-sub {
  margin: 0 0 10px;
  font-size: 0.88rem;
  font-weight: 500;
  color: var(--tg-muted);
  line-height: 1.45;
}

.ch-links {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 16px;
  margin-top: 10px;
}

.link--inline {
  margin-top: 0;
}

.facts {
  margin: 0 0 16px;
  padding-left: 20px;
  color: var(--tg-muted);
  font-size: 0.9rem;
  line-height: 1.6;
}

.facts strong {
  color: var(--tg-text);
}

.actions {
  margin-bottom: 8px;
}

.btn {
  padding: 10px 16px;
  border-radius: var(--tg-radius-sm);
  font-weight: 600;
  font-size: 0.88rem;
  border: none;
  cursor: pointer;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn--secondary {
  color: var(--tg-on-accent);
  background: var(--tg-gradient-primary-strong);
}

.btn--ghost {
  color: var(--tg-muted);
  background: transparent;
  border: 1px solid var(--tg-border);
}

.btn--ghost:hover:not(:disabled) {
  color: var(--tg-text);
}

.link {
  display: inline-block;
  margin-top: 8px;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--tg-gold);
}

.ok {
  color: #a5d6a7;
  font-size: 0.9rem;
}

.bad {
  color: #ff8a80;
  font-size: 0.9rem;
}
</style>
