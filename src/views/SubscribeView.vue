<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter, useRoute, RouterLink } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import { api, parseJson } from '../lib/api'

const router = useRouter()
const route = useRoute()
const { isAuthenticated, isSubscribed, currentChannel, activateSubscription, loading, isAdmin } = useAuth()

const channelKey = computed(() => String(route.params.channelKey || '').trim())
const channelName = ref('')
const channelDescription = ref('')
const channelPrices = ref({ month: 0, year: 0 })
const isDev = import.meta.env.DEV
const billing = ref('month')
const err = ref('')
const busy = ref(false)
const channelBlocked = ref(false)
const channelBlockedReason = ref('')

function fmtRub(n) {
  const x = Number(n) || 0
  return `${new Intl.NumberFormat('ru-RU').format(x)} ₽`
}

const selectablePlans = computed(() => {
  const m = channelPrices.value.month
  const y = channelPrices.value.year
  if (m === 0 && y === 0) {
    return [
      {
        id: 'month',
        name: 'Доступ',
        price: 'Бесплатно',
        period: 'без оплаты',
        highlight: true,
        badge: null,
      },
    ]
  }
  const out = []
  if (m > 0) {
    out.push({
      id: 'month',
      name: '1 месяц',
      price: fmtRub(m),
      period: 'в месяц',
      highlight: false,
      badge: null,
    })
  }
  if (y > 0) {
    const good = m > 0 && y < m * 12
    out.push({
      id: 'year',
      name: '12 месяцев',
      price: fmtRub(y),
      period: 'в год',
      highlight: !!good,
      badge: good ? 'Выгоднее' : null,
    })
  }
  if (!out.length) {
    return [
      {
        id: 'month',
        name: 'Доступ',
        price: 'Бесплатно',
        period: '',
        highlight: true,
        badge: null,
      },
    ]
  }
  return out
})

watch(
  selectablePlans,
  (plans) => {
    if (!plans.some((p) => p.id === billing.value)) {
      billing.value = plans[0]?.id || 'month'
    }
  },
  { immediate: true }
)

async function loadSummary() {
  const k = channelKey.value
  if (!k) return
  const res = await api(`/api/channels/${encodeURIComponent(k)}/summary`)
  const data = await parseJson(res)
  if (res.ok && data?.channel) {
    channelName.value = data.channel.name
    channelDescription.value = data.channel.description || ''
    channelPrices.value = {
      month: Number(data.channel.priceMonth) || 0,
      year: Number(data.channel.priceYear) || 0,
    }
    channelBlocked.value = !!data.channel.blocked
    channelBlockedReason.value = data.channel.blockedReason || ''
  } else {
    channelBlocked.value = false
    channelBlockedReason.value = ''
  }
}

watch(channelKey, loadSummary, { immediate: true })
onMounted(loadSummary)

const staffRole = computed(() => {
  const r = currentChannel.value?.myRole
  if (r === 'owner' || r === 'admin' || r === 'moderator') return r
  return null
})

async function activate() {
  err.value = ''
  const k = channelKey.value
  if (!k) {
    err.value = 'Не указан канал'
    return
  }
  if (!isAuthenticated.value) {
    router.push({ name: 'login', query: { redirect: route.fullPath } })
    return
  }
  busy.value = true
  try {
    const plan = billing.value === 'year' ? 'year' : 'month'
    await activateSubscription(plan, k)
    router.push({ name: 'channel-feed', params: { channelKey: k } })
  } catch (e) {
    err.value = e.message || 'Ошибка'
  } finally {
    busy.value = false
  }
}

function fmt(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return '—'
  }
}
</script>

