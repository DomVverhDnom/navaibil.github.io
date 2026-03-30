<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import { mediaUrl } from '../lib/mediaUrl'

const { user, channels, updateProfile, uploadAvatar, cancelSubscription, loading, isAdmin, isBanned, refreshMe } =
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

const channelsOpenCount = computed(() => channels.value?.filter((c) => c.canAccess).length || 0)

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
  if (s.status === 'canceled')
    return `Отменена · ${s.tierName || 'уровень'} · ${plan} (доступ до конца периода).`
  if (!s.active) return 'Подписка неактивна или срок истёк.'
  const tier = s.tierName ? `${s.tierName} · ` : ''
  return `${tier}период: ${plan}`
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

async function togglePublicChannels(enabled) {
  if (busy.value || loading.value) return
  err.value = ''
  msg.value = ''
  busy.value = true
  try {
    await updateProfile({ showPublicChannels: enabled })
    msg.value = enabled ? 'Каналы отображаются в вашем публичном профиле' : 'Каналы скрыты от других в профиле'
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
  <div class="cab">
    <header class="cab__hero premium-glow">
      <div class="cab__hero-inner">
        <div class="cab__hero-avatar">
          <img
            v-if="user?.avatarUrl"
            class="cab__avatar-img"
            :src="mediaUrl(user.avatarUrl)"
            alt=""
            width="88"
            height="88"
          />
          <div v-else class="cab__avatar-ph" aria-hidden="true">{{ (user?.displayName || '?').slice(0, 1) }}</div>
        </div>
        <div class="cab__hero-text">
          <p class="cab__kicker">Личный кабинет</p>
          <h1 class="cab__title">{{ user?.displayName || 'Загрузка…' }}</h1>
          <p class="cab__email">{{ user?.email }}</p>
          <div class="cab__badges">
            <span class="cab__badge">{{ roleLabel }}</span>
            <span v-if="channels?.length" class="cab__badge cab__badge--dim">{{ channels.length }} каналов</span>
            <span v-if="channelsOpenCount" class="cab__badge cab__badge--ok">{{ channelsOpenCount }} с доступом</span>
          </div>
          <div class="cab__hero-actions">
            <RouterLink v-if="user?.id" :to="`/users/${user.id}`" class="cab__pill">Публичный профиль</RouterLink>
            <RouterLink to="/messages" class="cab__pill cab__pill--ghost">Сообщения</RouterLink>
          </div>
        </div>
      </div>
    </header>

    <div v-if="isBanned" class="cab__ban">
      <strong>Доступ к каналам ограничен.</strong>
      <span v-if="user?.banReason"> Причина: {{ user.banReason }}.</span>
      <span v-if="user?.banUntil"> До {{ fmt(user.banUntil) }}.</span>
    </div>

    <p v-if="msg" class="cab__flash cab__flash--ok">{{ msg }}</p>
    <p v-if="err" class="cab__flash cab__flash--err">{{ err }}</p>

    <div class="cab__grid">
      <section class="cab__panel cab__panel--profile">
        <h2 class="cab__h2">Профиль и видимость</h2>
        <p class="cab__panel-lead">
          Имя и аватар видны в чатах и комментариях. Настройте, хотите ли показывать каналы на странице
          «Публичный профиль».
        </p>

        <div class="cab__avatar-row">
          <label
            class="tg-file-btn cab__file"
            :class="{ 'tg-file-btn--disabled': busy || loading }"
          >
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
          <p class="cab__hint">JPEG, PNG, GIF или WebP, до 8 МБ.</p>
        </div>

        <label class="cab__field">
          <span class="cab__label">Отображаемое имя</span>
          <div class="cab__row">
            <input v-model="nameDraft" type="text" maxlength="80" class="cab__inp" />
            <button type="button" class="cab__btn cab__btn--accent" :disabled="busy || loading" @click="saveName">
              Сохранить
            </button>
          </div>
        </label>

        <div class="cab__privacy">
          <div class="cab__privacy-row">
            <span id="cab-privacy-lbl" class="cab__privacy-title">Каналы в профиле</span>
            <label class="cab__privacy-switch">
              <input
                type="checkbox"
                class="cab__privacy-input"
                aria-labelledby="cab-privacy-lbl"
                aria-describedby="cab-privacy-hint"
                :checked="!!user?.showPublicChannels"
                :disabled="busy || loading"
                @change="togglePublicChannels($event.target.checked)"
              />
              <span class="cab__privacy-knob" aria-hidden="true" />
            </label>
          </div>
          <p id="cab-privacy-hint" class="cab__privacy-hint">
            Для других: только название и обложка. Подписка и роль не показываются.
          </p>
        </div>

        <p v-if="isAdmin" class="cab__admin-note">
          <RouterLink to="/admin">Администрирование платформы →</RouterLink>
        </p>
      </section>

      <section class="cab__panel cab__panel--channels">
        <h2 class="cab__h2">Каналы и подписки</h2>
        <p class="cab__panel-lead">
          У каждого канала своя лента и чат. Команда канала (владелец, админ, модератор) работает без отдельной подписки.
        </p>

        <ul v-if="channels?.length" class="cab__ch-list">
          <li v-for="c in channels" :key="c.id" class="cab__ch">
            <div
              class="cab__ch-banner"
              :class="{ 'cab__ch-banner--empty': !c.bannerPath }"
              :style="c.bannerPath ? { backgroundImage: `url(${mediaUrl(c.bannerPath)})` } : {}"
            />
            <div class="cab__ch-body">
              <div class="cab__ch-head">
                <strong class="cab__ch-name">{{ c.name }}</strong>
                <span class="cab__ch-slug">@{{ c.slug }}</span>
              </div>
              <p class="cab__ch-sub">{{ subLine(c) }}</p>
              <div class="cab__ch-meta">
                <span class="cab__chip" :class="{ 'cab__chip--on': c.canAccess, 'cab__chip--off': !c.canAccess }">
                  {{ c.canAccess ? 'Есть доступ' : 'Нет доступа' }}
                </span>
                <span class="cab__chip cab__chip--dim">{{ channelRoleLabel(c.myRole) }}</span>
              </div>
              <template v-if="c.subscription">
                <ul v-if="c.subscription.currentPeriodEnd" class="cab__facts">
                  <li>Период до: <strong>{{ fmt(c.subscription.currentPeriodEnd) }}</strong></li>
                  <li v-if="c.subscription.status === 'canceled'">Статус: отменена (доступ до даты выше)</li>
                  <li v-else-if="c.subscription.active">Статус: активна</li>
                </ul>
                <div
                  v-if="c.subscription.active && c.subscription.status !== 'canceled'"
                  class="cab__ch-actions"
                >
                  <button type="button" class="cab__btn cab__btn--ghost" :disabled="busy" @click="cancelSub(c.slug)">
                    Отменить продление
                  </button>
                </div>
                <p v-else-if="!c.subscription.active && c.subscription.plan" class="cab__muted cab__muted--tight">
                  Срок истёк или нет доступа.
                  <RouterLink :to="`/channels/${encodeURIComponent(c.slug)}/subscribe`" class="cab__inline-link"
                    >Продлить</RouterLink
                  >
                </p>
              </template>
              <div class="cab__ch-links">
                <RouterLink class="cab__link" :to="`/channels/${encodeURIComponent(c.slug)}/feed`">Лента</RouterLink>
                <RouterLink class="cab__link" :to="`/channels/${encodeURIComponent(c.slug)}/chat`">Чат</RouterLink>
                <RouterLink
                  v-if="!c.canAccess"
                  class="cab__link"
                  :to="`/channels/${encodeURIComponent(c.slug)}/subscribe`"
                >
                  Подписка
                </RouterLink>
              </div>
            </div>
          </li>
        </ul>
        <p v-else class="cab__muted">Вы пока не состоите ни в одном канале.</p>
        <RouterLink to="/channels" class="cab__footer-link">Все каналы →</RouterLink>
      </section>
    </div>
  </div>
</template>

<style scoped>
.cab {
  max-width: var(--layout-max);
  margin: 0 auto;
  padding: 28px 20px 72px;
}

.cab__hero {
  border-radius: var(--tg-radius-lg);
  background: linear-gradient(
      145deg,
      color-mix(in srgb, var(--tg-surface) 88%, var(--tg-accent-soft)),
      var(--tg-surface)
    ),
    var(--tg-surface);
  border: 1px solid var(--tg-border);
  padding: 26px 28px;
  margin-bottom: 24px;
}

.cab__hero-inner {
  display: flex;
  gap: 22px;
  align-items: flex-start;
  flex-wrap: wrap;
}

.cab__hero-avatar {
  flex-shrink: 0;
}

.cab__avatar-img {
  width: 88px;
  height: 88px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid var(--tg-accent-line);
  box-shadow: 0 6px 28px -8px var(--tg-glow);
}

.cab__avatar-ph {
  width: 88px;
  height: 88px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
  font-weight: 750;
  color: var(--tg-gold);
  background: var(--tg-elevated);
  border: 2px solid var(--tg-accent-line);
}

.cab__hero-text {
  flex: 1;
  min-width: min(100%, 240px);
}

.cab__kicker {
  margin: 0 0 4px;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--tg-muted);
}

.cab__title {
  margin: 0 0 6px;
  font-size: clamp(1.45rem, 3vw, 1.85rem);
  font-weight: 750;
  line-height: 1.2;
}

.cab__email {
  margin: 0 0 14px;
  font-size: 0.88rem;
  color: var(--tg-muted);
  word-break: break-all;
}

.cab__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

.cab__badge {
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 650;
  background: var(--tg-accent-soft);
  color: var(--tg-accent-hi);
  border: 1px solid var(--tg-accent-line);
}

.cab__badge--dim {
  background: color-mix(in srgb, var(--tg-elevated) 80%, transparent);
  color: var(--tg-muted);
  border-color: var(--tg-border);
}

.cab__badge--ok {
  background: color-mix(in srgb, #81c784 16%, transparent);
  color: #c8e6c9;
  border-color: color-mix(in srgb, #81c784 35%, var(--tg-border));
}

.cab__hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.cab__pill {
  display: inline-flex;
  align-items: center;
  padding: 9px 16px;
  border-radius: 999px;
  font-size: 0.86rem;
  font-weight: 650;
  background: var(--tg-gradient-primary-strong);
  color: var(--tg-on-accent);
  border: none;
  cursor: pointer;
  text-decoration: none;
  box-shadow: 0 4px 20px -6px var(--tg-glow);
}

.cab__pill--ghost {
  background: transparent;
  color: var(--tg-gold);
  border: 1px solid var(--tg-accent-line);
  box-shadow: none;
}

.cab__pill--ghost:hover {
  background: var(--tg-accent-soft);
}

.cab__ban {
  margin: 0 0 16px;
  padding: 14px 16px;
  border-radius: var(--tg-radius-md);
  background: rgba(255, 107, 107, 0.1);
  border: 1px solid rgba(255, 107, 107, 0.25);
  font-size: 0.9rem;
  color: #ffab91;
  line-height: 1.45;
}

.cab__flash {
  margin: 0 0 14px;
  padding: 10px 14px;
  border-radius: var(--tg-radius-sm);
  font-size: 0.88rem;
}

.cab__flash--ok {
  background: color-mix(in srgb, #81c784 12%, transparent);
  color: #c8e6c9;
  border: 1px solid color-mix(in srgb, #81c784 28%, transparent);
}

.cab__flash--err {
  background: color-mix(in srgb, #e57373 12%, transparent);
  color: #ffab91;
  border: 1px solid color-mix(in srgb, #e57373 28%, transparent);
}

.cab__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 20px;
}

@media (min-width: 960px) {
  .cab__grid {
    grid-template-columns: minmax(0, 400px) minmax(0, 1fr);
    align-items: start;
  }
}

.cab__panel {
  padding: 22px 22px 24px;
  border-radius: var(--tg-radius-lg);
  background: var(--tg-surface);
  border: 1px solid var(--tg-border);
}

.cab__panel--profile {
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--tg-accent) 12%, transparent),
    0 16px 48px -24px rgba(0, 0, 0, 0.65);
}

.cab__h2 {
  margin: 0 0 8px;
  font-size: 1.08rem;
  font-weight: 700;
}

.cab__panel-lead {
  margin: 0 0 20px;
  font-size: 0.88rem;
  color: var(--tg-muted);
  line-height: 1.5;
}

.cab__avatar-row {
  margin-bottom: 20px;
}

.cab__file {
  margin-bottom: 6px;
}

.cab__hint {
  margin: 0;
  font-size: 0.76rem;
  color: var(--tg-muted);
}

.cab__field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 22px;
}

.cab__label {
  font-size: 0.82rem;
  color: var(--tg-muted);
  font-weight: 600;
}

.cab__row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.cab__inp {
  flex: 1;
  min-width: 160px;
  padding: 11px 14px;
  border-radius: var(--tg-radius-sm);
  border: 1px solid var(--tg-border);
  background: var(--tg-elevated);
  color: var(--tg-text);
  font-size: 1rem;
}

.cab__inp:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--tg-accent) 40%, var(--tg-border));
}

