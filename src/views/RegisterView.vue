<script setup>
import { ref } from 'vue'
import { useRouter, RouterLink } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import OAuthButtons from '../components/OAuthButtons.vue'

const router = useRouter()
const { register, loading } = useAuth()

const email = ref('')
const password = ref('')
const displayName = ref('')
const error = ref('')

async function submit() {
  error.value = ''
  try {
    await register({
      email: email.value,
      password: password.value,
      displayName: displayName.value.trim() || undefined,
    })
    router.push('/channels')
  } catch (e) {
    error.value = e.message || 'Ошибка'
  }
}
</script>

<template>
  <div class="auth">
    <div class="card premium-glow">
      <h1 class="title">Регистрация</h1>
      <p class="lead">Создайте аккаунт — подписка и чат привязаны к вашему профилю на сервере.</p>
      <form class="form" @submit.prevent="submit">
        <label class="field">
          <span>Отображаемое имя</span>
          <input v-model="displayName" type="text" autocomplete="nickname" maxlength="80" placeholder="Необязательно" />
        </label>
        <label class="field">
          <span>Email</span>
          <input v-model="email" type="email" autocomplete="email" required />
        </label>
        <label class="field">
          <span>Пароль</span>
          <input v-model="password" type="password" autocomplete="new-password" required minlength="8" maxlength="128" />
        </label>
        <p v-if="error" class="err">{{ error }}</p>
        <button type="submit" class="btn btn--primary btn--block" :disabled="loading">
          {{ loading ? 'Создание…' : 'Создать аккаунт' }}
        </button>
      </form>
      <OAuthButtons />
      <p class="foot">
        Уже есть аккаунт?
        <RouterLink to="/login">Войти</RouterLink>
        ·
        <RouterLink to="/forgot-password">Забыли пароль?</RouterLink>
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

.field input:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--tg-accent) 40%, var(--tg-border));
}

.err {
  margin: 0;
  font-size: 0.88rem;
  color: #ff8a80;
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
  margin: 28px 0 0;
  font-size: 0.9rem;
  color: var(--tg-muted);
  text-align: center;
}

.foot a {
  color: var(--tg-gold);
  font-weight: 600;
}
</style>
