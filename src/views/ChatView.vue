<script setup>
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import CommunityGate from '../components/CommunityGate.vue'
import CommunityChat from '../components/CommunityChat.vue'

const route = useRoute()
const channelKey = computed(() => String(route.params.channelKey || '').trim())
</script>

<template>
  <div class="page">
    <CommunityGate>
      <header class="head">
        <RouterLink :to="`/channels/${encodeURIComponent(channelKey)}/feed`" class="head__link">
          ← К ленте постов
        </RouterLink>
        <span class="head__live-soon" title="Прямые эфиры скоро">Прямой эфир · скоро</span>
      </header>
      <CommunityChat v-if="channelKey" :channel-key="channelKey" full-page />
    </CommunityGate>
  </div>
</template>

<style scoped>
.page {
  max-width: min(100%, 1360px);
  margin: 0 auto;
  padding: 28px 24px 56px;
}

.head {
  margin-bottom: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
}

.head__title {
  margin: 0 0 6px;
  font-size: 1.6rem;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.head__subtitle {
  margin: 0 0 10px;
  font-size: 0.9rem;
  color: var(--tg-muted);
}

.head__link {
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--tg-gold);
}

.head__live-soon {
  display: inline-flex;
  align-items: center;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--tg-muted);
  background: color-mix(in srgb, var(--tg-border) 55%, transparent);
  border: 1px solid var(--tg-border);
  cursor: default;
  user-select: none;
}
</style>
