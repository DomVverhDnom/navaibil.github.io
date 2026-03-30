<script setup>
import { RouterView } from 'vue-router'
import AppNav from './components/AppNav.vue'
</script>

<template>
  <AppNav />
  <main class="main">
    <RouterView v-slot="{ Component }">
      <Transition name="fade-page" mode="out-in">
        <component :is="Component" />
      </Transition>
    </RouterView>
  </main>
  <footer class="footer">
    <p>
      PrivateCommunity — закрытые каналы с лентой и чатом. Администраторы каналов управляют участниками и модерируют обсуждения;
      техническая админка сайта доступна только роли «админ».
    </p>
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
