<script setup>
import { ref, onMounted, computed } from 'vue'
import { api, parseJson, oauthStartUrl } from '../lib/api'

const ITEMS = [
  { id: 'google', label: 'Google' },
  { id: 'vk', label: 'VK' },
  { id: 'yandex', label: 'Яндекс' },
]

const prov = ref({ google: false, vk: false, yandex: false })
const ready = ref(false)

const anyEnabled = computed(() => prov.value.google || prov.value.vk || prov.value.yandex)

function envHint(id) {
  const m = {
    google: 'Добавьте в .env: GOOGLE_CLIENT_ID и GOOGLE_CLIENT_SECRET (redirect в консоли Google).',
    vk: 'Добавьте в .env: VK_CLIENT_ID и VK_CLIENT_SECRET (redirect в кабинете VK).',
    yandex: 'Добавьте в .env: YANDEX_CLIENT_ID и YANDEX_CLIENT_SECRET (callback в Яндекс OAuth).',
  }
  return m[id] || ''
}

onMounted(async () => {
  try {
    const r = await api('/api/auth/oauth/providers')
    const d = await parseJson(r)
    if (r.ok && d) {
      prov.value = {
        google: !!d.google,
        vk: !!d.vk,
        yandex: !!d.yandex,
      }
    }
  } finally {
    ready.value = true
  }
})
</script>

<template>
  <div class="oauth">
    <p class="oauth__or">или через</p>
    <div class="oauth__row">
      <template v-for="p in ITEMS" :key="p.id">
        <a
          v-if="ready && prov[p.id]"
          :href="oauthStartUrl(p.id)"
          class="oauth__btn"
          :class="`oauth__btn--${p.id}`"
        >
          {{ p.label }}
        </a>
        <span
          v-else
          class="oauth__btn oauth__btn--off"
          :class="[`oauth__btn--${p.id}`, { 'oauth__btn--pending': !ready }]"
          :title="ready ? envHint(p.id) : 'Проверка настроек…'"
        >
          {{ p.label }}
        </span>
      </template>
    </div>
    <p v-if="ready && !anyEnabled" class="oauth__hint oauth__hint--muted">
      Кнопки неактивны, пока в <code class="oauth__code">.env</code> не заданы ключи провайдеров. См.
      <code class="oauth__code">.env.example</code>.
    </p>
    <p v-else-if="ready && anyEnabled" class="oauth__hint">
      Неактивные (серые) — для этого сервиса не заданы CLIENT_ID / SECRET.
    </p>
  </div>
</template>

<style scoped>
.oauth {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid var(--tg-border);
}

.oauth__or {
  margin: 0 0 12px;
  font-size: 0.82rem;
  color: var(--tg-muted);
  text-align: center;
}

.oauth__row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
}

.oauth__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 108px;
  padding: 10px 14px;
  border-radius: var(--tg-radius-sm);
  font-size: 0.88rem;
  font-weight: 600;
  border: 1px solid var(--tg-border);
  background: var(--tg-elevated);
  color: var(--tg-text);
  text-decoration: none;
  transition:
    border-color 0.15s,
    background 0.15s,
    opacity 0.15s;
}

a.oauth__btn:hover {
  border-color: color-mix(in srgb, var(--tg-accent) 40%, var(--tg-border));
}

.oauth__btn--google:not(.oauth__btn--off):hover {
  border-color: color-mix(in srgb, #ea4335 35%, var(--tg-border));
}

.oauth__btn--vk:not(.oauth__btn--off):hover {
  border-color: color-mix(in srgb, #2787f5 40%, var(--tg-border));
}

.oauth__btn--yandex:not(.oauth__btn--off):hover {
  border-color: color-mix(in srgb, #fc3f1d 35%, var(--tg-border));
}

.oauth__btn--off {
  cursor: not-allowed;
  opacity: 0.5;
  border-style: dashed;
}

.oauth__btn--pending {
  opacity: 0.65;
}

.oauth__hint {
  margin: 14px 0 0;
  font-size: 0.72rem;
  color: var(--tg-muted);
  text-align: center;
  line-height: 1.45;
}

.oauth__hint--muted {
  opacity: 0.95;
}

.oauth__code {
  font-size: 0.68rem;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--tg-elevated);
  border: 1px solid var(--tg-border);
}
</style>
