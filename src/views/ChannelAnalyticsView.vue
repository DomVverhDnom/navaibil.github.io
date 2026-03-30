<script setup>
import { ref, watch, computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import { api, parseJson } from '../lib/api'

const route = useRoute()
const { currentChannel, isAdmin: isSiteAdmin } = useAuth()

const channelKey = computed(() => String(route.params.channelKey || '').trim())
const canView = computed(() => {
  const r = currentChannel.value?.myRole
  return r === 'owner' || r === 'admin' || isSiteAdmin.value
})

const loading = ref(true)
const err = ref('')
const data = ref(null)

function fmtRub(n) {
  const x = Number(n) || 0
  return `${new Intl.NumberFormat('ru-RU').format(x)} ₽`
}

function fmtShortDate(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return '—'
  }
}

function planRu(p) {
  return p === 'year' ? 'Год' : 'Месяц'
}

function subStatusRu(row) {
  if (row.status === 'canceled') return 'Отменена'
  const end = row.currentPeriodEnd ? new Date(row.currentPeriodEnd) : null
  if (end && !Number.isNaN(end.getTime()) && end <= new Date()) return 'Истекла'
  if (row.status === 'active') return 'Активна'
  return row.status || '—'
}

function barHeights(series) {
  const max = Math.max(1, ...series.map((x) => x.count))
  return series.map((x) => ({ ...x, pct: Math.round((x.count / max) * 100) }))
}

async function load() {
  const k = channelKey.value
  if (!k || !canView.value) {
    loading.value = false
    return
  }
  loading.value = true
  err.value = ''
  try {
    const res = await api(`/api/channels/${encodeURIComponent(k)}/analytics`)
    const json = await parseJson(res)
    if (!res.ok) {
      err.value = json?.error || 'Нет доступа к аналитике'
      data.value = null
      return
    }
    data.value = json
  } finally {
    loading.value = false
  }
}

watch([channelKey, canView], load, { immediate: true })
</script>

