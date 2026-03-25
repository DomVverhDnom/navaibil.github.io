<script setup>
import { ref, onMounted, watch } from 'vue'
import { useRouter, RouterLink } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import { api, parseJson } from '../lib/api'

const router = useRouter()
const { isStaff, isAdmin, refreshMe } = useAuth()

const users = ref([])
const loading = ref(true)
const err = ref('')
const actionErr = ref('')
const banReason = ref({})
const banDays = ref({})
const rolePick = ref({})
const search = ref('')
let searchTimer = null

const adminChannels = ref([])
const loadingCh = ref(false)
const chErr = ref('')
const blockReasonDraft = ref({})

const postIdEdit = ref('')
const postBody = ref('')
const postClearImg = ref(false)
const postIdDel = ref('')
const commentIdEdit = ref('')
const commentBody = ref('')
const commentIdDel = ref('')
const chatIdEdit = ref('')
const chatBody = ref('')
const chatIdDel = ref('')
const contentOk = ref('')

async function load() {
  if (!isStaff.value) return
  loading.value = true
  err.value = ''
  try {
    const q = search.value.trim()
    const url = q ? `/api/admin/users?q=${encodeURIComponent(q)}` : '/api/admin/users'
    const res = await api(url)
    const data = await parseJson(res)
    if (!res.ok) {
      err.value = data?.error || 'Нет доступа'
      return
    }
    users.value = data.users || []
    for (const u of users.value) {
      banReason.value[u.id] = u.banReason || ''
      banDays.value[u.id] = ''
      rolePick.value[u.id] = u.role
    }
  } finally {
    loading.value = false
  }
}

async function loadChannels() {
  if (!isAdmin.value) return
  loadingCh.value = true
  chErr.value = ''
  try {
    const res = await api('/api/admin/channels')
    const data = await parseJson(res)
    if (!res.ok) {
      chErr.value = data?.error || 'Нет доступа к списку каналов'
      adminChannels.value = []
      return
    }
    adminChannels.value = data.channels || []
  } finally {
    loadingCh.value = false
  }
}

async function setChannelBlocked(ch, blocked) {
  actionErr.value = ''
  contentOk.value = ''
  const body = { blocked }
  if (blocked) {
    body.blockedReason = String(blockReasonDraft.value[ch.id] || '').trim() || null
  }
  const res = await api(`/api/admin/channels/${ch.id}`, { method: 'PATCH', body })
  const data = await parseJson(res)
  if (!res.ok) {
    actionErr.value = data?.error || 'Ошибка канала'
    return
  }
  contentOk.value = blocked ? 'Канал заблокирован' : 'Блокировка снята'
  await loadChannels()
}

async function patchPost() {
  actionErr.value = ''
  contentOk.value = ''
  const id = Number(postIdEdit.value)
  if (!Number.isFinite(id)) {
    actionErr.value = 'Укажите ID поста'
    return
  }
  const body = {}
  if (postBody.value.trim()) body.content = postBody.value.trim()
  if (postClearImg.value) body.clearImage = true
  if (!body.content && !body.clearImage) {
    actionErr.value = 'Укажите новый текст и/или удалите изображения'
    return
  }
  const res = await api(`/api/admin/content/posts/${id}`, { method: 'PATCH', body })
  const data = await parseJson(res)
  if (!res.ok) {
    actionErr.value = data?.error || 'Ошибка'
    return
  }
  contentOk.value = 'Пост обновлён'
  postClearImg.value = false
}

async function deletePost() {
  actionErr.value = ''
  contentOk.value = ''
  const id = Number(postIdDel.value)
  if (!Number.isFinite(id)) {
    actionErr.value = 'Укажите ID поста'
    return
  }
  if (!confirm(`Удалить пост ${id}?`)) return
  const res = await api(`/api/admin/content/posts/${id}`, { method: 'DELETE' })
  const data = await parseJson(res)
  if (!res.ok) {
    actionErr.value = data?.error || 'Ошибка'
    return
  }
  contentOk.value = 'Пост удалён'
  postIdDel.value = ''
}

async function patchComment() {
  actionErr.value = ''
  contentOk.value = ''
  const id = Number(commentIdEdit.value)
  if (!Number.isFinite(id) || !commentBody.value.trim()) {
    actionErr.value = 'ID комментария и текст'
    return
  }
  const res = await api(`/api/admin/content/comments/${id}`, {
    method: 'PATCH',
    body: { content: commentBody.value.trim() },
  })
  const data = await parseJson(res)
  if (!res.ok) {
    actionErr.value = data?.error || 'Ошибка'
    return
  }
  contentOk.value = 'Комментарий обновлён'
}

