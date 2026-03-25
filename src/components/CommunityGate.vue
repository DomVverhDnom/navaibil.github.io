<script setup>
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import { api, parseJson } from '../lib/api'

const route = useRoute()
const { isAuthenticated, isSubscribed, isBanned, user, isAdmin } = useAuth()

/** Загрузка summary канала: блокировка платформой */
const channelGate = ref({ loading: false, blocked: false, reason: '' })

const subscribePath = computed(() => {
  const k = String(route.params.channelKey || '').trim()
  if (k) return `/channels/${encodeURIComponent(k)}/subscribe`
  return '/channels'
})

watch(
  () => [String(route.params.channelKey || '').trim(), isAuthenticated.value],
  async () => {
    const k = String(route.params.channelKey || '').trim()
    if (!k || !isAuthenticated.value) {
      channelGate.value = { loading: false, blocked: false, reason: '' }
      return
    }
    channelGate.value = { loading: true, blocked: false, reason: '' }
    try {
      const res = await api(`/api/channels/${encodeURIComponent(k)}/summary`)
      const data = await parseJson(res)
      const ch = data?.channel
      if (res.ok && ch?.blocked && !isAdmin.value) {
        channelGate.value = { loading: false, blocked: true, reason: ch.blockedReason || '' }
      } else {
        channelGate.value = { loading: false, blocked: false, reason: '' }
      }
    } catch {
      channelGate.value = { loading: false, blocked: false, reason: '' }
    }
  },
  { immediate: true }
)
</script>

<template>
  <div v-if="!isAuthenticated" class="gate">
    <div class="gate__card premium-glow">
      <h2 class="gate__title">Войдите в аккаунт</h2>
      <p class="gate__text">Раздел доступен зарегистрированным пользователям с доступом к этому каналу.</p>
      <div class="gate__actions">
        <RouterLink to="/login" class="btn btn--primary">Вход</RouterLink>
        <RouterLink to="/register" class="btn btn--ghost">Регистрация</RouterLink>
      </div>
    </div>
  </div>

  <div v-else-if="isBanned" class="banned">
    <div class="banned__card premium-glow">
      <div class="banned__icon" aria-hidden="true">⛔</div>
      <h2 class="banned__title">Доступ ограничен</h2>
      <p class="banned__text">
        <template v-if="user?.banReason">Причина: {{ user.banReason }}</template>
        <template v-else>Ваш аккаунт временно или постоянно ограничен в доступе к каналам.</template>
      </p>
      <p v-if="user?.banUntil" class="banned__until">
        До: {{ new Date(user.banUntil).toLocaleString('ru-RU') }}
      </p>
      <p class="banned__hint">Лента, чат и комментарии недоступны. Подписка не отменяется автоматически.</p>
      <RouterLink to="/cabinet" class="btn btn--ghost">Личный кабинет</RouterLink>
    </div>
  </div>

  <div v-else-if="channelGate.loading" class="gate">
    <p class="gate__loading">Проверка доступа…</p>
  </div>

  <div v-else-if="channelGate.blocked" class="blocked-ch">
    <div class="blocked-ch__card premium-glow">
      <div class="blocked-ch__icon" aria-hidden="true">🚫</div>
      <h2 class="blocked-ch__title">Канал заблокирован</h2>
      <p v-if="channelGate.reason" class="blocked-ch__text">{{ channelGate.reason }}</p>
      <p v-else class="blocked-ch__text">Доступ к этому каналу ограничен администрацией сайта.</p>
      <RouterLink to="/channels" class="btn btn--ghost">К списку каналов</RouterLink>
    </div>
  </div>

  <div v-else-if="!isSubscribed" class="paywall">
    <div class="paywall__glow" aria-hidden="true" />
    <div class="paywall__card premium-glow">
      <div class="paywall__icon" aria-hidden="true">🔐</div>
      <h2 class="paywall__title">Только для подписчиков</h2>
      <p class="paywall__text">
        Оформите подписку на этот канал, чтобы пользоваться лентой, комментариями и чатом.
      </p>
      <RouterLink :to="subscribePath" class="btn btn--primary">Оформить доступ</RouterLink>
      <RouterLink to="/cabinet" class="paywall__link">Личный кабинет</RouterLink>
    </div>
  </div>

  <slot v-else />