<template>
  <div class="page">
    <div class="top">
      <RouterLink :to="`/channels/${encodeURIComponent(channelKey)}/manage`" class="back">← Управление</RouterLink>
      <RouterLink :to="`/channels/${encodeURIComponent(channelKey)}/feed`" class="back">К ленте</RouterLink>
    </div>
    <h1 class="title">Аналитика канала</h1>
    <p class="lead">
      Подписчики, активность и оценка выручки по тарифам канала. Доступно владельцу и администраторам канала.
    </p>

    <p v-if="!canView" class="bad">Нужны права владельца или админа канала.</p>
    <p v-else-if="loading" class="muted">Загрузка…</p>
    <p v-else-if="err" class="bad">{{ err }}</p>

    <template v-else-if="data">
      <section class="card">
        <h2 class="h2">{{ data.channel.name }}</h2>
        <p class="sub">/{{ data.channel.slug }}</p>
        <ul class="prices">
          <li>Тариф в ленте: <strong>{{ fmtRub(data.channel.priceMonth) }}</strong> / мес</li>
          <li v-if="data.channel.priceYear > 0">
            Годовой тариф: <strong>{{ fmtRub(data.channel.priceYear) }}</strong>
          </li>
        </ul>
      </section>

      <h2 class="section-title">Подписки</h2>
      <div class="grid">
        <div class="stat">
          <span class="stat__val">{{ data.subscriptions.active }}</span>
          <span class="stat__lab">активных подписок</span>
        </div>
        <div class="stat">
          <span class="stat__val">{{ data.subscriptions.activeByPlan.month }}</span>
          <span class="stat__lab">план «месяц»</span>
        </div>
        <div class="stat">
          <span class="stat__val">{{ data.subscriptions.activeByPlan.year }}</span>
          <span class="stat__lab">план «год»</span>
        </div>
        <div class="stat stat--warn">
          <span class="stat__val">{{ data.subscriptions.expiringIn7Days }}</span>
          <span class="stat__lab">истекают за 7 дней</span>
        </div>
        <div class="stat">
          <span class="stat__val">{{ data.subscriptions.inactiveOrCanceled }}</span>
          <span class="stat__lab">неактивных / отменённых записей</span>
        </div>
        <div class="stat stat--gold">
          <span class="stat__val">{{ fmtRub(data.subscriptions.estimatedMonthlyRub) }}</span>
          <span class="stat__lab">оценка выручки / мес (год÷12)</span>
        </div>
      </div>

      <h2 class="section-title">Аудитория</h2>
      <div class="grid">
        <div class="stat">
          <span class="stat__val">{{ data.members.total }}</span>
          <span class="stat__lab">всего в канале</span>
        </div>
        <div class="stat">
          <span class="stat__val">{{ data.members.byRole.member }}</span>
          <span class="stat__lab">участников</span>
        </div>
        <div class="stat">
          <span class="stat__val">{{ data.members.byRole.moderator }}</span>
          <span class="stat__lab">модераторов</span>
        </div>
        <div class="stat">
          <span class="stat__val">{{ data.members.byRole.admin }}</span>
          <span class="stat__lab">админов канала</span>
        </div>
      </div>

      <h2 class="section-title">Контент и чат</h2>
      <div class="grid">
        <div class="stat">
          <span class="stat__val">{{ data.content.postsTotal }}</span>
          <span class="stat__lab">постов всего</span>
        </div>
        <div class="stat">
          <span class="stat__val">{{ data.content.pinnedPosts }}</span>
          <span class="stat__lab">закреплённых</span>
        </div>
        <div class="stat">
          <span class="stat__val">{{ data.content.postsLast7Days }}</span>
          <span class="stat__lab">постов за 7 дней</span>
        </div>
        <div class="stat">
          <span class="stat__val">{{ data.content.postsLast30Days }}</span>
          <span class="stat__lab">постов за 30 дней</span>
        </div>
        <div class="stat">
          <span class="stat__val">{{ data.content.commentsTotal }}</span>
          <span class="stat__lab">комментариев</span>
        </div>
        <div class="stat">
          <span class="stat__val">{{ data.content.commentsLast7Days }}</span>
          <span class="stat__lab">комментариев за 7 дней</span>
        </div>
        <div class="stat">
          <span class="stat__val">{{ data.content.chatMessagesTotal }}</span>
          <span class="stat__lab">сообщений в чате</span>
        </div>
        <div class="stat">
          <span class="stat__val">{{ data.content.chatMessagesLast7Days }}</span>
          <span class="stat__lab">сообщений в чате за 7 дней</span>
        </div>
      </div>

      <div class="charts">
        <div class="card chart-card">
          <h3 class="h3">Посты по дням (14 дн.)</h3>
          <div class="bars" role="img" aria-label="Гистограмма постов">
            <div v-for="(b, i) in barHeights(data.series.postsPerDay)" :key="'p' + i" class="bar-wrap">
              <div class="bar bar--posts" :style="{ height: `${Math.max(8, b.pct)}%` }" :title="`${b.date}: ${b.count}`" />
              <span class="bar__label">{{ b.date.slice(5) }}</span>
            </div>
          </div>
        </div>
        <div class="card chart-card">
          <h3 class="h3">Чат по дням (14 дн.)</h3>
          <div class="bars" role="img" aria-label="Гистограмма сообщений">
            <div v-for="(b, i) in barHeights(data.series.chatMessagesPerDay)" :key="'c' + i" class="bar-wrap">
              <div class="bar bar--chat" :style="{ height: `${Math.max(8, b.pct)}%` }" :title="`${b.date}: ${b.count}`" />
              <span class="bar__label">{{ b.date.slice(5) }}</span>
            </div>
          </div>
        </div>
      </div>

      <section class="card">
        <h3 class="h3">Последние подписки</h3>
        <p class="hint">До 25 записей по дате обновления в базе.</p>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Пользователь</th>
                <th>Уровень</th>
                <th>План</th>
                <th>Статус</th>
                <th>До</th>
                <th>Обновлено</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in data.recentSubscriptions" :key="r.userId + '-' + r.updatedAt">
                <td>
                  <div class="name">{{ r.displayName }}</div>
                  <div class="email">{{ r.email }}</div>
                </td>
                <td>{{ r.tierName || '—' }}</td>
                <td>{{ planRu(r.plan) }}</td>
                <td>{{ subStatusRu(r) }}</td>
                <td>{{ fmtShortDate(r.currentPeriodEnd) }}</td>
                <td>{{ fmtShortDate(r.updatedAt) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="!data.recentSubscriptions.length" class="muted empty-t">Записей о подписках пока нет.</p>
      </section>
    </template>
  </div>
</template>

<style scoped>
.page {
  max-width: var(--layout-max);
  margin: 0 auto;
  padding: 28px 20px 56px;
}

.top {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 18px;
  margin-bottom: 8px;
}

.back {
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--tg-gold);
}

.title {
  margin: 0 0 8px;
  font-size: 1.5rem;
  font-weight: 700;
}

.lead {
  margin: 0 0 22px;
  color: var(--tg-muted);
  font-size: 0.92rem;
  line-height: 1.5;
  max-width: 52rem;
}

.section-title {
  margin: 28px 0 12px;
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--tg-muted);
}