async function deleteComment() {
  actionErr.value = ''
  contentOk.value = ''
  const id = Number(commentIdDel.value)
  if (!Number.isFinite(id)) {
    actionErr.value = 'Укажите ID комментария'
    return
  }
  if (!confirm(`Удалить комментарий ${id}?`)) return
  const res = await api(`/api/admin/content/comments/${id}`, { method: 'DELETE' })
  const data = await parseJson(res)
  if (!res.ok) {
    actionErr.value = data?.error || 'Ошибка'
    return
  }
  contentOk.value = 'Комментарий удалён'
  commentIdDel.value = ''
}

async function patchChat() {
  actionErr.value = ''
  contentOk.value = ''
  const id = Number(chatIdEdit.value)
  if (!Number.isFinite(id) || !chatBody.value.trim()) {
    actionErr.value = 'ID сообщения и текст'
    return
  }
  const res = await api(`/api/admin/content/chat-messages/${id}`, {
    method: 'PATCH',
    body: { content: chatBody.value.trim() },
  })
  const data = await parseJson(res)
  if (!res.ok) {
    actionErr.value = data?.error || 'Ошибка'
    return
  }
  contentOk.value = 'Сообщение в чате обновлено'
}

async function deleteChat() {
  actionErr.value = ''
  contentOk.value = ''
  const id = Number(chatIdDel.value)
  if (!Number.isFinite(id)) {
    actionErr.value = 'Укажите ID сообщения чата'
    return
  }
  if (!confirm(`Удалить сообщение чата ${id}?`)) return
  const res = await api(`/api/admin/content/chat-messages/${id}`, { method: 'DELETE' })
  const data = await parseJson(res)
  if (!res.ok) {
    actionErr.value = data?.error || 'Ошибка'
    return
  }
  contentOk.value = 'Сообщение удалено'
  chatIdDel.value = ''
}

async function setRole(userId) {
  actionErr.value = ''
  const role = rolePick.value[userId]
  const res = await api(`/api/admin/users/${userId}/role`, { method: 'PATCH', body: { role } })
  const data = await parseJson(res)
  if (!res.ok) {
    actionErr.value = data?.error || 'Ошибка'
    return
  }
  await load()
  await refreshMe()
}

async function banUser(userId) {
  actionErr.value = ''
  const days = Number(banDays.value[userId]) || 0
  const res = await api(`/api/admin/users/${userId}/ban`, {
    method: 'POST',
    body: {
      reason: banReason.value[userId] || undefined,
      days: days > 0 ? days : undefined,
    },
  })
  const data = await parseJson(res)
  if (!res.ok) {
    actionErr.value = data?.error || 'Ошибка'
    return
  }
  await load()
}

async function unbanUser(userId) {
  actionErr.value = ''
  const res = await api(`/api/admin/users/${userId}/unban`, { method: 'POST' })
  const data = await parseJson(res)
  if (!res.ok) {
    actionErr.value = data?.error || 'Ошибка'
    return
  }
  await load()
}

function fmt(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return '—'
  }
}

watch(search, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    if (isStaff.value) load()
  }, 320)
})

onMounted(() => {
  if (!isStaff.value) {
    router.replace('/')
    return
  }
  load()
  if (isAdmin.value) loadChannels()
})
</script>

