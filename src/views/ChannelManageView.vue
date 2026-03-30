<script setup>
import { ref, watch, computed, onUnmounted } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import { api, apiForm, parseJson } from '../lib/api'
import { mediaUrl } from '../lib/mediaUrl'
import { REACTION_CATALOG } from '../lib/reactionsCatalog'

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
const reactionsMsg = ref('')
const reactionsErr = ref('')
const reactionEnabled = ref([])
const reactionQuick = ref([])
const reactionsDialogOpen = ref(false)
const draftEnabled = ref([])
const draftQuick = ref([])
const reactionsDialogErr = ref('')
const subscriptionTiersDraft = ref([])
const tiersMsg = ref('')
const tiersErr = ref('')

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

async function loadSubscriptionTiers() {
  const k = channelKey.value
  if (!k || !isOwner.value) {
    subscriptionTiersDraft.value = []
    return
  }
  const res = await api(`/api/channels/${encodeURIComponent(k)}/summary`)
  const data = await parseJson(res)
  if (res.ok && Array.isArray(data?.channel?.subscriptionTiers) && data.channel.subscriptionTiers.length) {
    subscriptionTiersDraft.value = data.channel.subscriptionTiers.map((t) => ({
      id: t.id,
      sortOrder: t.sortOrder,
      name: t.name,
      priceMonth: t.priceMonth,
      priceYear: t.priceYear,
    }))
  } else if (res.ok) {
    subscriptionTiersDraft.value = [{ sortOrder: 1, name: 'Участник', priceMonth: 0, priceYear: 0 }]
  }
}

function addTierRow() {
  if (subscriptionTiersDraft.value.length >= 8) return
  const next =
    Math.max(0, ...subscriptionTiersDraft.value.map((t) => Number(t.sortOrder) || 0)) + 1
  subscriptionTiersDraft.value = [
    ...subscriptionTiersDraft.value,
    { sortOrder: next, name: '', priceMonth: 0, priceYear: 0 },
  ]
}

function removeTierRow(i) {
  if (subscriptionTiersDraft.value.length <= 1) return
  subscriptionTiersDraft.value = subscriptionTiersDraft.value.filter((_, idx) => idx !== i)
}

async function saveSubscriptionTiers() {
  const k = channelKey.value
  if (!k) return
  tiersMsg.value = ''
  tiersErr.value = ''
  busy.value = true
  try {
    const tiers = subscriptionTiersDraft.value.map((t) => ({
      ...(t.id ? { id: t.id } : {}),
      sortOrder: Number(t.sortOrder),
      name: String(t.name || '').trim(),
      priceMonth: Number(t.priceMonth) || 0,
      priceYear: Number(t.priceYear) || 0,
    }))
    const res = await api(`/api/channels/${encodeURIComponent(k)}/subscription-tiers`, {
      method: 'PATCH',
      body: { tiers },
    })
    const data = await parseJson(res)
    if (!res.ok) throw new Error(data?.error || 'Не удалось сохранить')
    subscriptionTiersDraft.value = (data.tiers || []).map((t) => ({
      id: t.id,
      sortOrder: t.sortOrder,
      name: t.name,
      priceMonth: t.priceMonth,
      priceYear: t.priceYear,
    }))
    tiersMsg.value = 'Уровни подписки сохранены'
    await refreshMe()
  } catch (e) {
    tiersErr.value = e.message || 'Ошибка'
  } finally {
    busy.value = false
  }
}

watch(channelKey, async () => {
  await load()
  await loadSubscriptionTiers()
}, { immediate: true })

watch(isOwner, (o) => {
  if (o) loadSubscriptionTiers()
})

function channelMatchesRoute(c) {
  if (!c) return false
  const k = channelKey.value
  return c.slug === k || String(c.id) === k
}

function sortKindsByCatalog(kinds) {
  const order = REACTION_CATALOG.map((r) => r.kind)
  const set = new Set(kinds)
  return order.filter((k) => set.has(k))
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

    const en = Array.isArray(c.reactionEnabled) ? c.reactionEnabled : []
    const qu = Array.isArray(c.reactionQuick) ? c.reactionQuick : []
    reactionEnabled.value =
      en.length > 0 ? sortKindsByCatalog(en) : REACTION_CATALOG.map((r) => r.kind)
    reactionQuick.value =
      qu.length > 0 ? sortKindsByCatalog(qu) : REACTION_CATALOG.slice(0, 5).map((r) => r.kind)
  },
  { immediate: true, deep: true }
)

function emojiForKind(kind) {
  return REACTION_CATALOG.find((r) => r.kind === kind)?.emoji ?? '·'
}

function escapeCloseReactions(e) {
  if (e.key === 'Escape') closeReactionsDialog()
}

