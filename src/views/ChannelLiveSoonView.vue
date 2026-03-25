<script setup>
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import CommunityGate from '../components/CommunityGate.vue'

const route = useRoute()
const channelKey = computed(() => String(route.params.channelKey || '').trim())
</script>

<template>
  <div class="page">
    <CommunityGate>
      <RouterLink :to="`/channels/${encodeURIComponent(channelKey)}/feed`" class="back">← К ленте</RouterLink>
      <div class="card">
        <span class="badge">Скоро</span>
        <h1 class="title">Прямые эфиры</h1>
        <p class="lead">
          Раздел временно отключён. Мы готовим обновлённый сценарий трансляций — следите за новостями канала.
        </p>
        <p class="muted">Переход по ссылкам «Прямой эфир» в ленте и чате сейчас не открывает плеер: показывается только эта
          плашка.</p>
      </div>
    </CommunityGate>
  </div>
</template>

<style scoped>
.page {
  max-width: var(--layout-max);
  margin: 0 auto;
  padding: 28px 20px 56px;
}

.back {
  display: inline-block;
  margin-bottom: 16px;
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--tg-gold);
}

.card {
  padding: 28px 24px;
  border-radius: var(--tg-radius-lg);
  border: 1px solid var(--tg-border);
  background: var(--tg-surface);
  max-width: 520px;
}

.badge {
  display: inline-block;
  margin-bottom: 12px;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--tg-on-accent);
  background: var(--tg-gradient-primary-strong);
}

.title {
  margin: 0 0 10px;
  font-size: 1.45rem;
  font-weight: 700;
}

.lead {
  margin: 0 0 14px;
  font-size: 0.95rem;
  line-height: 1.55;
  color: var(--tg-text);
}

.muted {
  margin: 0;
  font-size: 0.85rem;
  color: var(--tg-muted);
  line-height: 1.5;
}
</style>