<template>
  <div class="page">
    <h1 class="title">Админка</h1>
    <p class="lead">
      Модератор видит пользователей и поиск. Администратор сайта: роли, бан пользователей, блокировка каналов, правка и
      удаление постов, комментариев и сообщений чата.
    </p>

    <div class="toolbar">
      <input
        v-model="search"
        type="search"
        class="search-inp"
        placeholder="Поиск: email, имя или ID…"
        autocomplete="off"
      />
    </div>

    <p v-if="actionErr" class="err">{{ actionErr }}</p>
    <p v-if="contentOk" class="ok-msg">{{ contentOk }}</p>
    <p v-if="err" class="err">{{ err }}</p>
    <p v-if="loading" class="muted">Загрузка…</p>

    <div v-else class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Имя / email</th>
            <th>Роль</th>
            <th>Подписка до</th>
            <th>Бан</th>
            <th>Сообщения</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in users" :key="u.id">
            <td>{{ u.id }}</td>
            <td>
              <div class="name">{{ u.displayName }}</div>
              <div class="email">{{ u.email }}</div>
            </td>
            <td>
              <template v-if="isAdmin">
                <select v-model="rolePick[u.id]" class="select">
                  <option value="user">Пользователь</option>
                  <option value="moderator">Модератор</option>
                  <option value="admin">Админ</option>
                </select>
                <button type="button" class="btn btn--sm" @click="setRole(u.id)">OK</button>
              </template>
              <span v-else class="role-pill">{{ u.role }}</span>
            </td>
            <td class="muted">{{ fmt(u.subscriptionEnds) }}</td>
            <td>
              <span v-if="u.banned" class="bad">да</span>
              <span v-else class="ok">нет</span>
            </td>
            <td>
              <RouterLink :to="`/messages/${u.id}`" class="dm">Написать</RouterLink>
            </td>
            <td class="actions">
              <template v-if="isAdmin">
                <template v-if="!u.banned">
                  <input v-model="banReason[u.id]" type="text" class="inp" placeholder="Причина" />
                  <input v-model="banDays[u.id]" type="number" min="0" class="inp inp--n" placeholder="дней (0=навсегда)" />
                  <button type="button" class="btn btn--warn btn--sm" @click="banUser(u.id)">Забанить</button>
                </template>
                <button v-else type="button" class="btn btn--sm" @click="unbanUser(u.id)">Разбан</button>
              </template>
              <span v-else class="muted small">Только админ сайта</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <template v-if="isAdmin">
      <h2 class="h2">Каналы (блокировка)</h2>
      <p v-if="chErr" class="err">{{ chErr }}</p>
      <p v-if="loadingCh" class="muted">Загрузка каналов…</p>
      <div v-else class="table-wrap ch-table">
        <table class="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Канал</th>
              <th>Владелец</th>
              <th>Статус</th>
              <th>Действие</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="ch in adminChannels" :key="ch.id">
              <td>{{ ch.id }}</td>
              <td>
                <div class="name">{{ ch.name }}</div>
                <div class="email">@{{ ch.slug }}</div>
              </td>
              <td>
                <div class="name">{{ ch.ownerName }}</div>
                <div class="email">{{ ch.ownerEmail }}</div>
              </td>
              <td>
                <span v-if="ch.blocked" class="bad">заблокирован</span>
                <span v-else class="ok">активен</span>
              </td>
              <td>
                <template v-if="ch.blocked">
                  <button type="button" class="btn btn--sm" @click="setChannelBlocked(ch, false)">Разблокировать</button>
                </template>
                <template v-else>
                  <input
                    v-model="blockReasonDraft[ch.id]"
                    type="text"
                    class="inp inp--wide"
                    placeholder="Причина (необязательно)"
                  />
                  <button type="button" class="btn btn--warn btn--sm" @click="setChannelBlocked(ch, true)">
                    Заблокировать
                  </button>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 class="h2">Контент по ID</h2>
      <p class="hint">ID берите из БД или из ответов API. Удаление поста удаляет комментарии и реакции.</p>

      <div class="mod-grid">
        <div class="mod-card">
          <h3 class="h3">Пост</h3>
          <label class="lbl">ID поста <input v-model="postIdEdit" type="number" class="inp inp--wide" /></label>
          <label class="lbl">Новый текст <textarea v-model="postBody" class="ta" rows="3" placeholder="Оставьте пустым, если только фото…" /></label>
          <label class="chk"><input v-model="postClearImg" type="checkbox" /> Удалить все изображения поста</label>
          <button type="button" class="btn btn--sm" @click="patchPost">Сохранить пост</button>
          <hr class="hr" />
          <label class="lbl">Удалить пост ID <input v-model="postIdDel" type="number" class="inp inp--wide" /></label>
          <button type="button" class="btn btn--warn btn--sm" @click="deletePost">Удалить пост</button>
        </div>
        <div class="mod-card">
          <h3 class="h3">Комментарий к посту</h3>
          <label class="lbl">ID <input v-model="commentIdEdit" type="number" class="inp inp--wide" /></label>
          <label class="lbl">Текст <textarea v-model="commentBody" class="ta" rows="3" /></label>
          <button type="button" class="btn btn--sm" @click="patchComment">Сохранить</button>
          <hr class="hr" />
          <label class="lbl">Удалить ID <input v-model="commentIdDel" type="number" class="inp inp--wide" /></label>
          <button type="button" class="btn btn--warn btn--sm" @click="deleteComment">Удалить</button>
        </div>
        <div class="mod-card">
          <h3 class="h3">Сообщение в чате канала</h3>
          <label class="lbl">ID <input v-model="chatIdEdit" type="number" class="inp inp--wide" /></label>
          <label class="lbl">Текст <textarea v-model="chatBody" class="ta" rows="3" /></label>
          <button type="button" class="btn btn--sm" @click="patchChat">Сохранить</button>
          <hr class="hr" />
          <label class="lbl">Удалить ID <input v-model="chatIdDel" type="number" class="inp inp--wide" /></label>
          <button type="button" class="btn btn--warn btn--sm" @click="deleteChat">Удалить</button>
        </div>
      </div>
    </template>

    <p class="fine">
      Назначьте первого админа через переменную <code>ADMIN_EMAILS</code> в <code>.env</code> (email через запятую) и перезапустите API.
    </p>
  </div>
