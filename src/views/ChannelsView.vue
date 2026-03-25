<script setup>
import { ref, onMounted, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import { api, parseJson } from '../lib/api'

const { channels, refreshMe, loading } = useAuth()

const createName = ref('')
const createSlug = ref('')
const createDescription = ref('')
const createPriceMonth = ref(0)
const createPriceYear = ref(0)
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

async function createChannel() {
  err.value = ''
  ok.value = ''
  const name = createName.value.trim()
  if (!name) {
    err.value = 'Укажите название'
    return
  }
  busy.value = true
  try {
    const body = {
      name,
      priceMonth: Number(createPriceMonth.value) || 0,
      priceYear: Number(createPriceYear.value) || 0,
    }
    const s = createSlug.value.trim().toLowerCase()
    if (s) body.slug = s
    const d = createDescription.value.trim()
    if (d) body.description = d
    const res = await api('/api/channels', { method: 'POST', body })
    const data = await parseJson(res)
    if (!res.ok) throw new Error(data?.error || 'Не удалось создать')
    createName.value = ''
    createSlug.value = ''
    createDescription.value = ''
    createPriceMonth.value = 0
    createPriceYear.value = 0
    ok.value = 'Канал создан'
    await refreshMe()
  } catch (e) {
    err.value = e.message || 'Ошибка'
  } finally {
    busy.value = false
  }
}

async function openJoinModal() {
  err.value = ''
  ok.value = ''
  const slug = joinSlug.value.trim().toLowerCase()
  if (!slug) {
    err.value = 'Укажите адрес канала (slug)'
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
    ok.value = 'Вы в канале. При необходимости оформите подписку по ценам канала.'
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

function channelPriceHint(c) {
  if (c.myRole === 'owner' || c.myRole === 'admin' || c.myRole === 'moderator') return ''
  const m = c.priceMonth ?? 0
  const y = c.priceYear ?? 0
  if (m === 0 && y === 0) return 'Бесплатный доступ'
  if (m > 0 && y > 0) return `от ${fmtRub(m)}/мес · ${fmtRub(y)}/год`
  if (m > 0) return `от ${fmtRub(m)}/мес`
  return `${fmtRub(y)}/год`
}

watch(showJoinModal, (open) => {
  if (typeof document === 'undefined') return
  document.body.style.overflow = open ? 'hidden' : ''
})
</script>

<template>
  <div class="page">
    <h1 class="title">Каналы</h1>
    <p class="lead">
      У каждого канала своя лента и чат. Создавая канал, вы задаёте цены подписки и описание; по адресу (slug) другие
      пользователи находят канал и вступают.
    </p>

    <section class="card">
      <h2 class="h2">Ваши каналы</h2>
      <p v-if="loading" class="muted">Загрузка…</p>
      <ul v-else-if="channels.length" class="list">
        <li v-for="c in channels" :key="c.id" class="row">
          <div class="row__main">
            <span class="row__name">{{ c.name }}</span>
            <span class="row__slug">/{{ c.slug }}</span>
            <span class="row__role">{{ roleRu(c.myRole) }}</span>
            <span v-if="channelPriceHint(c)" class="row__price">{{ channelPriceHint(c) }}</span>
            <span v-if="!c.canAccess" class="row__warn">Нет доступа — оформите подписку</span>
          </div>
          <div class="row__actions">
            <template v-if="c.canAccess">
              <RouterLink class="link link--cta" :to="`/channels/${encodeURIComponent(c.slug)}/feed`">
                Лента
              </RouterLink>
              <RouterLink class="link link--cta link--cta-alt" :to="`/channels/${encodeURIComponent(c.slug)}/chat`">
                Чат
              </RouterLink>
            </template>
            <RouterLink v-else class="link" :to="`/channels/${encodeURIComponent(c.slug)}/subscribe`">
              Подписка
            </RouterLink>
            <RouterLink
              v-if="c.myRole === 'owner' || c.myRole === 'admin'"
              class="link link--cta link--cta-manage"
              :to="`/channels/${encodeURIComponent(c.slug)}/manage`"
            >
              Управление
            </RouterLink>
          </div>
        </li>
      </ul>
      <p v-else class="muted">Пока нет каналов — создайте или вступите по адресу.</p>
    </section>

    <div class="grid">
      <section class="card">
        <h2 class="h2">Создать канал</h2>
        <label class="field">
          <span>Название</span>
          <input v-model="createName" type="text" maxlength="80" placeholder="Например, Мой курс" />
        </label>
        <label class="field">
          <span>Адрес — slug (латиница, необязательно)</span>
          <input v-model="createSlug" type="text" maxlength="50" placeholder="my-course" />
        </label>
        <label class="field">
          <span>Описание для тех, кто вступает по адресу</span>
          <textarea
            v-model="createDescription"
            class="textarea tg-scroll"
            rows="4"
            maxlength="2000"
            placeholder="Коротко о канале: тема, формат, что получит подписчик…"
          />
        </label>
        <div class="prices">
          <label class="field field--inline">
            <span>Цена, ₽ / месяц</span>
            <input v-model.number="createPriceMonth" type="number" min="0" max="999999" step="1" />
          </label>
          <label class="field field--inline">
            <span>Цена, ₽ / год</span>
            <input v-model.number="createPriceYear" type="number" min="0" max="9999999" step="1" />
          </label>
        </div>
        <p class="hint">0 ₽ — бесплатный доступ к контенту по подписке (активация без оплаты в тестовом режиме).</p>
        <button type="button" class="btn" :disabled="busy" @click="createChannel">Создать</button>
      </section>

      <section class="card">
        <h2 class="h2">Вступить по адресу</h2>
        <label class="field">
          <span>Slug канала</span>
          <input
            v-model="joinSlug"
            type="text"
            maxlength="50"
            placeholder="my-course"
            @keydown.enter.prevent="openJoinModal"
          />
        </label>
        <button type="button" class="btn btn--ghost" :disabled="busy" @click="openJoinModal">Показать канал</button>
      </section>
    </div>

    <p v-if="ok" class="ok">{{ ok }}</p>
    <p v-if="err" class="bad">{{ err }}</p>

    <Teleport to="body">
      <div v-if="showJoinModal && joinPreview" class="modal" role="dialog" aria-modal="true" @click.self="closeJoinModal">
        <div class="modal__card">
          <button type="button" class="modal__close" aria-label="Закрыть" @click="closeJoinModal">×</button>
          <h3 class="modal__title">{{ joinPreview.channel.name }}</h3>
          <p class="modal__slug">/{{ joinPreview.channel.slug }}</p>
          <div v-if="joinPreview.channel.description" class="modal__desc">
            {{ joinPreview.channel.description }}
          </div>
          <p v-else class="modal__muted">Описание не заполнено.</p>
          <ul class="modal__prices">
            <li v-if="joinPreview.channel.priceMonth === 0 && joinPreview.channel.priceYear === 0">Подписка: бесплатно</li>
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
                Лента
              </RouterLink>
              <button type="button" class="btn btn--ghost" @click="closeJoinModal">Закрыть</button>
            </div>
          </template>
          <template v-else>
            <p class="modal__fine">После вступления вы сможете оформить подписку по этим условиям (когда будет оплата).</p>
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
  max-width: var(--layout-max);
  margin: 0 auto;
  padding: 28px 20px 56px;
}

.title {
  margin: 0 0 8px;
  font-size: 1.65rem;
  font-weight: 700;
}

.lead {
  margin: 0 0 24px;
  color: var(--tg-muted);
  font-size: 0.95rem;
  line-height: 1.55;
}

.card {
  padding: 20px 18px;
  margin-bottom: 18px;
  border-radius: var(--tg-radius-lg);
  background: var(--tg-surface);
  border: 1px solid var(--tg-border);
}

.h2 {
  margin: 0 0 14px;
  font-size: 1.05rem;
  font-weight: 600;
}

.grid {
  display: grid;
  gap: 18px;
  grid-template-columns: 1fr;
}

@media (min-width: 640px) {
  .grid {
    grid-template-columns: 1fr 1fr;
  }
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: space-between;
  align-items: flex-start;
  padding: 12px 0;
  border-bottom: 1px solid var(--tg-border);
}

.row:last-child {
  border-bottom: none;
}

.row__name {
  font-weight: 600;
  display: block;
}

.row__slug {
  font-size: 0.82rem;
  color: var(--tg-muted);
}

.row__role {
  display: inline-block;
  margin-left: 8px;
  font-size: 0.75rem;
  color: var(--tg-gold);
}

.row__price {
  display: block;
  font-size: 0.8rem;
  color: var(--tg-muted);
  margin-top: 4px;
}

.row__warn {
  display: block;
  font-size: 0.8rem;
  color: #ffab91;
  margin-top: 4px;
}

.row__actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.link {
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--tg-gold);
}

.row__actions .link--cta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 9px 16px;
  border-radius: var(--tg-radius-sm);
  font-size: 0.86rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-decoration: none;
  color: var(--tg-on-accent);
  background: var(--tg-gradient-primary-strong);
  border: 1px solid color-mix(in srgb, var(--tg-accent) 35%, transparent);
  box-shadow: 0 2px 10px color-mix(in srgb, #000 28%, transparent);
  transition: filter 0.15s ease, transform 0.12s ease;
}

.row__actions .link--cta:hover {
  filter: brightness(1.08);
  transform: translateY(-1px);
}

.row__actions .link--cta-alt {
  color: var(--tg-text);
  background: color-mix(in srgb, var(--tg-accent) 22%, var(--tg-surface));
  border-color: color-mix(in srgb, var(--tg-accent) 45%, var(--tg-border));
  box-shadow: 0 2px 8px color-mix(in srgb, #000 22%, transparent);
}

.row__actions .link--cta-alt:hover {
  filter: brightness(1.06);
  border-color: color-mix(in srgb, var(--tg-gold) 40%, var(--tg-border));
}

.row__actions .link--cta.link--cta-manage {
  color: #ede7f6;
  background: linear-gradient(
    145deg,
    color-mix(in srgb, #6a4abf 58%, var(--tg-surface)),
    color-mix(in srgb, #4527a0 42%, var(--tg-surface))
  );
  border-color: color-mix(in srgb, #9575cd 50%, var(--tg-border));
  box-shadow: 0 2px 10px color-mix(in srgb, #000 28%, transparent);
}

.row__actions .link--cta.link--cta-manage:hover {
  filter: brightness(1.09);
  border-color: color-mix(in srgb, #b39ddb 45%, var(--tg-border));
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
  font-size: 0.82rem;
  color: var(--tg-muted);
}

.field--inline {
  margin-bottom: 0;
}

.field input,
.textarea {
  padding: 10px 12px;
  border-radius: var(--tg-radius-sm);
  border: 1px solid var(--tg-border);
  background: var(--tg-elevated);
  color: var(--tg-text);
  font-family: inherit;
}

.textarea {
  resize: vertical;
  min-height: 88px;
  max-height: 280px;
  overflow-y: auto;
  overscroll-behavior: contain;
  line-height: 1.45;
}

.prices {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 8px;
}

@media (max-width: 520px) {
  .prices {
    grid-template-columns: 1fr;
  }
}

.hint {
  margin: 0 0 12px;
  font-size: 0.78rem;
  color: var(--tg-muted);
  line-height: 1.45;
}

.btn {
  padding: 10px 16px;
  border-radius: var(--tg-radius-sm);
  font-weight: 600;
  border: none;
  cursor: pointer;
  color: var(--tg-on-accent);
  background: var(--tg-gradient-primary);
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.btn--ghost {
  color: var(--tg-text);
  background: var(--tg-elevated);
  border: 1px solid var(--tg-border);
}

.muted {
  color: var(--tg-muted);
  font-size: 0.9rem;
}

.ok {
  color: #a5d6a7;
  font-size: 0.9rem;
}

.bad {
  color: #ff8a80;
  font-size: 0.9rem;
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
  max-width: 420px;
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

.modal__close:hover {
  color: var(--tg-text);
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
  color: var(--tg-text);
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
</style>
