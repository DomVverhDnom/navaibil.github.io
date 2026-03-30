<script setup>
import { ref, computed, onMounted } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { api, parseJson } from '../lib/api'
import { mediaUrl } from '../lib/mediaUrl'

const router = useRouter()
const conversations = ref([])
const loading = ref(true)
const err = ref('')
const searchQ = ref('')
const searchBusy = ref(false)
const searchResults = ref([])

const convCount = computed(() => conversations.value.length)

async function load() {
  loading.value = true
  err.value = ''
  try {
    const res = await api('/api/dm/conversations')
    const data = await parseJson(res)
    if (!res.ok) {
      err.value = data?.error || 'Не удалось загрузить'
      conversations.value = []
      return
    }
    conversations.value = data.conversations || []
  } finally {
    loading.value = false
  }
}

async function runSearch() {
  const q = searchQ.value.trim()
  if (q.length < 2) {
    searchResults.value = []
    return
  }
  searchBusy.value = true
  try {
    const res = await api(`/api/users/search?q=${encodeURIComponent(q)}`)
    const data = await parseJson(res)
    searchResults.value = res.ok ? data.users || [] : []
  } finally {
    searchBusy.value = false
  }
}

function openUserProfile(userId) {
  router.push(`/users/${userId}`)
}

function openThread(userId) {
  router.push(`/messages/${userId}`)
}

function convPreview(m) {
  if (!m) return ''
  const text = String(m.content || '').trim()
  if (m.imageUrl) {
    if (!text) return 'Фото'
    return text.length > 100 ? `${text.slice(0, 97)}…` : text
  }
  return text
}

function fmtTime(iso) {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    const now = new Date()
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    if (sameDay) {
      return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    }
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
  } catch {
    return ''
  }
}

onMounted(load)
</script>

<template>
  <div class="msg-page">
    <header class="msg-hero premium-glow">
      <div class="msg-hero__icon" aria-hidden="true">
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      </div>
      <div class="msg-hero__text">
        <h1 class="msg-hero__title">Сообщения</h1>
        <p class="msg-hero__lead">Приватные диалоги с участниками клуба.</p>
        <p v-if="convCount && !loading" class="msg-hero__stat">{{ convCount }} {{ convCount === 1 ? 'диалог' : convCount < 5 ? 'диалога' : 'диалогов' }}</p>
      </div>
    </header>

    <section class="msg-search card-inset">
      <h2 class="msg-search__h">Новый собеседник</h2>
      <p class="msg-search__hint">Поиск по имени или email — минимум 2 символа.</p>
      <div class="msg-search__row">
        <span class="msg-search__icon" aria-hidden="true">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        </span>
        <input
          v-model="searchQ"
          type="search"
          class="msg-search__inp"
          placeholder="Найти пользователя…"
          maxlength="80"
          autocomplete="off"
          @keyup.enter="runSearch"
        />
        <button type="button" class="msg-search__btn" :disabled="searchBusy" @click="runSearch">
          {{ searchBusy ? '…' : 'Найти' }}
        </button>
      </div>

      <ul v-if="searchResults.length" class="msg-hits">
        <li v-for="u in searchResults" :key="u.id" class="msg-hit">
          <div class="msg-hit__user">
            <img
              v-if="u.avatarUrl"
              class="msg-hit__av"
              :src="mediaUrl(u.avatarUrl)"
              alt=""
              width="40"
              height="40"
            />
            <div v-else class="msg-hit__av msg-hit__av--ph">{{ (u.displayName || '?').slice(0, 1) }}</div>
            <span class="msg-hit__name">{{ u.displayName }}</span>
          </div>
          <div class="msg-hit__actions">
            <button type="button" class="msg-hit__btn msg-hit__btn--primary" @click="openThread(u.id)">Написать</button>
            <button type="button" class="msg-hit__btn msg-hit__btn--ghost" @click="openUserProfile(u.id)">
              Профиль
            </button>
          </div>
        </li>
      </ul>
    </section>

    <p v-if="err" class="msg-err">{{ err }}</p>

    <template v-if="loading">
      <div class="msg-skeleton" aria-hidden="true">
        <div v-for="n in 4" :key="n" class="msg-skeleton__row" />
      </div>
      <p class="msg-loading">Загрузка…</p>
    </template>

    <section v-else-if="conversations.length" class="msg-list-wrap">
      <h2 class="msg-list-title">Недавние</h2>
      <ul class="msg-list">
        <li v-for="c in conversations" :key="c.peer.id" class="msg-conv">
          <RouterLink :to="`/messages/${c.peer.id}`" class="msg-conv__main">
            <div class="msg-conv__av-wrap">
              <img
                v-if="c.peer.avatarUrl"
                class="msg-conv__av"
                :src="mediaUrl(c.peer.avatarUrl)"
                alt=""
                width="52"
                height="52"
              />
              <div v-else class="msg-conv__av msg-conv__av--ph">{{ (c.peer.displayName || '?').slice(0, 1) }}</div>
            </div>
            <div class="msg-conv__body">
              <div class="msg-conv__top">
                <span class="msg-conv__name">{{ c.peer.displayName }}</span>
                <time v-if="c.lastMessage?.createdAt" class="msg-conv__time" :datetime="c.lastMessage.createdAt">{{
                  fmtTime(c.lastMessage.createdAt)
                }}</time>
              </div>
              <p
                v-if="c.lastMessage"
                class="msg-conv__preview"
                :class="{ 'msg-conv__preview--mine': c.lastMessage.mine }"
              >
                <span v-if="c.lastMessage.mine" class="msg-conv__you">Вы · </span>{{ convPreview(c.lastMessage) }}
              </p>
              <p v-else class="msg-conv__preview msg-conv__preview--empty">Нет сообщений</p>
            </div>
            <span class="msg-conv__chev" aria-hidden="true">→</span>
          </RouterLink>
          <RouterLink :to="`/users/${c.peer.id}`" class="msg-conv__prof" title="Профиль пользователя">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </RouterLink>
        </li>
      </ul>
    </section>

    <div v-else class="msg-empty card-inset">
      <div class="msg-empty__icon" aria-hidden="true">💬</div>
      <p class="msg-empty__title">Пока нет переписок</p>
      <p class="msg-empty__text">Найдите человека в поиске выше и нажмите «Написать».</p>
    </div>
  </div>
