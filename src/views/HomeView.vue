<script setup>
import { RouterLink } from 'vue-router'
import { useAuth } from '../composables/useAuth'

const { isAuthenticated, hasAnyChannelAccess } = useAuth()

const features = [
  {
    title: 'Каналы с доступом',
    text: 'Каждый канал — своя лента постов и общий чат. Владелец назначает команду, настраивает оформление и следит за порядком; участники видят только то, к чему у них есть доступ.',
  },
  {
    title: 'Личный кабинет',
    text: 'Профиль, подписки и срок действия доступа собраны на одной странице — быстро проверить статус и перейти к нужному каналу.',
  },
  {
    title: 'Живое общение',
    text: 'Комментарии к постам и чат канала обновляются по мере появления сообщений — удобно вести обсуждения без перезагрузки страницы.',
  },
  {
    title: 'Интерфейс',
    text: 'Тёмная тема и аккуратная типографика: основное на экране читается с первого взгляда, лишние отвлечения убраны.',
  },
]
</script>

<template>
  <div class="home">
    <section class="hero">
      <div class="hero__grid" aria-hidden="true" />
      <div class="hero__content">
        <p class="hero__eyebrow">PrivateCommunity</p>
        <h1 class="hero__title">
          Лента и чат
          <span class="gold-gradient-text">в одном месте</span>
        </h1>
        <p class="hero__lead">
          Объединяйте аудиторию в каналах: публикуйте материалы, отвечайте в комментариях и общайтесь в общем чате — всё
          в рамках выбранного канала.
        </p>
        <div class="hero__actions">
          <template v-if="!isAuthenticated">
            <RouterLink to="/register" class="btn btn--primary premium-glow">Регистрация</RouterLink>
            <RouterLink to="/login" class="btn btn--ghost">Войти</RouterLink>
          </template>
          <template v-else-if="!hasAnyChannelAccess">
            <RouterLink to="/channels" class="btn btn--primary premium-glow">Мои каналы</RouterLink>
            <RouterLink to="/cabinet" class="btn btn--ghost">Кабинет</RouterLink>
          </template>
          <template v-else>
            <RouterLink to="/channels" class="btn btn--primary premium-glow">Перейти к каналам</RouterLink>
            <RouterLink to="/cabinet" class="btn btn--ghost">Личный кабинет</RouterLink>
          </template>
        </div>
      </div>
    </section>

    <section class="section">
      <h2 class="section__title">Как это работает</h2>
      <p class="section__subtitle">
        После регистрации выберите канал: оформите доступ по правилам канала, откройте ленту и чат. Владельцы каналов
        управляют участниками и контентом; глобальные настройки платформы — у администраторов сайта.
      </p>
      <div class="grid">
        <article v-for="(f, i) in features" :key="f.title" class="card">
          <span class="card__idx" aria-hidden="true">{{ String(i + 1).padStart(2, '0') }}</span>
          <h3 class="card__title">{{ f.title }}</h3>
          <p class="card__text">{{ f.text }}</p>
        </article>
      </div>
    </section>

    <section class="cta">
      <div class="cta__inner premium-glow">
        <h2 class="cta__title">Ваш следующий шаг</h2>
        <p class="cta__text">
          Перейдите к каталогу каналов: посмотрите описание, условия доступа и подключитесь к сообществам, которые вам
          интересны.
        </p>
        <RouterLink to="/channels" class="btn btn--dark">Открыть каналы</RouterLink>
      </div>
    </section>
  </div>
</template>

<style scoped>
.home {
  max-width: 1040px;
  margin: 0 auto;
  padding: 0 22px 56px;
}

.hero {
  position: relative;
  padding: 48px 0 56px;
  overflow: hidden;
}

.hero__grid {
  position: absolute;
  inset: -40% -20% auto -20%;
  height: 120%;
  background-image:
    linear-gradient(rgba(51, 144, 236, 0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(51, 144, 236, 0.04) 1px, transparent 1px);
  background-size: 48px 48px;
  mask-image: radial-gradient(ellipse 70% 60% at 50% 0%, black 20%, transparent 75%);
  pointer-events: none;
}

.hero__content {
  position: relative;
  max-width: 620px;
}

.hero__eyebrow {
  margin: 0 0 14px;
  font-size: 0.8125rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--tg-muted);
}

.hero__title {
  margin: 0 0 18px;
  font-size: clamp(1.85rem, 4.2vw, 2.65rem);
  font-weight: 700;
  letter-spacing: -0.035em;
  line-height: 1.12;
  color: var(--tg-text);
}

.hero__lead {
  margin: 0 0 28px;
  font-size: 1.0625rem;
  line-height: 1.6;
  color: var(--tg-muted);
  max-width: 34rem;
}

.hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 13px 22px;
  border-radius: var(--tg-radius-md);
  font-weight: 600;
  font-size: 0.9375rem;
  border: none;
  cursor: pointer;
  transition: transform 0.15s, opacity 0.15s;
}

.btn:active {
  transform: scale(0.98);
}

.btn--primary {
  color: var(--tg-on-accent);
  background: var(--tg-gradient-primary);
}

.btn--primary:hover {
  opacity: 0.94;
}

.btn--ghost {
  color: var(--tg-text);
  background: var(--tg-elevated);
  border: 1px solid var(--tg-border);
}

.btn--ghost:hover {
  background: color-mix(in srgb, var(--tg-elevated) 85%, var(--tg-accent) 15%);
}

.btn--dark {
  color: var(--tg-accent-hi);
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid var(--tg-accent-line);
}

.btn--dark:hover {
  background: rgba(0, 0, 0, 0.58);
}

.section {
  padding: 28px 0 44px;
}

.section__title {
  margin: 0 0 8px;
  font-size: 1.375rem;
  font-weight: 650;
  letter-spacing: -0.02em;
}

.section__subtitle {
  margin: 0 0 28px;
  color: var(--tg-muted);
  max-width: 36rem;
  font-size: 0.9375rem;
  line-height: 1.55;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 14px;
}

.card {
  padding: 20px 20px 22px;
  border-radius: var(--tg-radius-lg);
  background: var(--tg-surface);
  border: 1px solid var(--tg-border);
  transition: border-color 0.2s, box-shadow 0.2s;
}

.card:hover {
  border-color: color-mix(in srgb, var(--tg-accent) 28%, var(--tg-border));
  box-shadow: 0 14px 44px -22px var(--tg-glow);
}

.card__idx {
  display: block;
  margin-bottom: 12px;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--tg-accent);
  opacity: 0.85;
}

.card__title {
  margin: 0 0 8px;
  font-size: 1rem;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.card__text {
  margin: 0;
  font-size: 0.875rem;
  color: var(--tg-muted);
  line-height: 1.55;
}

.cta {
  padding: 12px 0 28px;
}

.cta__inner {
  padding: 32px 26px;
  border-radius: var(--tg-radius-lg);
  background: linear-gradient(165deg, #0d1218 0%, var(--tg-surface) 50%, #121214 100%);
  border: 1px solid var(--tg-accent-line);
  text-align: center;
}

.cta__title {
  margin: 0 0 10px;
  font-size: 1.35rem;
  font-weight: 650;
  letter-spacing: -0.02em;
}

.cta__text {
  margin: 0 0 20px;
  color: var(--tg-muted);
  max-width: 28rem;
  margin-left: auto;
  margin-right: auto;
  font-size: 0.9375rem;
  line-height: 1.55;
}
</style>
