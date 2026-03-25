<script setup>
import { RouterView } from 'vue-router'
import AppNav from './components/AppNav.vue'
</script>

<template>
  <AppNav />
  <main class="main">
    <RouterView />
  </main>
  <footer class="footer">
    <p>Роли: пользователь / модератор / админ. Посты — только модераторы и админы. ADMIN_EMAILS в .env для назначения админов.</p>
  </footer>
</template>

<style scoped>
.main {
  flex: 1;
  width: 100%;
  max-width: var(--layout-max);
  margin: 0 auto;
  box-sizing: border-box;
}

.footer {
  padding: 24px 20px 32px;
  text-align: center;
  color: var(--tg-muted);
  font-size: 0.8rem;
  border-top: 1px solid var(--tg-border);
}
</style>
