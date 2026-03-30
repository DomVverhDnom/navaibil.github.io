<script setup>
import { onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import { mediaUrl } from '../lib/mediaUrl'

const { channels, refreshMe, loading } = useAuth()

onMounted(() => {
  refreshMe()
})

function fmtRub(n) {
  const x = Number(n) || 0
  return `${new Intl.NumberFormat('ru-RU').format(x)} ₽`
}

function roleRu(r) {
  if (r === 'owner') return 'Владелец'
  if (r === 'admin') return 'Админ'
  if (r === 'moderator') return 'Модератор'
  return 'Участник'
}

function rolePillClass(r) {
  if (r === 'owner') return 'role-pill--owner'
  if (r === 'admin') return 'role-pill--admin'
  if (r === 'moderator') return 'role-pill--mod'
  return 'role-pill--member'
}

function channelPriceHint(c) {
  if (c.myRole === 'owner' || c.myRole === 'admin' || c.myRole === 'moderator') return ''
  const m = c.priceMonth ?? 0
  const y = c.priceYear ?? 0
  if (m === 0 && y === 0) return 'Бесплатный доступ'
  if (m > 0 && y > 0) return `${fmtRub(m)}/мес · ${fmtRub(y)}/год`
  if (m > 0) return `${fmtRub(m)}/мес`
  return `${fmtRub(y)}/год`
}

function descSnippet(text, max = 140) {
  const s = String(text || '').replace(/\s+/g, ' ').trim()
  if (!s) return ''
  if (s.length <= max) return s
  return `${s.slice(0, max - 1)}…`
}

function bannerStyle(c) {
  if (c.bannerPath) {
    return { backgroundImage: `url(${mediaUrl(c.bannerPath)})` }
  }
  return {}
}
</script>

<template>
  <div class="page">
    <header class="page-head">
      <div class="page-head__text">
        <h1 class="title">Мои каналы</h1>
        <p class="lead">
          Ленты и чаты ваших сообществ. Создайте новое или присоединитесь по приглашению.
        </p>
      </div>
      <div class="cta-grid">
        <RouterLink to="/channels/create" class="cta cta--create">
          <span class="cta__icon" aria-hidden="true">＋</span>
          <span class="cta__label">Создать канал</span>
        </RouterLink>
        <RouterLink to="/channels/join" class="cta cta--join">
          <span class="cta__icon" aria-hidden="true">⎆</span>
          <span class="cta__label">Вступить по адресу</span>
        </RouterLink>
      </div>
    </header>

    <section class="section">
      <h2 class="section__title">Ваши сообщества</h2>
      <p v-if="loading" class="muted">Загрузка…</p>
      <ul v-else-if="channels.length" class="ch-grid">
        <li v-for="c in channels" :key="c.id" class="ch-card">
          <div
            class="ch-card__banner"
            :class="{ 'ch-card__banner--empty': !c.bannerPath }"
            :style="bannerStyle(c)"
          />
          <div class="ch-card__body">
            <div class="ch-card__headline">
              <h3 class="ch-card__name">{{ c.name }}</h3>
              <code class="ch-card__slug">/{{ c.slug }}</code>
            </div>
            <span class="role-pill" :class="rolePillClass(c.myRole)">{{ roleRu(c.myRole) }}</span>
            <p v-if="descSnippet(c.description)" class="ch-card__desc">{{ descSnippet(c.description) }}</p>
            <p v-else class="ch-card__desc ch-card__desc--muted">Описание можно добавить в управлении канала.</p>
            <div class="ch-card__chips">
              <span v-if="channelPriceHint(c)" class="chip chip--price">{{ channelPriceHint(c) }}</span>
              <span v-if="!c.canAccess" class="chip chip--warn">Нет доступа</span>
              <span v-else-if="c.canAccess" class="chip chip--ok">Доступ есть</span>
            </div>
            <div class="ch-card__actions">
              <template v-if="c.canAccess">
                <RouterLink class="btn btn--feed" :to="`/channels/${encodeURIComponent(c.slug)}/feed`">
                  Лента
                </RouterLink>
                <RouterLink class="btn btn--chat" :to="`/channels/${encodeURIComponent(c.slug)}/chat`">
                  Чат
                </RouterLink>
              </template>
              <RouterLink v-else class="btn btn--sub" :to="`/channels/${encodeURIComponent(c.slug)}/subscribe`">
                Подписка
              </RouterLink>
              <RouterLink
                v-if="c.myRole === 'owner' || c.myRole === 'admin'"
                class="btn btn--manage"
                :to="`/channels/${encodeURIComponent(c.slug)}/manage`"
              >
                Управление
              </RouterLink>
            </div>
          </div>
        </li>
      </ul>
      <div v-else class="empty">
        <p class="empty__title">Пока ни одного канала</p>
        <p class="empty__text">Создайте своё сообщество или введите slug приглашения.</p>
        <div class="empty__actions">
          <RouterLink to="/channels/create" class="btn btn--feed">Создать канал</RouterLink>
          <RouterLink to="/channels/join" class="btn btn--chat">Вступить по адресу</RouterLink>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.page {
  max-width: var(--layout-max);
  margin: 0 auto;
  padding: 28px 20px 56px;
}

.page-head {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 32px;
}

.page-head__text {
  max-width: 32rem;
}

.title {
  margin: 0 0 8px;
  font-size: 1.75rem;
  font-weight: 700;
  letter-spacing: -0.03em;
}

.lead {
  margin: 0;
  color: var(--tg-muted);
  font-size: 0.95rem;
  line-height: 1.55;
}

.cta-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.cta {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 20px;
  border-radius: var(--tg-radius-lg);
  font-weight: 600;
  font-size: 0.92rem;
  text-decoration: none;
  transition:
    transform 0.15s ease,
    box-shadow 0.2s ease,
    filter 0.15s ease;
  border: 1px solid var(--tg-border);
}

.cta:hover {
  transform: translateY(-2px);
  filter: brightness(1.05);
}

.cta__icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  flex-shrink: 0;
  font-size: 1.35rem;
  line-height: 1;
}