</template>

<style scoped>
.msg-page {
  max-width: min(100%, 680px);
  margin: 0 auto;
  padding: 24px 18px 64px;
}

.msg-hero {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px 22px;
  border-radius: var(--tg-radius-lg);
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--tg-surface) 82%, var(--tg-accent-soft)),
    var(--tg-surface)
  );
  border: 1px solid var(--tg-border);
  margin-bottom: 22px;
}

.msg-hero__icon {
  flex-shrink: 0;
  width: 52px;
  height: 52px;
  border-radius: var(--tg-radius-md);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 0;
  color: var(--tg-gold);
  background: var(--tg-accent-soft);
  border: 1px solid var(--tg-accent-line);
}

.msg-hero__icon svg {
  display: block;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
}

.msg-hero__title {
  margin: 0 0 4px;
  font-size: clamp(1.35rem, 3vw, 1.65rem);
  font-weight: 750;
  letter-spacing: -0.02em;
}

.msg-hero__lead {
  margin: 0;
  font-size: 0.88rem;
  color: var(--tg-muted);
  line-height: 1.45;
}

.msg-hero__stat {
  margin: 10px 0 0;
  font-size: 0.78rem;
  font-weight: 650;
  color: var(--tg-gold);
}

.card-inset {
  padding: 18px 18px 20px;
  border-radius: var(--tg-radius-lg);
  background: var(--tg-surface);
  border: 1px solid var(--tg-border);
  margin-bottom: 24px;
  box-shadow: 0 12px 40px -28px rgba(0, 0, 0, 0.55);
}

.msg-search__h {
  margin: 0 0 6px;
  font-size: 0.98rem;
  font-weight: 700;
}

.msg-search__hint {
  margin: 0 0 14px;
  font-size: 0.8rem;
  color: var(--tg-muted);
  line-height: 1.4;
}

.msg-search__row {
  display: flex;
  align-items: stretch;
  gap: 0;
  border-radius: var(--tg-radius-md);
  border: 1px solid var(--tg-border);
  background: var(--tg-elevated);
  overflow: hidden;
  transition: border-color 0.15s ease;
}

.msg-search__row:focus-within {
  border-color: color-mix(in srgb, var(--tg-accent) 45%, var(--tg-border));
}

.msg-search__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 12px;
  color: var(--tg-muted);
  flex-shrink: 0;
  line-height: 0;
  align-self: stretch;
}

.msg-search__icon svg {
  display: block;
  flex-shrink: 0;
}

.msg-search__inp {
  flex: 1;
  min-width: 0;
  padding: 12px 10px 12px 0;
  border: none;
  background: transparent;
  color: var(--tg-text);
  font-size: 0.95rem;
}

.msg-search__inp:focus {
  outline: none;
}

.msg-search__inp::placeholder {
  color: color-mix(in srgb, var(--tg-muted) 75%, transparent);
}

.msg-search__btn {
  flex-shrink: 0;
  padding: 0 18px;
  border: none;
  font-weight: 650;
  font-size: 0.86rem;
  cursor: pointer;
  color: var(--tg-on-accent);
  background: var(--tg-gradient-primary-strong);
}