<template>
  <div class="page">
    <header v-if="channelKey" class="page__head">
      <h1 class="page__title">
        <span class="gold-gradient-text">Доступ</span>
        к каналу
      </h1>
      <p class="page__lead">
        <template v-if="channelName">Канал: <strong>{{ channelName }}</strong> ({{ channelKey }}). </template>
        Тарифы задаёт владелец канала. После оплаты (или тестовой активации) откроются лента и чат.
      </p>
      <p v-if="channelDescription" class="page__desc">{{ channelDescription }}</p>
    </header>

    <div v-if="!channelKey" class="note">
      <RouterLink to="/channels">Выберите канал в списке</RouterLink>, затем оформите доступ.
    </div>

    <template v-else>
      <div v-if="channelBlocked && !isAdmin" class="blocked-banner">
        <p class="blocked-banner__title">Канал заблокирован администрацией сайта</p>
        <p v-if="channelBlockedReason" class="blocked-banner__text">{{ channelBlockedReason }}</p>
        <RouterLink to="/channels" class="btn btn--ghost">К каналам</RouterLink>
      </div>

      <div v-else-if="!isAuthenticated" class="note">
        <RouterLink to="/login">Войдите</RouterLink>
        или
        <RouterLink to="/register">зарегистрируйтесь</RouterLink>
        , чтобы оформить подписку.
      </div>

      <div v-else-if="staffRole" class="active">
        <div class="active__card premium-glow">
          <p class="active__label">Доступ команды канала</p>
          <p class="active__plan">
            Ваша роль: <strong>{{ staffRole === 'owner' ? 'владелец' : staffRole === 'admin' ? 'админ' : 'модератор' }}</strong>
          </p>
          <div class="active__actions">
            <RouterLink :to="`/channels/${encodeURIComponent(channelKey)}/feed`" class="btn btn--primary">
              Лента
            </RouterLink>
            <RouterLink :to="`/channels/${encodeURIComponent(channelKey)}/chat`" class="btn btn--ghost">
              Чат
            </RouterLink>
          </div>
        </div>
      </div>

      <div v-else-if="isSubscribed" class="active">
        <div class="active__card premium-glow">
          <p class="active__label">Подписка на канал активна</p>
          <p class="active__plan">
            Тариф:
            <strong>{{ currentChannel?.subscription?.plan === 'year' ? 'годовой' : 'месячный' }}</strong>
          </p>
          <p class="active__until">До {{ fmt(currentChannel?.subscription?.currentPeriodEnd) }}</p>
          <div class="active__actions">
            <RouterLink :to="`/channels/${encodeURIComponent(channelKey)}/feed`" class="btn btn--primary">
              В ленту
            </RouterLink>
            <RouterLink to="/cabinet" class="btn btn--ghost">Личный кабинет</RouterLink>
          </div>
        </div>
      </div>

      <div v-else class="plans">
        <div
          v-for="p in selectablePlans"
          :key="p.id"
          class="plan"
          :class="{ 'plan--highlight': p.highlight }"
          role="button"
          tabindex="0"
          @click="billing = p.id"
          @keydown.enter="billing = p.id"
          @keydown.space.prevent="billing = p.id"
        >
          <span v-if="p.badge" class="plan__badge">{{ p.badge }}</span>
          <div class="plan__radio" :class="{ 'plan__radio--on': billing === p.id }" />
          <div class="plan__body">
            <h2 class="plan__name">{{ p.name }}</h2>
            <p class="plan__price">{{ p.price }} <span class="plan__period">{{ p.period }}</span></p>
          </div>
        </div>

        <ul class="perks">
          <li>Лента и чат только этого канала</li>
          <li>Комментарии к постам</li>
          <li>Управление в личном кабинете</li>
        </ul>

        <p v-if="err" class="err">{{ err }}</p>
        <button
          type="button"
          class="btn btn--primary btn--block premium-glow"
          :disabled="busy || loading"
          @click="activate"
        >
          {{ busy ? 'Подключение…' : 'Подключить подписку' }}
        </button>
        <p class="fine">
          <template v-if="isDev">
            В режиме разработки оплата не списывается: сервер сразу выдаёт тестовый период для этого канала.
          </template>
          <template v-else>
            На продакшен-сервере активация без реальной оплаты отключена, пока не подключена платёжка (или явно не включён тестовый режим в настройках API).
          </template>
        </p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.page {
  max-width: 480px;
  margin: 0 auto;
  padding: 32px 20px 56px;
}

