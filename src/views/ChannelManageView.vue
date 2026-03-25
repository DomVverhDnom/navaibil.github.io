<script setup>
import { ref, watch, computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import { api, apiForm, parseJson } from '../lib/api'
import { mediaUrl } from '../lib/mediaUrl'

const route = useRoute()
const { refreshMe, currentChannel, isAdmin: isSiteAdmin } = useAuth()

const channelKey = computed(() => String(route.params.channelKey || '').trim())
const members = ref([])
const err = ref('')
const busy = ref(false)
const bannerInput = ref(null)
const bannerMsg = ref('')
const descDraft = ref('')
const socialRows = ref([{ label: '', url: '' }])
const settingsMsg = ref('')
const settingsErr = ref('')

const isOwner = computed(() => currentChannel.value?.myRole === 'owner' || isSiteAdmin.value)
const canManageRoles = computed(() => {
  const r = currentChannel.value?.myRole
  return r === 'owner' || r === 'admin' || isSiteAdmin.value
})

const bannerPreview = computed(() => currentChannel.value?.bannerPath || null)

async function load() {
  const k = channelKey.value
  if (!k) return
  err.value = ''
  const res = await api(`/api/channels/${encodeURIComponent(k)}/members`)
  const data = await parseJson(res)
  if (!res.ok) {
    err.value = data?.error || 'Нет доступа'
    members.value = []
    return
  }
  members.value = data.members || []
}

watch(channelKey, load, { immediate: true })

function channelMatchesRoute(c) {
  if (!c) return false
  const k = channelKey.value
  return c.slug === k || String(c.id) === k
}

watch(
  [channelKey, currentChannel],
  () => {
    const c = currentChannel.value
    if (!channelMatchesRoute(c)) return
    descDraft.value = c.description || ''
    const links = c.socialLinks || []
    socialRows.value = links.length
      ? links.map((x) => ({ label: x.label || '', url: x.url || '' }))
      : [{ label: '', url: '' }]
  },
  { immediate: true, deep: true }
)

function addSocialRow() {
  if (socialRows.value.length >= 12) return
  socialRows.value = [...socialRows.value, { label: '', url: '' }]
}

function removeSocialRow(i) {
  if (socialRows.value.length <= 1) {
    socialRows.value = [{ label: '', url: '' }]
    return
  }
  socialRows.value = socialRows.value.filter((_, idx) => idx !== i)
}

async function saveChannelInfo() {
  const k = channelKey.value
  if (!k) return
  settingsMsg.value = ''
  settingsErr.value = ''
  busy.value = true
  try {
    const links = socialRows.value
      .map((r) => ({ label: String(r.label || '').trim(), url: String(r.url || '').trim() }))
      .filter((r) => r.url)
    const res = await api(`/api/channels/${encodeURIComponent(k)}/settings`, {
      method: 'PATCH',
      body: { description: descDraft.value.trim(), socialLinks: links },
    })
    const data = await parseJson(res)
    if (!res.ok) throw new Error(data?.error || 'Не удалось сохранить')
    settingsMsg.value = 'Сохранено'
    await refreshMe()
  } catch (e) {
    settingsErr.value = e.message || 'Ошибка'
  } finally {
    busy.value = false
  }
}

async function uploadBanner(e) {
  const f = e.target?.files?.[0]
  if (!f) return
  const k = channelKey.value
  bannerMsg.value = ''
  err.value = ''
  busy.value = true
  try {
    const fd = new FormData()
    fd.append('banner', f)
    const res = await apiForm(`/api/channels/${encodeURIComponent(k)}/banner`, fd)
    const data = await parseJson(res)
    if (!res.ok) throw new Error(data?.error || 'Не удалось загрузить')
    bannerMsg.value = 'Шапка обновлена'
    await refreshMe()
  } catch (e) {
    err.value = e.message || 'Ошибка'
  } finally {
    busy.value = false
    if (bannerInput.value) bannerInput.value.value = ''
  }
}

async function setRole(userId, role) {
  const k = channelKey.value
  busy.value = true
  err.value = ''
  try {
    const res = await api(`/api/channels/${encodeURIComponent(k)}/members/${userId}`, {
      method: 'PATCH',
      body: { role },
    })
    const data = await parseJson(res)
    if (!res.ok) throw new Error(data?.error || 'Ошибка')
    await load()
    await refreshMe()
  } catch (e) {
    err.value = e.message || 'Ошибка'
  } finally {
    busy.value = false
  }
}

function roleRu(r) {
  if (r === 'owner') return 'Владелец'
  if (r === 'admin') return 'Админ'
  if (r === 'moderator') return 'Модератор'
  return 'Участник'
}
</script>

<template>
  <div class="page">
    <div class="top-links">
      <RouterLink :to="`/channels/${encodeURIComponent(channelKey)}/feed`" class="back">← К ленте</RouterLink>
      <RouterLink
        v-if="canManageRoles"
        :to="`/channels/${encodeURIComponent(channelKey)}/analytics`"
        class="back back--analytics"
      >
        Аналитика
      </RouterLink>
      <span v-if="isOwner" class="back back--live back--live-soon" title="Скоро">Прямой эфир · скоро</span>
    </div>
    <h1 class="title">Управление каналом</h1>

    <section v-if="isOwner" class="card">
      <h2 class="h2">Шапка канала</h2>
      <p class="lead">Изображение показывается в ленте и в чате этого канала.</p>
      <div
        class="cover-preview"
        :class="{ 'cover-preview--empty': !bannerPreview }"
        :style="bannerPreview ? { backgroundImage: `url(${mediaUrl(bannerPreview)})` } : {}"
      />
      <label class="tg-file-btn tg-file-btn--primary">
        <input
          ref="bannerInput"
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          class="tg-file-hidden"
          :disabled="busy"
          @change="uploadBanner"
        />
        <span class="tg-file-btn__icon" aria-hidden="true">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
        </span>
        Загрузить шапку
      </label>
      <p v-if="bannerMsg" class="ok">{{ bannerMsg }}</p>
    </section>

    <section v-if="isOwner" class="card">
      <h2 class="h2">О канале</h2>
      <p class="lead">Описание и ссылки показываются в шапке ленты канала.</p>
      <label class="field">
        <span class="field__lab">Описание</span>
        <textarea
          v-model="descDraft"
          class="ta tg-scroll"
          rows="5"
          maxlength="2000"
          placeholder="Коротко о канале…"
        />
      </label>
      <div class="social-head">
        <span class="field__lab">Ссылки на соцсети и сайты</span>
        <span class="muted small">до 12, с https://</span>
      </div>
      <div v-for="(row, i) in socialRows" :key="i" class="social-row">
        <input v-model="row.label" type="text" class="inp" placeholder="Подпись" maxlength="48" />
        <input v-model="row.url" type="url" class="inp inp--wide" placeholder="https://…" />
        <button type="button" class="rm" :disabled="busy" @click="removeSocialRow(i)" title="Убрать строку">
          ×
        </button>
      </div>
      <button type="button" class="btn-add" :disabled="busy || socialRows.length >= 12" @click="addSocialRow">
        + Добавить ссылку
      </button>
      <button type="button" class="btn-save" :disabled="busy" @click="saveChannelInfo">Сохранить текст и ссылки</button>
      <p v-if="settingsMsg" class="ok">{{ settingsMsg }}</p>
      <p v-if="settingsErr" class="bad">{{ settingsErr }}</p>
    </section>

    <p v-if="!canManageRoles" class="bad">Нужны права владельца или админа канала.</p>
    <template v-else>
      <p class="lead roles-lead">
        <template v-if="isOwner">Назначайте модераторов и админов канала.</template>
        <template v-else>Как админ канала вы можете менять роли участников и модераторов. Назначать админов может только
          владелец.</template>
      </p>
      <p v-if="err" class="bad">{{ err }}</p>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Участник</th>
              <th>Роль</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in members" :key="m.id">
              <td>
                <div class="usercell">
                  <img
                    v-if="m.avatarUrl"
                    class="usercell__avatar"
                    :src="mediaUrl(m.avatarUrl)"
                    alt=""
                    width="36"
                    height="36"
                  />
                  <div v-else class="usercell__avatar usercell__avatar--ph" aria-hidden="true" />
                  <div>
                    <div class="name">{{ m.displayName }}</div>
                    <div class="email">{{ m.email }}</div>
                  </div>
                </div>
              </td>
              <td>{{ roleRu(m.role) }}</td>
              <td>
                <template v-if="m.role !== 'owner'">
                  <select
                    class="sel"
                    :disabled="busy"
                    :value="m.role"
                    @change="setRole(m.id, ($event.target).value)"
                  >
                    <option value="member">Участник</option>
                    <option value="moderator">Модератор</option>
                    <option value="admin" :disabled="!isOwner">Админ канала</option>
                  </select>
                </template>
                <span v-else class="muted">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<style scoped>
.page {
  max-width: var(--layout-max);
  margin: 0 auto;
  padding: 28px 20px 56px;
}

.top-links {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 18px;
}

.back {
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--tg-gold);
}

