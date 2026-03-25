<script setup>
import { ref, onMounted } from 'vue'
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

function openThread(userId) {
  router.push(`/messages/${userId}`)
}

onMounted(load)
</script>

<template>
  <div class="page">
    <h1 class="title">Личные сообщения</h1>
    <p class="lead">Переписка только между зарегистрированными пользователями.</p>

    <section class="search card">
      <h2 class="h2">Новый диалог</h2>
      <div class="search-row">
        <input
          v-model="searchQ"
          type="search"
          class="inp"
          placeholder="Имя или email (от 2 символов)"
          maxlength="80"
          @keyup.enter="runSearch"
        />
        <button type="button" class="btn" :disabled="searchBusy" @click="runSearch">Найти</button>
      </div>
      <ul v-if="searchResults.length" class="hits">
        <li v-for="u in searchResults" :key="u.id">
          <button type="button" class="hit" @click="openThread(u.id)">
            <img
              v-if="u.avatarUrl"
              class="av"
              :src="mediaUrl(u.avatarUrl)"
              alt=""
              width="36"
              height="36"
            />
            <div v-else class="av av--ph" aria-hidden="true" />
            <span class="name">{{ u.displayName }}</span>
          </button>
        </li>
      </ul>
    </section>

    <p v-if="err" class="err">{{ err }}</p>
    <p v-if="loading" class="muted">Загрузка…</p>

    <ul v-else-if="conversations.length" class="list">
      <li v-for="c in conversations" :key="c.peer.id">
        <RouterLink :to="`/messages/${c.peer.id}`" class="row">
          <img
            v-if="c.peer.avatarUrl"
            class="av"
            :src="mediaUrl(c.peer.avatarUrl)"
            alt=""
            width="44"
            height="44"
          />
          <div v-else class="av av--ph" aria-hidden="true" />
          <div class="meta">
            <span class="name">{{ c.peer.displayName }}</span>
            <span v-if="c.lastMessage" class="preview" :class="{ 'preview--mine': c.lastMessage.mine }">
              {{ c.lastMessage.mine ? 'Вы: ' : '' }}{{ c.lastMessage.content }}
            </span>
          </div>
        </RouterLink>
      </li>
    </ul>
    <p v-else class="empty">Пока нет переписок. Найдите пользователя выше.</p>
  </div>
</template>

<style scoped>
.page {
  max-width: var(--layout-max);
  margin: 0 auto;
  padding: 28px 20px 56px;
}

.title {
  margin: 0 0 8px;
  font-size: 1.5rem;
  font-weight: 700;
}

.lead {
  margin: 0 0 22px;
  color: var(--tg-muted);
  font-size: 0.92rem;
}

.card {
  padding: 18px;
  border-radius: var(--tg-radius-lg);
  border: 1px solid var(--tg-border);
  background: var(--tg-surface);
  margin-bottom: 22px;
}

.h2 {
  margin: 0 0 12px;
  font-size: 1rem;
  font-weight: 600;
}

.search-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.inp {
  flex: 1;
  min-width: 200px;
  padding: 10px 12px;
  border-radius: var(--tg-radius-sm);
  border: 1px solid var(--tg-border);
  background: var(--tg-elevated);
  color: var(--tg-text);
  font-size: 0.95rem;
}

.btn {
  padding: 10px 16px;
  border-radius: var(--tg-radius-sm);
  border: none;
  font-weight: 600;
  cursor: pointer;
  color: var(--tg-on-accent);
  background: var(--tg-gradient-primary);
}

.hits {
  list-style: none;
  margin: 14px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.hit {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px 12px;
  border-radius: var(--tg-radius-md);
  border: 1px solid var(--tg-border);
  background: var(--tg-elevated);
  color: var(--tg-text);
  cursor: pointer;
  text-align: left;
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border-radius: var(--tg-radius-lg);
  border: 1px solid var(--tg-border);
  background: var(--tg-surface);
  color: inherit;
  text-decoration: none;
  transition: border-color 0.15s;
}

.row:hover {
  border-color: color-mix(in srgb, var(--tg-accent) 30%, var(--tg-border));
}

.av {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid var(--tg-border);
  flex-shrink: 0;
}

.hit .av {
  width: 36px;
  height: 36px;
}

.av--ph {
  background: var(--tg-elevated);
}

.meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.name {
  font-weight: 600;
}

.preview {
  font-size: 0.85rem;
  color: var(--tg-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.preview--mine {
  color: var(--tg-gold);
}

.err {
  color: #ff8a80;
  font-size: 0.9rem;
}

.muted {
  color: var(--tg-muted);
}

.empty {
  color: var(--tg-muted);
  font-size: 0.92rem;
  padding: 24px;
  text-align: center;
  border: 1px dashed var(--tg-border);
  border-radius: var(--tg-radius-lg);
}
</style>