.page__head {
  margin-bottom: 28px;
}

.page__title {
  margin: 0 0 10px;
  font-size: 1.75rem;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.page__lead {
  margin: 0;
  font-size: 0.92rem;
  color: var(--tg-muted);
  line-height: 1.55;
}

.page__desc {
  margin: 14px 0 0;
  font-size: 0.88rem;
  line-height: 1.55;
  color: var(--tg-text);
  white-space: pre-wrap;
}

.note {
  padding: 20px;
  border-radius: var(--tg-radius-md);
  background: var(--tg-surface);
  border: 1px solid var(--tg-border);
  font-size: 0.9rem;
  color: var(--tg-muted);
}

.note a {
  color: var(--tg-gold);
  font-weight: 600;
}

.blocked-banner {
  padding: 24px 20px;
  border-radius: var(--tg-radius-lg);
  background: var(--tg-surface);
  border: 1px solid rgba(255, 107, 107, 0.3);
  text-align: center;
}

.blocked-banner__title {
  margin: 0 0 10px;
  font-weight: 700;
  color: #ef9a9a;
}

.blocked-banner__text {
  margin: 0 0 16px;
  font-size: 0.9rem;
  color: var(--tg-muted);
  line-height: 1.5;
}

.active {
  margin-top: 8px;
}

.active__card {
  padding: 28px 24px;
  border-radius: var(--tg-radius-lg);
  background: var(--tg-surface);
  border: 1px solid var(--tg-accent-line);
  text-align: center;
}

.active__label {
  margin: 0 0 8px;
  font-size: 0.78rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--tg-muted);
}

.active__plan {
  margin: 0 0 6px;
  font-size: 1.05rem;
}

.active__until {
  margin: 0 0 20px;
  font-size: 0.9rem;
  color: var(--tg-muted);
}

.active__actions {
  display: flex;
  gap: 10px;
  justify-content: center;
  flex-wrap: wrap;
}

.plans {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.plan {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 18px 16px;
  border-radius: var(--tg-radius-lg);
  background: var(--tg-surface);
  border: 2px solid var(--tg-border);
  cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.plan--highlight {
  border-color: color-mix(in srgb, var(--tg-accent) 40%, var(--tg-border));
  background: linear-gradient(165deg, #0d1218 0%, var(--tg-surface) 100%);
}

.plan:hover {
  border-color: color-mix(in srgb, var(--tg-accent) 35%, var(--tg-border));
}

.plan__badge {
  position: absolute;
  top: 10px;
  right: 12px;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--tg-on-accent);
  background: var(--tg-gradient-primary);
}

.plan__radio {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid var(--tg-muted);
  flex-shrink: 0;
  margin-top: 4px;
}

.plan__radio--on {
  border-color: var(--tg-gold);
  box-shadow: inset 0 0 0 4px var(--tg-bg), inset 0 0 0 8px var(--tg-gold);
}

.plan__body {
  flex: 1;
  min-width: 0;
}

.plan__name {
  margin: 0 0 4px;
  font-size: 1.05rem;
  font-weight: 600;
}

.plan__price {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--tg-gold);
}

.plan__period {
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--tg-muted);
}

.perks {
  margin: 8px 0 0;
  padding-left: 18px;
  font-size: 0.88rem;
  color: var(--tg-muted);
  line-height: 1.6;
}

.err {
  margin: 0;
  font-size: 0.88rem;
  color: #ff8a80;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 12px 20px;
  border-radius: var(--tg-radius-md);
  font-weight: 600;
  font-size: 0.92rem;
  border: none;
  cursor: pointer;
  text-decoration: none;
}

.btn--primary {
  color: var(--tg-on-accent);
  background: var(--tg-gradient-primary);
}

.btn--ghost {
  color: var(--tg-text);
  background: var(--tg-elevated);
  border: 1px solid var(--tg-border);
}

.btn--block {
  width: 100%;
  margin-top: 8px;
}

.fine {
  margin: 14px 0 0;
  font-size: 0.78rem;
  color: var(--tg-muted);
  line-height: 1.45;
}
</style>