.card {
  margin-bottom: 18px;
  padding: 18px 16px;
  border-radius: var(--tg-radius-lg);
  border: 1px solid var(--tg-border);
  background: var(--tg-surface);
}

.h2 {
  margin: 0 0 4px;
  font-size: 1.15rem;
  font-weight: 600;
}

.sub {
  margin: 0 0 12px;
  font-size: 0.85rem;
  color: var(--tg-muted);
}

.prices {
  margin: 0;
  padding-left: 18px;
  font-size: 0.9rem;
  color: var(--tg-text);
  line-height: 1.6;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
  margin-bottom: 8px;
}

.stat {
  padding: 14px 14px;
  border-radius: var(--tg-radius-md);
  border: 1px solid var(--tg-border);
  background: color-mix(in srgb, var(--tg-bg) 35%, var(--tg-surface));
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stat--warn {
  border-color: color-mix(in srgb, #ff9800 35%, var(--tg-border));
}

.stat--gold {
  border-color: color-mix(in srgb, var(--tg-gold) 35%, var(--tg-border));
}

.stat__val {
  font-size: 1.35rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--tg-text);
}

.stat__lab {
  font-size: 0.75rem;
  color: var(--tg-muted);
  line-height: 1.35;
}

.charts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 14px;
  margin-bottom: 18px;
}

.chart-card {
  margin-bottom: 0;
}

.h3 {
  margin: 0 0 14px;
  font-size: 1rem;
  font-weight: 600;
}

.bars {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 4px;
  height: 140px;
  padding: 0 4px;
}

.bar-wrap {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
}

.bar {
  width: 100%;
  max-width: 22px;
  margin-top: auto;
  border-radius: 4px 4px 2px 2px;
  min-height: 4px;
  transition: height 0.2s ease;
}

.bar--posts {
  background: linear-gradient(180deg, color-mix(in srgb, var(--tg-accent) 85%, #fff), var(--tg-accent));
}

.bar--chat {
  background: linear-gradient(180deg, color-mix(in srgb, var(--tg-gold) 80%, #fff), var(--tg-gold-mid, #c9a227));
}

.bar__label {
  margin-top: 6px;
  font-size: 0.62rem;
  color: var(--tg-muted);
  white-space: nowrap;
}

.hint {
  margin: 0 0 12px;
  font-size: 0.8rem;
  color: var(--tg-muted);
}

.table-wrap {
  overflow-x: auto;
  border-radius: var(--tg-radius-md);
  border: 1px solid var(--tg-border);
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82rem;
}

th,
td {
  padding: 10px 12px;
  text-align: left;
  border-bottom: 1px solid var(--tg-border);
}

th {
  color: var(--tg-muted);
  font-weight: 600;
}

.name {
  font-weight: 600;
}

.email {
  font-size: 0.75rem;
  color: var(--tg-muted);
}

.empty-t {
  margin: 12px 0 0;
}

.muted {
  color: var(--tg-muted);
}

.bad {
  color: #ff8a80;
}
</style>
