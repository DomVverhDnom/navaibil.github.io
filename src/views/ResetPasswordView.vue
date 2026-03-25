<script setup>
import { ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { api, parseJson } from '../lib/api'

const route = useRoute()
const router = useRouter()

const token = ref('')
const password = ref('')
const password2 = ref('')
const error = ref('')
const message = ref('')
const busy = ref(false)

watch(
  () => route.query.token,
  (t) => {
    token.value = typeof t === 'string' ? t : ''
  },
  { immediate: true }
)

async function submit() {
  error.value = ''
  message.value = ''
  if (password.value !== password2.value) {
    error.value = 'Пароли не совпадают'
    return
  }
  if (password.value.length < 8) {
    error.value = 'Пароль не короче 8 символов'
    return
  }
  if (!token.value.trim()) {
    error.value = 'Нет кода из ссылки. Откройте страницу по полной ссылке из письма или консоли сервера.'
    return
  }
  busy.value = true
  try {
    const res = await api('/api/auth/reset-password', {
      method: 'POST',
      body: { token: token.value.trim(), password: password.value },
    })
    const data = await parseJson(res)
    if (!res.ok) {
      error.value = data?.error || 'Не удалось сменить пароль'
      return
    }
    message.value = data?.message || 'Готово.'
    setTimeout(() => router.push('/login'), 1200)
  } catch {
    error.value = 'Нет связи с сервером.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="auth">
    <div class="card premium-glow">
      <h1 class="title">Новый пароль</h1>
      <p class="lead">Вставьте код из ссылки (если открыли страницу без параметров) и задайте новый пароль.</p>
      <form class="form" @submit.prevent="submit">
        <label class="field">
          <span>Код (token)</span>
          <input v-model="token" type="text" autocomplete="one-time-code" class="mono" />
        </label>
        <label class="field">
          <span>Новый пароль</span>
          <input v-model="password" type="password" autocomplete="new-password" required minlength="8" maxlength="128" />
        </label>
        <label class="field">
          <span>Повтор пароля</span>
          <input v-model="password2" type="password" autocomplete="new-password" required minlength="8" maxlength="128" />
        </label>
        <p v-if="error" class="err">{{ error }}</p>
        <p v-if="message" class="ok">{{ message }}</p>
        <button type="submit" class="btn btn--primary btn--block" :disabled="busy">
          {{ busy ? 'Сохранение…' : 'Сохранить пароль' }}
        </button>
      </form>
      <p class="foot">
        <RouterLink to="/login">← Ко входу</RouterLink>
      </p>
    </div>
  </div>
</template>

<style scoped>
.auth {
  max-width: 420px;
  margin: 0 auto;
  padding: 40px 20px 64px;
}

.card {
  padding: 32px 28px;
  border-radius: var(--tg-radius-lg);
  background: var(--tg-surface);
  border: 1px solid var(--tg-border);
}

.title {
  margin: 0 0 8px;
  font-size: 1.5rem;
  font-weight: 700;
}

.lead {
  margin: 0 0 24px;
  font-size: 0.9rem;
  color: var(--tg-muted);
  line-height: 1.5;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.85rem;
  color: var(--tg-muted);
}

.field input {
  padding: 12px 14px;
  border-radius: var(--tg-radius-sm);
  border: 1px solid var(--tg-border);
  background: var(--tg-elevated);
  color: var(--tg-text);
  font-size: 1rem;
}

.field input.mono {
  font-family: ui-monospace, monospace;
  font-size: 0.82rem;
}

.field input:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--tg-accent) 40%, var(--tg-border));
}

.err {
  margin: 0;
  font-size: 0.88rem;
  color: #ff8a80;
}

.ok {
  margin: 0;
  font-size: 0.88rem;
  color: #a5d6a7;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 14px 20px;
  border-radius: var(--tg-radius-md);
  font-weight: 600;
  font-size: 0.95rem;
  border: none;
  cursor: pointer;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn--primary {
  color: var(--tg-on-accent);
  background: var(--tg-gradient-primary);
}

.btn--block {
  width: 100%;
}

.foot {
  margin: 20px 0 0;
  font-size: 0.9rem;
  text-align: center;
}

.foot a {
  color: var(--tg-gold);
  font-weight: 600;
}
</style>
