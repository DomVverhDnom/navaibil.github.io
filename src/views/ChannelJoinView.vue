<script setup>
import { ref, onMounted, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import { api, parseJson } from '../lib/api'

const { refreshMe } = useAuth()

const joinSlug = ref('')
const joinPreview = ref(null)
const showJoinModal = ref(false)
const err = ref('')
const ok = ref('')
const busy = ref(false)

onMounted(() => {
  refreshMe()
})

function fmtRub(n) {
  const x = Number(n) || 0
  return `${new Intl.NumberFormat('ru-RU').format(x)} ₽`
}

async function openJoinModal() {
  err.value = ''
  ok.value = ''
  const slug = joinSlug.value.trim().toLowerCase()
  if (!slug) {
    err.value = 'Введите адрес канала (slug)'
    return
  }
  busy.value = true
  joinPreview.value = null
  try {
    const res = await api(`/api/channels/lookup?slug=${encodeURIComponent(slug)}`)
    const data = await parseJson(res)
    if (!res.ok) throw new Error(data?.error || 'Канал не найден')
    joinPreview.value = data
    showJoinModal.value = true
  } catch (e) {
    err.value = e.message || 'Ошибка'
  } finally {
    busy.value = false
  }
}

function closeJoinModal() {
  showJoinModal.value = false
}

async function confirmJoin() {
  const slug = joinPreview.value?.channel?.slug
  if (!slug) return
  err.value = ''
  ok.value = ''
  busy.value = true
  try {
    const res = await api('/api/channels/join', { method: 'POST', body: { slug } })
    const data = await parseJson(res)
    if (!res.ok) throw new Error(data?.error || 'Не удалось вступить')
    showJoinModal.value = false
    joinSlug.value = ''
    joinPreview.value = null
    ok.value = 'Вы добавлены в канал. При необходимости оформите доступ на странице канала.'
    await refreshMe()
  } catch (e) {
    err.value = e.message || 'Ошибка'
  } finally {
    busy.value = false
  }
}

watch(showJoinModal, (open) => {
  if (typeof document === 'undefined') return
  document.body.style.overflow = open ? 'hidden' : ''
})
</script>

<template>
  <div class="page">
    <nav class="breadcrumbs">
      <RouterLink to="/channels" class="breadcrumbs__link">← Мои каналы</RouterLink>
    </nav>

    <header class="head">
      <h1 class="title">Вступить в канал</h1>
      <p class="lead">
        Укажите короткий адрес (slug), который вам передал автор канала. Мы покажем название и условия перед
        подтверждением.
      </p>
    </header>

    <p v-if="ok" class="banner banner--ok">{{ ok }}</p>
    <p v-if="err" class="banner banner--err">{{ err }}</p>

    <section class="card premium-glow">
      <label class="field">
        <span>Slug канала</span>
        <input
          v-model="joinSlug"
          type="text"
          maxlength="50"
          placeholder="например: authors-club"
          autocomplete="off"
          @keydown.enter.prevent="openJoinModal"
        />
      </label>
      <p class="hint">Это часть ссылки: <code>/channels/<strong>slug</strong>/feed</code></p>
      <div class="actions">
        <RouterLink to="/channels/create" class="btn btn--ghost">Создать свой канал</RouterLink>
        <button type="button" class="btn btn--primary" :disabled="busy" @click="openJoinModal">
          {{ busy ? 'Проверка…' : 'Найти канал' }}
        </button>
      </div>
    </section>

    <Teleport to="body">
      <div v-if="showJoinModal && joinPreview" class="modal" role="dialog" aria-modal="true" @click.self="closeJoinModal">
        <div class="modal__card">
          <button type="button" class="modal__close" aria-label="Закрыть" @click="closeJoinModal">×</button>
          <h3 class="modal__title">{{ joinPreview.channel.name }}</h3>
          <p class="modal__slug">/{{ joinPreview.channel.slug }}</p>
          <div v-if="joinPreview.channel.description" class="modal__desc">
            {{ joinPreview.channel.description }}
          </div>
          <p v-else class="modal__muted">Описание пока не заполнено.</p>
          <ul class="modal__prices">
            <li v-if="joinPreview.channel.priceMonth === 0 && joinPreview.channel.priceYear === 0">
              Условия: бесплатный доступ по подписке
            </li>
            <template v-else>
              <li v-if="joinPreview.channel.priceMonth > 0">Месяц: {{ fmtRub(joinPreview.channel.priceMonth) }}</li>
              <li v-if="joinPreview.channel.priceYear > 0">Год: {{ fmtRub(joinPreview.channel.priceYear) }}</li>
            </template>
          </ul>
          <template v-if="joinPreview.alreadyMember">
            <p class="modal__ok">Вы уже в этом канале.</p>
            <div class="modal__actions">
              <RouterLink
                class="btn btn--primary"
                :to="`/channels/${encodeURIComponent(joinPreview.channel.slug)}/feed`"
                @click="closeJoinModal"
              >
                Открыть ленту
              </RouterLink>
              <button type="button" class="btn btn--ghost" @click="closeJoinModal">Закрыть</button>
            </div>
          </template>
          <template v-else>
            <p class="modal__fine">После вступления канал появится в списке «Мои каналы».</p>
            <div class="modal__actions">
              <button type="button" class="btn btn--ghost" @click="closeJoinModal">Отмена</button>
              <button type="button" class="btn" :disabled="busy" @click="confirmJoin">Вступить</button>
            </div>
          </template>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.page {
  max-width: 560px;
  margin: 0 auto;
  padding: 24px 20px 56px;
}

.breadcrumbs {
  margin-bottom: 18px;
}

.breadcrumbs__link {
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--tg-gold);
}