function openReactionsDialog() {
  reactionsErr.value = ''
  reactionsMsg.value = ''
  reactionsDialogErr.value = ''
  draftEnabled.value = [...reactionEnabled.value]
  draftQuick.value = [...reactionQuick.value]
  reactionsDialogOpen.value = true
}

function closeReactionsDialog() {
  reactionsDialogOpen.value = false
}

watch(reactionsDialogOpen, (open) => {
  if (open) document.addEventListener('keydown', escapeCloseReactions, true)
  else document.removeEventListener('keydown', escapeCloseReactions, true)
})

onUnmounted(() => document.removeEventListener('keydown', escapeCloseReactions, true))

function toggleDraftEnabled(kind) {
  const en = new Set(draftEnabled.value)
  if (en.has(kind)) {
    if (en.size <= 1) return
    en.delete(kind)
    draftQuick.value = draftQuick.value.filter((k) => k !== kind)
  } else {
    en.add(kind)
  }
  draftEnabled.value = sortKindsByCatalog([...en])
}

function toggleDraftQuick(kind) {
  if (!draftEnabled.value.includes(kind)) return
  const q = new Set(draftQuick.value)
  if (q.has(kind)) {
    q.delete(kind)
  } else {
    if (q.size >= 5) return
    q.add(kind)
  }
  draftQuick.value = sortKindsByCatalog([...q])
  if (!draftQuick.value.length && draftEnabled.value.length) {
    draftQuick.value = draftEnabled.value.slice(0, Math.min(5, draftEnabled.value.length))
  }
}

async function confirmReactionsDialog() {
  reactionsDialogErr.value = ''
  if (!draftEnabled.value.length) {
    reactionsDialogErr.value = 'Отметьте хотя бы одну реакцию для канала'
    return
  }
  const ok = await saveReactions({
    enabled: [...draftEnabled.value],
    quick: [...draftQuick.value],
  })
  if (ok) {
    reactionsDialogOpen.value = false
  } else if (reactionsErr.value) {
    reactionsDialogErr.value = reactionsErr.value
  }
}

