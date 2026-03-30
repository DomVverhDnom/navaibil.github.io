<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import { api, parseJson } from '../lib/api'

const { refreshMe } = useAuth()

const name = ref('')
const slug = ref('')
const slugTouched = ref(false)
const description = ref('')
/** free | month | year | both */
const priceMode = ref('free')
const priceMonth = ref(0)
const priceYear = ref(0)
const socialRows = ref([{ label: '', url: '' }])
const err = ref('')
const ok = ref('')
const busy = ref(false)

onMounted(() => {
  refreshMe()
})

watch(name, () => {
  if (!slugTouched.value) slug.value = suggestSlug(name.value)
})

function suggestSlug(title) {
  const base = String(title || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 48)
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(base) ? base : ''
}

function applySuggestedSlug() {
  slugTouched.value = false
  slug.value = suggestSlug(name.value)
}

function onSlugInput() {
  slugTouched.value = true
}

const effectivePrices = computed(() => {
  switch (priceMode.value) {
    case 'free':
      return { month: 0, year: 0 }
    case 'month':
      return { month: Number(priceMonth.value) || 0, year: 0 }
    case 'year':
      return { month: 0, year: Number(priceYear.value) || 0 }
    default:
      return { month: Number(priceMonth.value) || 0, year: Number(priceYear.value) || 0 }
  }
})

function addSocialRow() {
  if (socialRows.value.length >= 12) return
  socialRows.value.push({ label: '', url: '' })
}

function removeSocialRow(i) {
  socialRows.value.splice(i, 1)
  if (socialRows.value.length === 0) socialRows.value.push({ label: '', url: '' })
}