.back--live {
  color: var(--tg-accent);
}

.back--live-soon {
  cursor: default;
  opacity: 0.75;
  border: 1px solid var(--tg-border);
  padding: 4px 10px;
  border-radius: var(--tg-radius-sm);
  font-size: 0.85rem;
}

.back--analytics {
  color: #81c784;
}

.title {
  margin: 12px 0 8px;
  font-size: 1.5rem;
  font-weight: 700;
}

.card {
  margin-bottom: 22px;
  padding: 18px 16px;
  border-radius: var(--tg-radius-lg);
  border: 1px solid var(--tg-border);
  background: var(--tg-surface);
}

.h2 {
  margin: 0 0 8px;
  font-size: 1.05rem;
  font-weight: 600;
}

.lead {
  margin: 0 0 14px;
  color: var(--tg-muted);
  font-size: 0.9rem;
  line-height: 1.5;
}

.roles-lead {
  margin-bottom: 12px;
}

.cover-preview {
  height: 120px;
  border-radius: var(--tg-radius-md);
  margin-bottom: 12px;
  background-size: cover;
  background-position: center;
  border: 1px solid var(--tg-border);
}

.cover-preview--empty {
  background: linear-gradient(135deg, #1a2330, var(--tg-elevated));
}

.ok {
  margin: 10px 0 0;
  font-size: 0.85rem;
  color: #a5d6a7;
}

.table-wrap {
  overflow-x: auto;
  border-radius: var(--tg-radius-md);
  border: 1px solid var(--tg-border);
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;
}

th,
td {
  padding: 10px 12px;
  text-align: left;
  border-bottom: 1px solid var(--tg-border);
}

th {
  color: var(--tg-muted);
  font-weight: 600;
}

.usercell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.usercell__avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid var(--tg-border);
  flex-shrink: 0;
}