</template>

<style scoped>
.gate {
  display: flex;
  justify-content: center;
  padding: 48px 16px;
}

.gate__card {
  max-width: 420px;
  padding: 32px 28px;
  border-radius: var(--tg-radius-lg);
  background: var(--tg-surface);
  border: 1px solid var(--tg-border);
  text-align: center;
}

.gate__title {
  margin: 0 0 10px;
  font-size: 1.35rem;
}

.gate__loading {
  margin: 0;
  color: var(--tg-muted);
  font-size: 0.95rem;
}

.gate__text {
  margin: 0 0 22px;
  color: var(--tg-muted);
  font-size: 0.95rem;
  line-height: 1.5;
}

.blocked-ch {
  display: flex;
  justify-content: center;
  padding: 40px 16px;
}

.blocked-ch__card {
  max-width: 440px;
  padding: 32px 28px;
  border-radius: var(--tg-radius-lg);
  background: var(--tg-surface);
  border: 1px solid var(--tg-border);
  text-align: center;
}

.blocked-ch__icon {
  font-size: 2.25rem;
  margin-bottom: 12px;
}

.blocked-ch__title {
  margin: 0 0 12px;
  font-size: 1.3rem;
  font-weight: 700;
}

.blocked-ch__text {
  margin: 0 0 20px;
  color: var(--tg-muted);
  font-size: 0.92rem;
  line-height: 1.5;
}

.gate__actions {
  display: flex;
  gap: 10px;
  justify-content: center;
  flex-wrap: wrap;
}

.paywall {
  position: relative;
  min-height: 360px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
}

.paywall__glow {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 80% 50% at 50% 20%, var(--tg-accent-soft), transparent 55%);
  pointer-events: none;
}

.paywall__card {
  position: relative;
  z-index: 2;
  width: 100%;
  max-width: 400px;
  padding: 36px 28px 32px;
  border-radius: var(--tg-radius-lg);
  background: color-mix(in srgb, var(--tg-surface) 94%, black);
  border: 1px solid var(--tg-accent-line);
  text-align: center;
}

.paywall__icon {
  font-size: 2.5rem;
  margin-bottom: 12px;
  filter: drop-shadow(0 8px 24px var(--tg-glow));
}

.paywall__title {
  margin: 0 0 12px;
  font-size: 1.4rem;
  font-weight: 700;
}

.paywall__text {
  margin: 0 0 24px;
  font-size: 0.95rem;
  color: var(--tg-muted);
  line-height: 1.55;
}

.paywall__link {
  display: block;
  margin-top: 18px;
  font-size: 0.88rem;
  color: var(--tg-muted);
}

.paywall__link:hover {
  color: var(--tg-text);
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 12px 22px;
  border-radius: var(--tg-radius-md);
  font-weight: 600;
  font-size: 0.92rem;
  border: none;
  cursor: pointer;
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

.banned {
  display: flex;
  justify-content: center;
  padding: 40px 16px;
}

.banned__card {
  max-width: 440px;
  padding: 32px 28px;
  border-radius: var(--tg-radius-lg);
  background: var(--tg-surface);
  border: 1px solid rgba(255, 107, 107, 0.25);
  text-align: center;
}

.banned__icon {
  font-size: 2.25rem;
  margin-bottom: 12px;
}

.banned__title {
  margin: 0 0 12px;
  font-size: 1.35rem;
  font-weight: 700;
  color: #ef9a9a;
}

.banned__text {
  margin: 0 0 10px;
  color: var(--tg-muted);
  font-size: 0.95rem;
  line-height: 1.5;
}

.banned__until {
  margin: 0 0 12px;
  font-size: 0.88rem;
  color: var(--tg-gold);
}

.banned__hint {
  margin: 0 0 20px;
  font-size: 0.8rem;
  color: var(--tg-muted);
  line-height: 1.45;
}
</style>
