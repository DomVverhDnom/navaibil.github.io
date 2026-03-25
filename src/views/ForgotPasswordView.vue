<script setup>
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import { api, parseJson } from '../lib/api'

const email = ref('')
const message = ref('')
const error = ref('')
const busy = ref(false)

async function submit() {
  message.value = ''
  error.value = ''
  busy.value = true
  try {
    const res = await api('/api/auth/forgot-password', {
      method: 'POST',
      body: { email: email.value.trim().toLowerCase() },
    })
    const data = await parseJson(res)
    if (!res.ok) {
      error.value = data?.error || 'Не удалось отправить запрос'
      return
    }
    message.value = data?.message || 'Запрос принят.'
  } catch {
    error.value = 'Нет связи с сервером. Проверьте адрес в браузере и что API запущен.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="auth">
    <div class="card premium-glow">
      <h1 class="title">Забыли пароль?</h1>
      <p class="lead">
        Укажите email аккаунта. В режиме разработки ссылка для нового пароля появляется в терминале, где запущен
        сервер. В production настройте почту или задайте
        <code class="code">APP_PUBLIC_URL</code>
        и доставку письма отдельно.
      </p>
      <form class="form" @submit.prevent="submit">
        <label class="field">
          <span>Email</span>
          <input v-model="email" type="email" autocomplete="email" required />
        </label>
        <p v-if="error" class="err">{{ error }}</p>
        <p v-if="message" class="ok">{{ message }}</p>
        <button type="submit" class="btn btn--primary btn--block" :disabled="busy">
          {{ busy ? 'Отправка…' : 'Продолжить' }}
        </button>
      </form>
      <p class="foot">
        <RouterLink to="/login">← Назад ко входу</RouterLink>
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
  font-size: 0.88rem;
  color: var(--tg-muted);
  line-height: 1.55;
}

.code {
  font-size: 0.8em;
  padding: 2px 6px;
  border-radius: 6px;
  background: var(--tg-elevated);
  color: var(--tg-gold);
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
  line-height: 1.45;
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
  transition: opacity 0.15s, transform 0.15s;
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