/** @param {{ enabled: string[], quick: string[] } | null} payload если null — берутся текущие reactionEnabled / reactionQuick */
async function saveReactions(payload = null) {
  const k = channelKey.value
  if (!k) return false
  reactionsMsg.value = ''
  reactionsErr.value = ''
  const enabled = sortKindsByCatalog(
    payload?.enabled ? [...payload.enabled] : [...reactionEnabled.value]
  )
  const quick = sortKindsByCatalog(payload?.quick ? [...payload.quick] : [...reactionQuick.value])
  busy.value = true
  try {
    const res = await api(`/api/channels/${encodeURIComponent(k)}/reactions`, {
      method: 'PATCH',
      body: { reactionEnabled: enabled, reactionQuick: quick },
    })
    const data = await parseJson(res)
    if (!res.ok) throw new Error(data?.error || 'Не удалось сохранить')
    reactionEnabled.value = enabled
    reactionQuick.value = quick
    reactionsMsg.value = 'Реакции обновлены'
    await refreshMe()
    return true
  } catch (e) {
    reactionsErr.value = e.message || 'Ошибка'
    return false
  } finally {
    busy.value = false
  }
}

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
    <p class="lead">
      Оформление, описание и роли участников. В ленте и общем чате владелец, админ и модератор канала могут удалять
      комментарии и сообщения, нарушающие правила сообщества.
    </p>

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

    <section v-if="isOwner" class="card">
      <h2 class="h2">Уровни подписки</h2>
      <p class="lead">
        Название и цены (₽) за месяц и за год. Чем выше «уровень» (число порядка), тем привилегированнее доступ. При
        публикации можно ограничить пост минимальным уровнем — тогда подписчики с более низким уровнем не увидят его в
        ленте. Удалить уровень нельзя, пока на него оформлена хотя бы одна подписка.
      </p>
      <div class="tiers-table-wrap tg-scroll">
        <table class="tiers-table">
          <thead>
            <tr>
              <th>Порядок</th>
              <th>Название</th>
              <th>₽ / мес</th>
              <th>₽ / год</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in subscriptionTiersDraft" :key="i">
              <td>
                <input v-model.number="row.sortOrder" type="number" min="1" max="99" class="inp inp--num" />
              </td>
              <td><input v-model="row.name" type="text" class="inp" maxlength="64" placeholder="Базовый" /></td>
              <td><input v-model.number="row.priceMonth" type="number" min="0" class="inp inp--num" /></td>
              <td><input v-model.number="row.priceYear" type="number" min="0" class="inp inp--num" /></td>
              <td>
                <button
                  type="button"
                  class="rm"
                  :disabled="busy || subscriptionTiersDraft.length <= 1"
                  title="Удалить строку"
                  @click="removeTierRow(i)"
                >
                  ×
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <button type="button" class="btn-add" :disabled="busy || subscriptionTiersDraft.length >= 8" @click="addTierRow">
        + Уровень
      </button>
      <button type="button" class="btn-save" :disabled="busy" @click="saveSubscriptionTiers">
        Сохранить уровни
      </button>
      <p v-if="tiersMsg" class="ok">{{ tiersMsg }}</p>
      <p v-if="tiersErr" class="bad">{{ tiersErr }}</p>
    </section>

    <section v-if="canManageRoles" class="card">
      <h2 class="h2">Реакции в ленте</h2>
      <p class="lead react-lead">
        Под постами участники ставят эмодзи. До пяти штук можно показать сразу в полоске, остальные выбранные — в
        меню «ещё».
      </p>
      <div class="react-compact">
        <div class="react-compact__stats">
          <span>В канале: <strong>{{ reactionEnabled.length }}</strong></span>
          <span class="react-compact__sep" aria-hidden="true">·</span>
          <span>В полоске: <strong>{{ reactionQuick.length }}</strong> / 5</span>
        </div>
        <div class="react-compact__preview">
          <span
            v-for="k in reactionQuick"
            :key="k"
            class="react-chip"
            :title="k"
          >{{ emojiForKind(k) }}</span>
          <span
            v-if="reactionEnabled.length > reactionQuick.length"
            class="react-chip react-chip--more"
            title="Ещё в меню «ещё»"
          >+{{ reactionEnabled.length - reactionQuick.length }}</span>
        </div>
        <button type="button" class="react-compact__open" :disabled="busy" @click="openReactionsDialog">
          Настроить реакции…
        </button>
      </div>
      <p v-if="reactionsMsg" class="ok">{{ reactionsMsg }}</p>
      <p v-if="reactionsErr" class="bad">{{ reactionsErr }}</p>
    </section>

    <Teleport to="body">
      <div
        v-if="reactionsDialogOpen"
        class="react-overlay"
        @click.self="closeReactionsDialog"
      >
        <div
          class="react-modal"
          role="dialog"
          aria-labelledby="react-dialog-title"
          aria-modal="true"
          @click.stop
        >
          <h3 id="react-dialog-title" class="react-modal__title">Настройка реакций</h3>
          <p class="react-modal__lead">
            Сначала отметьте, какие реакции доступны в канале (клик по эмодзи). Затем отметьте до пяти для полоски под
            постом — только из уже доступных.
          </p>

          <section class="react-modal__block">
            <h4 class="react-modal__h4">Доступны в канале <span class="react-modal__count">({{ draftEnabled.length }})</span></h4>
            <div class="react-pick-grid">
              <button
                v-for="item in REACTION_CATALOG"
                :key="'en-' + item.kind"
                type="button"
                class="react-pick"
                :class="{ 'react-pick--on': draftEnabled.includes(item.kind) }"
                :title="item.kind"
                :aria-pressed="draftEnabled.includes(item.kind)"
                :disabled="busy || (draftEnabled.length <= 1 && draftEnabled.includes(item.kind))"
                @click="toggleDraftEnabled(item.kind)"
              >
                <span class="react-pick__emoji">{{ item.emoji }}</span>
              </button>
            </div>
          </section>

          <section class="react-modal__block">
            <h4 class="react-modal__h4">
              В полоске под постом <span class="react-modal__count">({{ draftQuick.length }} / 5)</span>
            </h4>
            <p class="react-modal__hint">Клик по эмодзи из числа доступных включит или выключит показ в полоске.</p>
            <div class="react-pick-grid">
              <button
                v-for="item in REACTION_CATALOG"
                :key="'q-' + item.kind"
                type="button"
                class="react-pick"
                :class="{
                  'react-pick--strip': draftQuick.includes(item.kind),
                  'react-pick--off': !draftEnabled.includes(item.kind),
                }"
                :title="item.kind"
                :aria-pressed="draftQuick.includes(item.kind)"
                :disabled="busy || !draftEnabled.includes(item.kind)"
                @click="toggleDraftQuick(item.kind)"
              >
                <span class="react-pick__emoji">{{ item.emoji }}</span>
              </button>
            </div>
          </section>

          <p v-if="reactionsDialogErr" class="react-modal__err">{{ reactionsDialogErr }}</p>
          <div class="react-modal__foot">
            <button type="button" class="react-modal__cancel" :disabled="busy" @click="closeReactionsDialog">
              Отмена
            </button>
            <button type="button" class="react-modal__save" :disabled="busy" @click="confirmReactionsDialog">
              Сохранить
            </button>
          </div>
        </div>
      </div>
    </Teleport>

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

.react-lead {
  margin-bottom: 12px;
}

.react-compact {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 16px;
  border-radius: var(--tg-radius-md);
  border: 1px solid var(--tg-border);
  background: var(--tg-elevated);
}

.react-compact__stats {
  font-size: 0.88rem;
  color: var(--tg-muted);
}

