<script setup>
import { computed } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import { mediaUrl } from '../lib/mediaUrl'

const route = useRoute()
const router = useRouter()
const { isAuthenticated, hasAnyChannelAccess, isAdmin, user, logout } = useAuth()

const links = computed(() => {
  const base = [{ to: '/', label: 'Главная' }]
  if (isAuthenticated.value) {
    const extra = [
      { to: '/channels', label: 'Каналы', dot: true },
      { to: '/messages', label: 'Сообщения' },
      { to: '/cabinet', label: 'Кабинет' },
    ]
    if (isAdmin.value) extra.push({ to: '/admin', label: 'Админка' })
    return [...base, ...extra]
  }
  return [...base, { to: '/login', label: 'Вход' }]
})

const activePath = computed(() => route.path)

function linkActive(to) {
  if (to === '/channels') {
    return activePath.value === '/channels' || activePath.value.startsWith('/channels/')
  }
  if (to === '/messages') {
    return activePath.value === '/messages' || activePath.value.startsWith('/messages/')
  }
  return activePath.value === to
}

function signOut() {
  logout()
  router.push('/')
}
</script>

<template>
  <header class="nav">
    <div class="nav__inner">
      <RouterLink to="/" class="nav__brand">
        <span class="nav__logo" aria-hidden="true">✦</span>
        <span class="nav__name">Private<span class="gold-gradient-text">Community</span></span>
      </RouterLink>
      <div class="nav__right">
        <span v-if="isAuthenticated && user" class="nav__user" :title="user.email">
          <img
            v-if="user.avatarUrl"
            class="nav__avatar"
            :src="mediaUrl(user.avatarUrl)"
            alt=""
            width="28"
            height="28"
          />
          <span class="nav__user-name">{{ user.displayName }}</span>
        </span>
        <nav class="nav__links" aria-label="Основное меню">
          <RouterLink
            v-for="l in links"
            :key="l.to"
            :to="l.to"
            class="nav__link"
            :class="{ 'nav__link--active': linkActive(l.to) }"
          >
            {{ l.label }}
            <span
              v-if="l.dot && hasAnyChannelAccess"
              class="nav__dot"
              title="Есть доступ к каналу"
            />
          </RouterLink>
        </nav>
        <button v-if="isAuthenticated" type="button" class="nav__out" @click="signOut">Выйти</button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.nav {
  position: sticky;
  top: 0;
  z-index: 50;
  border-bottom: 1px solid var(--tg-border);
  background: color-mix(in srgb, var(--tg-bg) 88%, transparent);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}

.nav__inner {
  max-width: var(--layout-max);
  margin: 0 auto;
  padding: 14px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.nav__brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 700;
  font-size: 1.1rem;
  letter-spacing: -0.02em;
}

.nav__logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 12px;
  flex-shrink: 0;
  background: linear-gradient(145deg, #3a3a3c, #1e1e1f);
  border: 1px solid var(--tg-border);
  color: var(--tg-gold);
  font-size: 1rem;
  line-height: 0;
}

.nav__name {
  color: var(--tg-text);
}

.nav__right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.nav__user {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 200px;
  font-size: 0.82rem;
  color: var(--tg-muted);
}

.nav__avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid var(--tg-border);
  flex-shrink: 0;
}

.nav__user-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nav__links {
  display: flex;
  align-items: center;
  gap: 6px;
}

.nav__link {
  position: relative;
  padding: 10px 14px;
  border-radius: var(--tg-radius-sm);
  font-size: 0.88rem;
  font-weight: 500;
  color: var(--tg-muted);
  transition: color 0.2s, background 0.2s;
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  box-sizing: border-box;
}

.nav__link:hover {
  color: var(--tg-text);
  background: rgba(255, 255, 255, 0.04);
}

.nav__link--active {
  color: var(--tg-text);
  background: var(--tg-accent-soft);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tg-accent) 25%, transparent);
}

.nav__dot {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--tg-gold);
  box-shadow: 0 0 8px var(--tg-glow);
}

.nav__out {
  padding: 8px 12px;
  border-radius: var(--tg-radius-sm);
  font-size: 0.82rem;
  font-weight: 500;
  color: var(--tg-muted);
  background: transparent;
  border: 1px solid var(--tg-border);
  cursor: pointer;
}

.nav__out:hover {
  color: var(--tg-text);
}

@media (max-width: 720px) {
  .nav__inner {
    flex-direction: column;
    align-items: stretch;
  }

  .nav__right {
    flex-direction: column;
    align-items: stretch;
  }

  .nav__links {
    justify-content: center;
    flex-wrap: wrap;
  }

  .nav__user {
    text-align: center;
    max-width: none;
  }

  .nav__out {
    width: 100%;
  }
}
</style>