.msg-search__btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.msg-hits {
  list-style: none;
  margin: 16px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.msg-hit {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-radius: var(--tg-radius-md);
  border: 1px solid var(--tg-border);
  background: color-mix(in srgb, var(--tg-elevated) 92%, var(--tg-surface));
}

.msg-hit__user {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.msg-hit__av {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid var(--tg-border);
  flex-shrink: 0;
}

.msg-hit__av--ph {
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 750;
  font-size: 1rem;
  color: var(--tg-gold);
  background: var(--tg-elevated);
}

.msg-hit__name {
  font-weight: 650;
  font-size: 0.95rem;
}

.msg-hit__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.msg-hit__btn {
  padding: 8px 14px;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 650;
  cursor: pointer;
  border: 1px solid transparent;
}

.msg-hit__btn--primary {
  color: var(--tg-on-accent);
  background: var(--tg-gradient-primary);
  border-color: transparent;
}

.msg-hit__btn--ghost {
  color: var(--tg-muted);
  background: transparent;
  border-color: var(--tg-border);
}

.msg-hit__btn--ghost:hover {
  color: var(--tg-text);
  border-color: color-mix(in srgb, var(--tg-accent) 30%, var(--tg-border));
}

.msg-err {
  color: #ff8a80;
  font-size: 0.9rem;
  margin: 0 0 14px;
}

.msg-loading {
  text-align: center;
  color: var(--tg-muted);
  font-size: 0.88rem;
  margin: 8px 0 0;
}

.msg-skeleton {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 8px;
}

.msg-skeleton__row {
  height: 72px;
  border-radius: var(--tg-radius-lg);
  background: linear-gradient(
    90deg,
    var(--tg-elevated) 0%,
    color-mix(in srgb, var(--tg-border) 35%, var(--tg-elevated)) 50%,
    var(--tg-elevated) 100%
  );
  background-size: 200% 100%;
  animation: msg-shimmer 1.2s ease-in-out infinite;
}

@keyframes msg-shimmer {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: -100% 0;
  }
}

.msg-list-wrap {
  margin-top: 4px;
}

.msg-list-title {
  margin: 0 0 12px;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--tg-muted);
}

.msg-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.msg-conv {
  display: flex;
  align-items: stretch;
  gap: 0;
  border-radius: var(--tg-radius-lg);
  border: 1px solid var(--tg-border);
  background: var(--tg-surface);
  overflow: hidden;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}

.msg-conv:hover {
  border-color: color-mix(in srgb, var(--tg-accent) 28%, var(--tg-border));
  box-shadow: 0 10px 36px -20px var(--tg-glow);
}

.msg-conv__main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 12px 14px 16px;
  color: inherit;
  text-decoration: none;
}

.msg-conv__av-wrap {
  flex-shrink: 0;
}

.msg-conv__av {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid var(--tg-border);
  box-shadow: 0 4px 16px -6px rgba(0, 0, 0, 0.45);
}

.msg-conv__av--ph {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  font-weight: 750;
  color: var(--tg-gold);
  background: var(--tg-elevated);
}

.msg-conv__body {
  flex: 1;
  min-width: 0;
}

.msg-conv__top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 4px;
}

.msg-conv__name {
  font-weight: 650;
  font-size: 1rem;
}

.msg-conv__time {
  flex-shrink: 0;
  font-size: 0.75rem;
  color: var(--tg-muted);
  font-variant-numeric: tabular-nums;
}

.msg-conv__preview {
  margin: 0;
  font-size: 0.84rem;
  color: var(--tg-muted);
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.msg-conv__preview--mine {
  color: color-mix(in srgb, var(--tg-gold) 85%, var(--tg-muted));
}

.msg-conv__preview--empty {
  font-style: italic;
  opacity: 0.85;
}

.msg-conv__you {
  font-weight: 600;
}

.msg-conv__chev {
  flex-shrink: 0;
  color: var(--tg-muted);
  font-size: 1rem;
  opacity: 0.5;
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}

.msg-conv:hover .msg-conv__chev {
  opacity: 0.9;
  color: var(--tg-gold);
  transform: translateX(3px);
}

.msg-conv__prof {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  border: none;
  border-left: 1px solid var(--tg-border);
  background: color-mix(in srgb, var(--tg-elevated) 40%, transparent);
  color: var(--tg-muted);
  text-decoration: none;
  transition:
    color 0.15s ease,
    background 0.15s ease;
}

.msg-conv__prof:hover {
  color: var(--tg-gold);
  background: var(--tg-accent-soft);
}

.msg-conv__prof svg {
  display: block;
  flex-shrink: 0;
}

.msg-empty {
  text-align: center;
  padding: 36px 24px;
}

.msg-empty__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 14px;
  font-size: 2.25rem;
  line-height: 0;
  filter: grayscale(0.2);
}

.msg-empty__title {
  margin: 0 0 8px;
  font-weight: 700;
  font-size: 1.05rem;
}

.msg-empty__text {
  margin: 0;
  font-size: 0.88rem;
  color: var(--tg-muted);
  line-height: 1.5;
  max-width: 280px;
  margin-left: auto;
  margin-right: auto;
}
</style>