.react-compact__stats strong {
  color: var(--tg-text);
}

.react-compact__sep {
  margin: 0 8px;
  opacity: 0.5;
}

.react-compact__preview {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  min-height: 36px;
}

.react-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 999px;
  font-size: 1.15rem;
  background: var(--tg-surface);
  border: 1px solid var(--tg-border);
}

.react-chip--more {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--tg-muted);
  width: auto;
  padding: 0 10px;
}

.react-compact__open {
  align-self: flex-start;
  padding: 10px 18px;
  border-radius: var(--tg-radius-md);
  border: 1px solid color-mix(in srgb, var(--tg-accent) 40%, var(--tg-border));
  background: color-mix(in srgb, var(--tg-accent) 12%, var(--tg-surface));
  color: var(--tg-gold);
  font-weight: 650;
  font-size: 0.88rem;
  cursor: pointer;
  font-family: inherit;
}

.react-compact__open:hover:not(:disabled) {
  background: color-mix(in srgb, var(--tg-accent) 20%, var(--tg-surface));
}

.react-compact__open:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.react-overlay {
  position: fixed;
  inset: 0;
  z-index: 9998;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(4px);
}

.react-modal {
  width: min(100%, 440px);
  max-height: min(90vh, 640px);
  overflow-y: auto;
  padding: 22px 20px 20px;
  border-radius: var(--tg-radius-lg);
  background: var(--tg-surface);
  border: 1px solid var(--tg-border);
  box-shadow: 0 24px 64px -16px rgba(0, 0, 0, 0.65);
}

.react-modal__title {
  margin: 0 0 10px;
  font-size: 1.15rem;
  font-weight: 700;
}

.react-modal__lead {
  margin: 0 0 18px;
  font-size: 0.84rem;
  color: var(--tg-muted);
  line-height: 1.5;
}

.react-modal__block {
  margin-bottom: 20px;
}

.react-modal__h4 {
  margin: 0 0 10px;
  font-size: 0.88rem;
  font-weight: 650;
}

.react-modal__count {
  font-weight: 500;
  color: var(--tg-muted);
}

.react-modal__hint {
  margin: 0 0 10px;
  font-size: 0.78rem;
  color: var(--tg-muted);
  line-height: 1.4;
}

.react-pick-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(44px, 1fr));
  gap: 8px;
}

.react-pick {
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1;
  padding: 0;
  border-radius: var(--tg-radius-md);
  border: 2px solid var(--tg-border);
  background: var(--tg-elevated);
  cursor: pointer;
  font-family: inherit;
  transition:
    border-color 0.15s ease,
    background 0.15s ease,
    opacity 0.15s ease;
}

.react-pick__emoji {
  font-size: 1.35rem;
  line-height: 1;
}

.react-pick--on {
  border-color: color-mix(in srgb, var(--tg-accent) 55%, var(--tg-border));
  background: var(--tg-accent-soft);
}

.react-pick--strip {
  border-color: color-mix(in srgb, var(--tg-gold) 55%, var(--tg-border));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tg-gold) 25%, transparent);
}

.react-pick--off {
  opacity: 0.38;
  cursor: not-allowed;
}

.react-pick:hover:not(:disabled):not(.react-pick--off) {
  border-color: color-mix(in srgb, var(--tg-accent) 40%, var(--tg-border));
}

.react-modal__err {
  margin: 0 0 12px;
  font-size: 0.84rem;
  color: #ffab91;
}

.react-modal__foot {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 8px;
  padding-top: 16px;
  border-top: 1px solid var(--tg-border);
}

.react-modal__cancel {
  padding: 10px 16px;
  border-radius: var(--tg-radius-md);
  border: 1px solid var(--tg-border);
  background: transparent;
  color: var(--tg-muted);
  font-weight: 600;
  font-size: 0.88rem;
  cursor: pointer;
  font-family: inherit;
}

.react-modal__cancel:hover:not(:disabled) {
  color: var(--tg-text);
}

.react-modal__save {
  padding: 10px 20px;
  border-radius: var(--tg-radius-md);
  border: none;
  font-weight: 650;
  font-size: 0.88rem;
  cursor: pointer;
  font-family: inherit;
  color: var(--tg-on-accent);
  background: var(--tg-gradient-primary-strong);
}

.react-modal__save:disabled,
.react-modal__cancel:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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

.inp--num {
  width: 5.5rem;
  min-width: 0;
}

.tiers-table-wrap {
  overflow-x: auto;
  margin-bottom: 10px;
}

.tiers-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.86rem;
}

.tiers-table th,
.tiers-table td {
  padding: 8px 10px;
  text-align: left;
  border-bottom: 1px solid var(--tg-border);
  vertical-align: middle;
}

.tiers-table th {
  color: var(--tg-muted);
  font-weight: 600;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
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