.cab__btn {
  padding: 11px 18px;
  border-radius: var(--tg-radius-sm);
  font-weight: 650;
  font-size: 0.86rem;
  border: none;
  cursor: pointer;
}

.cab__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.cab__btn--accent {
  color: var(--tg-on-accent);
  background: var(--tg-gradient-primary-strong);
}

.cab__btn--ghost {
  color: var(--tg-muted);
  background: transparent;
  border: 1px solid var(--tg-border);
}

.cab__btn--ghost:hover:not(:disabled) {
  color: var(--tg-text);
}

.cab__privacy {
  padding: 12px 14px;
  border-radius: var(--tg-radius-md);
  background: var(--tg-elevated);
  border: 1px solid var(--tg-border);
}

.cab__privacy-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.cab__privacy-title {
  font-size: 0.84rem;
  font-weight: 650;
  line-height: 1.3;
  color: var(--tg-text);
  flex: 1;
  min-width: 0;
}

.cab__privacy-switch {
  position: relative;
  flex-shrink: 0;
  cursor: pointer;
  display: block;
}

.cab__privacy-input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
  margin: 0;
}

.cab__privacy-knob {
  display: block;
  width: 40px;
  height: 24px;
  border-radius: 999px;
  background: var(--tg-border);
  position: relative;
  transition: background 0.16s ease;
  pointer-events: none;
}