.head {
  margin-bottom: 20px;
}

.title {
  margin: 0 0 8px;
  font-size: 1.65rem;
  font-weight: 700;
}

.lead {
  margin: 0;
  color: var(--tg-muted);
  font-size: 0.94rem;
  line-height: 1.55;
}

.banner {
  padding: 12px 16px;
  border-radius: var(--tg-radius-md);
  margin-bottom: 16px;
  font-size: 0.9rem;
}

.banner--ok {
  background: color-mix(in srgb, #a5d6a7 14%, transparent);
  border: 1px solid color-mix(in srgb, #a5d6a7 35%, var(--tg-border));
  color: #c8e6c9;
}

.banner--err {
  background: color-mix(in srgb, #ff8a80 12%, transparent);
  border: 1px solid color-mix(in srgb, #ff8a80 35%, var(--tg-border));
  color: #ffccbc;
}

.card {
  padding: 22px 20px;
  border-radius: var(--tg-radius-lg);
  background: var(--tg-surface);
  border: 1px solid var(--tg-border);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
  font-size: 0.82rem;
  color: var(--tg-muted);
}

.field input {
  padding: 12px 14px;
  border-radius: var(--tg-radius-sm);
  border: 1px solid var(--tg-border);
  background: var(--tg-elevated);
  color: var(--tg-text);
  font-family: inherit;
  font-size: 0.95rem;
}

.hint {
  margin: 0 0 18px;
  font-size: 0.8rem;
  color: var(--tg-muted);
  line-height: 1.45;
}

.hint code {
  font-size: 0.88em;
  padding: 2px 6px;
  border-radius: 6px;
  background: var(--tg-elevated);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
  align-items: center;
}

.btn {
  padding: 12px 18px;
  border-radius: var(--tg-radius-md);
  font-weight: 600;
  font-size: 0.9rem;
  border: none;
  cursor: pointer;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.btn--primary {
  color: var(--tg-on-accent);
  background: var(--tg-gradient-primary-strong);
}

.btn--primary:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.btn--ghost {
  color: var(--tg-text);
  background: var(--tg-elevated);
  border: 1px solid var(--tg-border);
}

.modal {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(6px);
}

.modal__card {
  position: relative;
  width: 100%;
  max-width: 440px;
  max-height: min(90vh, 560px);
  overflow-y: auto;
  padding: 24px 22px 20px;
  border-radius: var(--tg-radius-lg);
  background: var(--tg-surface);
  border: 1px solid var(--tg-border);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.45);
}

.modal__close {
  position: absolute;
  top: 10px;
  right: 12px;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: var(--tg-radius-sm);
  background: transparent;
  color: var(--tg-muted);
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
}

.modal__title {
  margin: 0 28px 4px 0;
  font-size: 1.2rem;
  font-weight: 700;
}

.modal__slug {
  margin: 0 0 14px;
  font-size: 0.85rem;
  color: var(--tg-muted);
}

.modal__desc {
  margin: 0 0 14px;
  font-size: 0.9rem;
  line-height: 1.55;
  white-space: pre-wrap;
}

.modal__muted {
  margin: 0 0 14px;
  font-size: 0.88rem;
  color: var(--tg-muted);
}

.modal__prices {
  margin: 0 0 16px;
  padding-left: 18px;
  font-size: 0.9rem;
  color: var(--tg-gold);
  line-height: 1.5;
}

.modal__fine {
  margin: 0 0 14px;
  font-size: 0.78rem;
  color: var(--tg-muted);
  line-height: 1.45;
}

.modal__ok {
  margin: 0 0 14px;
  font-size: 0.9rem;
  color: #a5d6a7;
}

.modal__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
}

.modal__actions .btn--primary,
.modal__actions .btn:not(.btn--ghost) {
  color: var(--tg-on-accent);
  background: var(--tg-gradient-primary-strong);
}
</style>