.cta--create {
  color: var(--tg-on-accent);
  background: var(--tg-gradient-primary-strong);
  border-color: color-mix(in srgb, var(--tg-accent) 40%, transparent);
  box-shadow: 0 8px 28px color-mix(in srgb, var(--tg-glow) 42%, transparent);
}

.cta--create .cta__icon {
  background: color-mix(in srgb, #fff 18%, transparent);
}

.cta--join {
  color: var(--tg-text);
  background: var(--tg-surface);
  box-shadow: 0 6px 20px color-mix(in srgb, #000 22%, transparent);
}

.cta--join .cta__icon {
  background: var(--tg-accent-soft);
  color: var(--tg-accent-hi);
}

.section__title {
  margin: 0 0 18px;
  font-weight: 600;
  color: var(--tg-muted);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-size: 0.72rem;
}

.ch-grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));
  gap: 20px;
}

.ch-card {
  border-radius: var(--tg-radius-lg);
  border: 1px solid var(--tg-border);
  background: var(--tg-surface);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transition:
    border-color 0.2s ease,
    box-shadow 0.25s ease;
}

.ch-card:hover {
  border-color: color-mix(in srgb, var(--tg-accent) 32%, var(--tg-border));
  box-shadow: 0 16px 48px -20px color-mix(in srgb, var(--tg-glow) 55%, transparent);
}

.ch-card__banner {
  height: 112px;
  background-size: cover;
  background-position: center;
}

.ch-card__banner--empty {
  background: linear-gradient(
    125deg,
    color-mix(in srgb, var(--tg-accent) 22%, var(--tg-elevated)),
    var(--tg-elevated) 55%,
    color-mix(in srgb, var(--tg-accent-deep) 18%, var(--tg-surface))
  );
}

.ch-card__body {
  padding: 16px 18px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
}

.ch-card__headline {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ch-card__name {
  margin: 0;
  font-size: 1.08rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.25;
}

.ch-card__slug {
  font-size: 0.78rem;
  color: var(--tg-muted);
  background: color-mix(in srgb, var(--tg-border) 45%, transparent);
  padding: 3px 8px;
  border-radius: 6px;
  width: fit-content;
  font-family: ui-monospace, monospace;
}

.role-pill {
  align-self: flex-start;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.role-pill--owner {
  background: color-mix(in srgb, #ffcc80 22%, transparent);
  color: #ffe0b2;
}

.role-pill--admin {
  background: color-mix(in srgb, #90caf9 18%, transparent);
  color: #bbdefb;
}

.role-pill--mod {
  background: color-mix(in srgb, #ce93d8 16%, transparent);
  color: #e1bee7;
}

.role-pill--member {
  background: color-mix(in srgb, var(--tg-border) 70%, transparent);
  color: var(--tg-muted);
}

.ch-card__desc {
  margin: 0;
  font-size: 0.86rem;
  line-height: 1.5;
  color: color-mix(in srgb, var(--tg-text) 88%, var(--tg-muted));
  flex: 1;
}

.ch-card__desc--muted {
  color: var(--tg-muted);
  font-style: italic;
}

.ch-card__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chip {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 999px;
}

.chip--price {
  background: color-mix(in srgb, var(--tg-gold) 14%, transparent);
  color: var(--tg-gold);
}

.chip--warn {
  background: color-mix(in srgb, #ffab91 14%, transparent);
  color: #ffccbc;
}

.chip--ok {
  background: color-mix(in srgb, #a5d6a7 14%, transparent);
  color: #c8e6c9;
}

.ch-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 9px 14px;
  border-radius: var(--tg-radius-sm);
  font-size: 0.82rem;
  font-weight: 700;
  text-decoration: none;
  border: 1px solid transparent;
  transition:
    filter 0.15s ease,
    transform 0.12s ease;
}

.btn:hover {
  filter: brightness(1.06);
  transform: translateY(-1px);
}

.btn--feed {
  color: var(--tg-on-accent);
  background: var(--tg-gradient-primary-strong);
  border-color: color-mix(in srgb, var(--tg-accent) 35%, transparent);
}

.btn--chat {
  color: var(--tg-text);
  background: color-mix(in srgb, var(--tg-accent) 20%, var(--tg-surface));
  border-color: color-mix(in srgb, var(--tg-accent) 40%, var(--tg-border));
}

.btn--sub {
  color: var(--tg-on-accent);
  background: linear-gradient(135deg, #ffab91, #ff7043);
  border-color: color-mix(in srgb, #ffab91 40%, transparent);
}

.btn--manage {
  color: #ede7f6;
  background: linear-gradient(
    145deg,
    color-mix(in srgb, #6a4abf 58%, var(--tg-surface)),
    color-mix(in srgb, #4527a0 42%, var(--tg-surface))
  );
  border-color: color-mix(in srgb, #9575cd 50%, var(--tg-border));
}

.muted {
  color: var(--tg-muted);
  font-size: 0.9rem;
}

.empty {
  text-align: center;
  padding: 48px 24px;
  border-radius: var(--tg-radius-lg);
  border: 1px dashed var(--tg-border);
  background: color-mix(in srgb, var(--tg-surface) 88%, var(--tg-bg));
}

.empty__title {
  margin: 0 0 8px;
  font-size: 1.15rem;
  font-weight: 600;
}

.empty__text {
  margin: 0 0 20px;
  color: var(--tg-muted);
  font-size: 0.9rem;
}

.empty__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
}
</style>