.cab__privacy-knob::after {
  content: '';
  position: absolute;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  top: 3px;
  left: 3px;
  background: var(--tg-text);
  transition: transform 0.16s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
}

.cab__privacy-input:checked + .cab__privacy-knob {
  background: color-mix(in srgb, var(--tg-accent) 50%, var(--tg-border));
}

.cab__privacy-input:checked + .cab__privacy-knob::after {
  transform: translateX(16px);
}

.cab__privacy-input:focus-visible + .cab__privacy-knob {
  outline: 2px solid color-mix(in srgb, var(--tg-accent) 65%, transparent);
  outline-offset: 3px;
}

.cab__privacy-input:disabled + .cab__privacy-knob {
  opacity: 0.45;
}

.cab__privacy-hint {
  margin: 8px 0 0;
  padding-right: 48px;
  font-size: 0.72rem;
  line-height: 1.35;
  color: var(--tg-muted);
}

@media (max-width: 400px) {
  .cab__privacy-hint {
    padding-right: 0;
  }
}

.cab__muted {
  margin: 0;
  font-size: 0.84rem;
  color: var(--tg-muted);
  line-height: 1.45;
}

.cab__muted--tight {
  margin-top: 8px;
}

.cab__admin-note {
  margin: 20px 0 0;
  font-size: 0.86rem;
}