async function submit() {
  err.value = ''
  ok.value = ''
  const n = name.value.trim()
  if (!n) {
    err.value = 'Укажите название канала'
    return
  }
  const { month, year } = effectivePrices.value
  if (priceMode.value === 'month' && month <= 0) {
    err.value = 'Укажите цену за месяц больше 0'
    return
  }
  if (priceMode.value === 'year' && year <= 0) {
    err.value = 'Укажите цену за год больше 0'
    return
  }
  if (priceMode.value === 'both' && month <= 0 && year <= 0) {
    err.value = 'Укажите хотя бы одну цену (месяц или год)'
    return
  }

  const socialLinks = socialRows.value
    .map((r) => ({
      label: String(r.label || '').trim(),
      url: String(r.url || '').trim(),
    }))
    .filter((r) => r.url.length > 0)

  busy.value = true
  try {
    const body = {
      name: n,
      priceMonth: month,
      priceYear: year,
    }
    const s = slug.value.trim().toLowerCase()
    if (s) body.slug = s
    const d = description.value.trim()
    if (d) body.description = d
    if (socialLinks.length) body.socialLinks = socialLinks

    const res = await api('/api/channels', { method: 'POST', body })
    const data = await parseJson(res)
    if (!res.ok) throw new Error(data?.error || 'Не удалось создать канал')

    name.value = ''
    slug.value = ''
    slugTouched.value = false
    description.value = ''
    priceMode.value = 'free'
    priceMonth.value = 0
    priceYear.value = 0
    socialRows.value = [{ label: '', url: '' }]
    ok.value = 'Канал создан. Откройте его в списке «Мои каналы» или загрузите шапку в управлении канала.'
    await refreshMe()
  } catch (e) {
    err.value = e.message || 'Ошибка'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="page">
    <nav class="breadcrumbs">
      <RouterLink to="/channels" class="breadcrumbs__link">← Мои каналы</RouterLink>
    </nav>

    <header class="head">
      <h1 class="title">Новый канал</h1>
      <p class="lead">
        Задайте имя и адрес, опишите сообщество опционально. Тарифы и ссылки можно изменить позже в разделе управления.
      </p>
    </header>

    <p v-if="ok" class="banner banner--ok">{{ ok }}</p>
    <p v-if="err" class="banner banner--err">{{ err }}</p>

    <form class="form premium-glow" @submit.prevent="submit">
      <section class="block">
        <h2 class="h2">Основное</h2>
        <label class="field">
          <span>Название <em class="req">*</em></span>
          <input v-model="name" type="text" maxlength="80" placeholder="Например: Клуб практикующих дизайнеров" />
        </label>
        <label class="field">
          <span>Адрес (slug) в ссылке</span>
          <div class="slug-row">
            <input
              v-model="slug"
              type="text"
              maxlength="50"
              placeholder="латиница и дефисы, например design-humans"
              @input="onSlugInput"
            />
            <button type="button" class="btn-mini" @click="applySuggestedSlug">Подставить из названия</button>
          </div>
        </label>
        <label class="field">
          <span>Описание для страницы канала</span>
          <textarea
            v-model="description"
            class="textarea tg-scroll"
            rows="5"
            maxlength="2000"
            placeholder="О чём канал, для кого он, что получит участник после вступления…"
          />
        </label>
      </section>

      <section class="block">
        <h2 class="h2">Доступ и цены</h2>
        <p class="field-hint">0 ₽ означает бесплатное продление подписки в тестовом режиме (без реальной оплаты).</p>
        <div class="price-modes" role="radiogroup" aria-label="Модель цен">
          <label class="radio-card">
            <input v-model="priceMode" type="radio" value="free" />
            <span class="radio-card__body">
              <strong>Бесплатно</strong>
              <small>Без тарифов, только активация доступа</small>
            </span>
          </label>
          <label class="radio-card">
            <input v-model="priceMode" type="radio" value="month" />
            <span class="radio-card__body">
              <strong>Только месяц</strong>
              <small>Одна цена за месяц</small>
            </span>
          </label>
          <label class="radio-card">
            <input v-model="priceMode" type="radio" value="year" />
            <span class="radio-card__body">
              <strong>Только год</strong>
              <small>Годовая подписка</small>
            </span>
          </label>
          <label class="radio-card">
            <input v-model="priceMode" type="radio" value="both" />
            <span class="radio-card__body">
              <strong>Месяц и год</strong>
              <small>Два тарифа на выбор</small>
            </span>
          </label>
        </div>
        <div v-if="priceMode === 'month' || priceMode === 'both'" class="price-inp">
          <label class="field">
            <span>Цена, ₽ / месяц</span>
            <input v-model.number="priceMonth" type="number" min="0" max="999999" step="1" />
          </label>
        </div>
        <div v-if="priceMode === 'year' || priceMode === 'both'" class="price-inp">
          <label class="field">
            <span>Цена, ₽ / год</span>
            <input v-model.number="priceYear" type="number" min="0" max="9999999" step="1" />
          </label>
        </div>
      </section>

      <section class="block">
        <h2 class="h2">Ссылки (необязательно)</h2>
        <p class="field-hint">До 12 ссылок: сайт, соцсети, бот. Шапку канала загрузите позже в «Управлении».</p>
        <div v-for="(row, i) in socialRows" :key="i" class="social-row">
          <input v-model="row.label" type="text" class="inp" placeholder="Подпись" maxlength="48" />
          <input v-model="row.url" type="url" class="inp inp--wide" placeholder="https://…" />
          <button v-if="socialRows.length > 1" type="button" class="rm" title="Убрать" @click="removeSocialRow(i)">
            ×
          </button>
        </div>
        <button v-if="socialRows.length < 12" type="button" class="btn-add" @click="addSocialRow">+ Ещё ссылка</button>
      </section>

      <div class="submit-row">
        <RouterLink to="/channels" class="btn btn--ghost">Отмена</RouterLink>
        <button type="submit" class="btn btn--primary" :disabled="busy">{{ busy ? 'Создание…' : 'Создать канал' }}</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.page {
  max-width: 720px;
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
  letter-spacing: -0.02em;
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

.form {
  padding: 22px 20px 24px;
  border-radius: var(--tg-radius-lg);
  background: var(--tg-surface);
  border: 1px solid var(--tg-border);
}

.block {
  margin-bottom: 28px;
}

.block:last-of-type {
  margin-bottom: 20px;
}

.h2 {
  margin: 0 0 14px;
  font-size: 1.05rem;
  font-weight: 600;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
  font-size: 0.82rem;
  color: var(--tg-muted);
}

.field-hint {
  margin: -6px 0 14px;
  font-size: 0.8rem;
  color: var(--tg-muted);
  line-height: 1.45;
}

.req {
  color: #ffab91;
  font-style: normal;
}

.field input,
.textarea,
.inp {
  padding: 10px 12px;
  border-radius: var(--tg-radius-sm);
  border: 1px solid var(--tg-border);
  background: var(--tg-elevated);
  color: var(--tg-text);
  font-family: inherit;
}

.textarea {
  resize: vertical;
  min-height: 120px;
  line-height: 1.45;
}

.slug-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.slug-row input {
  flex: 1;
  min-width: 200px;
}

.btn-mini {
  padding: 8px 12px;
  border-radius: var(--tg-radius-sm);
  border: 1px solid var(--tg-border);
  background: var(--tg-bg);
  color: var(--tg-muted);
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}

.btn-mini:hover {
  color: var(--tg-text);
  border-color: color-mix(in srgb, var(--tg-accent) 35%, var(--tg-border));
}

.price-modes {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
  margin-bottom: 16px;
}

.radio-card {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px;
  border-radius: var(--tg-radius-md);
  border: 1px solid var(--tg-border);
  background: var(--tg-bg);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.radio-card:has(input:checked) {
  border-color: color-mix(in srgb, var(--tg-accent) 45%, var(--tg-border));
  background: var(--tg-accent-soft);
}

.radio-card__body {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.radio-card__body strong {
  font-size: 0.86rem;
  color: var(--tg-text);
}

.radio-card__body small {
  font-size: 0.74rem;
  color: var(--tg-muted);
  line-height: 1.35;
}

.price-inp {
  max-width: 220px;
}

.social-row {
  display: grid;
  grid-template-columns: 1fr 2fr auto;
  gap: 8px;
  margin-bottom: 10px;
  align-items: center;
}

@media (max-width: 560px) {
  .social-row {
    grid-template-columns: 1fr;
  }
}

.inp--wide {
  min-width: 0;
}

.rm {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: var(--tg-radius-sm);
  background: color-mix(in srgb, var(--tg-border) 50%, transparent);
  color: var(--tg-text);
  font-size: 1.2rem;
  cursor: pointer;
}

.btn-add {
  padding: 8px 0;
  border: none;
  background: none;
  color: var(--tg-gold);
  font-weight: 600;
  font-size: 0.86rem;
  cursor: pointer;
}

.submit-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: flex-end;
  padding-top: 8px;
  border-top: 1px solid var(--tg-border);
}

.btn {
  padding: 12px 20px;
  border-radius: var(--tg-radius-md);
  font-weight: 600;
  font-size: 0.92rem;
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
</style>