.usercell__avatar--ph {
  background: color-mix(in srgb, var(--tg-border) 45%, transparent);
}

.name {
  font-weight: 600;
}

.email {
  font-size: 0.78rem;
  color: var(--tg-muted);
}

.sel {
  padding: 6px 8px;
  border-radius: var(--tg-radius-sm);
  border: 1px solid var(--tg-border);
  background: var(--tg-elevated);
  color: var(--tg-text);
  font-family: inherit;
  font-size: 0.82rem;
}

.bad {
  color: #ff8a80;
}

.muted {
  color: var(--tg-muted);
}

.small {
  font-size: 0.8rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.field__lab {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--tg-muted);
}

.ta {
  width: 100%;
  padding: 12px 14px;
  border-radius: var(--tg-radius-sm);
  border: 1px solid var(--tg-border);
  background: var(--tg-elevated);
  color: var(--tg-text);
  font-family: inherit;
  font-size: 0.92rem;
  line-height: 1.5;
  resize: vertical;
  min-height: 100px;
  max-height: 320px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.ta:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--tg-accent) 40%, var(--tg-border));
}

.social-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px 14px;
  margin-bottom: 10px;
}

.social-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}

.inp {
  padding: 8px 10px;
  border-radius: var(--tg-radius-sm);
  border: 1px solid var(--tg-border);
  background: var(--tg-elevated);
  color: var(--tg-text);
  font-family: inherit;
  font-size: 0.88rem;
  min-width: 100px;
}

.inp--wide {
  flex: 1;
  min-width: 200px;
}

.rm {
  width: 36px;
  height: 36px;
  border-radius: var(--tg-radius-sm);
  border: 1px solid var(--tg-border);
  background: transparent;
  color: var(--tg-muted);
  font-size: 1.25rem;
  line-height: 1;
  cursor: pointer;
  flex-shrink: 0;
}

.rm:hover {
  color: var(--tg-text);
}

.btn-add {
  display: inline-block;
  margin: 4px 0 14px;
  padding: 8px 12px;
  border-radius: var(--tg-radius-sm);
  border: 1px dashed var(--tg-border);
  background: transparent;
  color: var(--tg-gold);
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}

.btn-add:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn-save {
  display: inline-block;
  padding: 10px 18px;
  border-radius: var(--tg-radius-sm);
  font-weight: 600;
  font-size: 0.88rem;
  color: var(--tg-on-accent);
  background: var(--tg-gradient-primary);
  border: none;
  cursor: pointer;
}

.btn-save:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