.cab__admin-note a {
  color: var(--tg-gold);
  font-weight: 650;
}

.cab__ch-list {
  list-style: none;
  margin: 0 0 14px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.cab__ch {
  display: grid;
  grid-template-columns: minmax(0, 120px) minmax(0, 1fr);
  gap: 0;
  border-radius: var(--tg-radius-md);
  border: 1px solid var(--tg-border);
  background: var(--tg-elevated);
  overflow: hidden;
}

@media (max-width: 600px) {
  .cab__ch {
    grid-template-columns: 1fr;
  }
}

.cab__ch-banner {
  min-height: 100%;
  background-size: cover;
  background-position: center;
  background-color: color-mix(in srgb, var(--tg-border) 35%, var(--tg-elevated));
}

.cab__ch-banner--empty {
  min-height: 100px;
  background: linear-gradient(
    160deg,
    color-mix(in srgb, var(--tg-accent) 22%, var(--tg-elevated)),
    var(--tg-elevated)
  );
}

.cab__ch-body {
  padding: 14px 16px 16px;
  min-width: 0;
}

.cab__ch-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 12px;
  margin-bottom: 6px;
}

.cab__ch-name {
  font-size: 1rem;
}

.cab__ch-slug {
  font-size: 0.8rem;
  color: var(--tg-muted);
}

.cab__ch-sub {
  margin: 0 0 10px;
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--tg-muted);
  line-height: 1.45;
}

.cab__ch-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}

.cab__chip {
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 650;
  border: 1px solid var(--tg-border);
}

.cab__chip--on {
  color: #c8e6c9;
  background: color-mix(in srgb, #81c784 12%, transparent);
  border-color: color-mix(in srgb, #81c784 30%, var(--tg-border));
}

.cab__chip--off {
  color: #ffab91;
  background: color-mix(in srgb, #e57373 10%, transparent);
  border-color: color-mix(in srgb, #e57373 25%, var(--tg-border));
}

.cab__chip--dim {
  color: var(--tg-muted);
  background: transparent;
}

.cab__facts {
  margin: 0 0 12px;
  padding-left: 18px;
  color: var(--tg-muted);
  font-size: 0.86rem;
  line-height: 1.55;
}

.cab__facts strong {
  color: var(--tg-text);
}

.cab__ch-actions {
  margin-bottom: 8px;
}

.cab__ch-links {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin-top: 12px;
}

.cab__link {
  font-size: 0.88rem;
  font-weight: 650;
  color: var(--tg-gold);
}

.cab__link:hover {
  text-decoration: underline;
}

.cab__inline-link {
  color: var(--tg-gold);
  font-weight: 650;
}

.cab__footer-link {
  display: inline-block;
  margin-top: 4px;
  font-size: 0.9rem;
  font-weight: 650;
  color: var(--tg-gold);
}
</style>