</template>

<style scoped>
.page {
  max-width: var(--layout-max);
  margin: 0 auto;
  padding: 28px 16px 56px;
}

.title {
  margin: 0 0 8px;
  font-size: 1.6rem;
  font-weight: 700;
}

.lead {
  margin: 0 0 20px;
  color: var(--tg-muted);
  font-size: 0.92rem;
  line-height: 1.5;
}

.toolbar {
  margin-bottom: 16px;
}

.search-inp {
  width: 100%;
  max-width: 420px;
  padding: 10px 14px;
  border-radius: var(--tg-radius-sm);
  border: 1px solid var(--tg-border);
  background: var(--tg-elevated);
  color: var(--tg-text);
  font-size: 0.92rem;
}

.dm {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--tg-gold);
}

.err {
  color: #ff8a80;
  font-size: 0.9rem;
}

.ok-msg {
  color: #a5d6a7;
  font-size: 0.9rem;
}

.h2 {
  margin: 32px 0 12px;
  font-size: 1.15rem;
  font-weight: 600;
}

.h3 {
  margin: 0 0 10px;
  font-size: 0.95rem;
  font-weight: 600;
}

.hint {
  margin: 0 0 16px;
  font-size: 0.85rem;
  color: var(--tg-muted);
  line-height: 1.45;
}

.ch-table {
  margin-bottom: 8px;
}

.inp--wide {
  max-width: 100%;
  width: 100%;
  margin-bottom: 6px;
}

.small {
  font-size: 0.78rem;
}

.mod-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.mod-card {
  padding: 16px;
  border-radius: var(--tg-radius-md);
  border: 1px solid var(--tg-border);
  background: var(--tg-surface);
}

.lbl {
  display: block;
  font-size: 0.78rem;
  color: var(--tg-muted);
  margin-bottom: 10px;
}

.ta {
  width: 100%;
  margin-top: 6px;
  padding: 8px 10px;
  border-radius: var(--tg-radius-sm);
  border: 1px solid var(--tg-border);
  background: var(--tg-bg);
  color: var(--tg-text);
  font-family: inherit;
  font-size: 0.85rem;
  resize: vertical;
}

.chk {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.82rem;
  color: var(--tg-muted);
  margin: 8px 0 12px;
  cursor: pointer;
}

.hr {
  border: none;
  border-top: 1px solid var(--tg-border);
  margin: 14px 0;
}

.muted {
  color: var(--tg-muted);
}

.table-wrap {
  overflow-x: auto;
  border-radius: var(--tg-radius-lg);
  border: 1px solid var(--tg-border);
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

th,
td {
  padding: 10px 12px;
  text-align: left;
  border-bottom: 1px solid var(--tg-border);
  vertical-align: top;
}

th {
  color: var(--tg-muted);
  font-weight: 600;
  text-transform: uppercase;
  font-size: 0.72rem;
  letter-spacing: 0.04em;
}

.name {
  font-weight: 600;
}

.email {
  color: var(--tg-muted);
  font-size: 0.8rem;
}

.select {
  padding: 6px 8px;
  border-radius: var(--tg-radius-sm);
  border: 1px solid var(--tg-border);
  background: var(--tg-elevated);
  color: var(--tg-text);
  margin-right: 6px;
}

.inp {
  display: block;
  width: 100%;
  max-width: 160px;
  padding: 6px 8px;
  margin-bottom: 6px;
  border-radius: var(--tg-radius-sm);
  border: 1px solid var(--tg-border);
  background: var(--tg-bg);
  color: var(--tg-text);
  font-size: 0.8rem;
}

.inp--n {
  max-width: 100px;
}

.actions {
  min-width: 200px;
}

.btn {
  padding: 8px 12px;
  border-radius: var(--tg-radius-sm);
  font-weight: 600;
  font-size: 0.82rem;
  border: none;
  cursor: pointer;
  color: var(--tg-on-accent);
  background: var(--tg-gradient-primary-strong);
}

.btn--sm {
  padding: 6px 10px;
  font-size: 0.78rem;
}

.btn--warn {
  background: linear-gradient(135deg, #5dade2, #1e88e5);
  color: #fff;
}

.role-pill {
  text-transform: capitalize;
  color: var(--tg-gold);
  font-weight: 600;
}

.bad {
  color: #ff8a80;
  font-weight: 600;
}

.ok {
  color: #a5d6a7;
}

.fine {
  margin-top: 24px;
  font-size: 0.78rem;
  color: var(--tg-muted);
  line-height: 1.5;
}

.fine code {
  font-size: 0.85em;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--tg-elevated);
}
</style>
