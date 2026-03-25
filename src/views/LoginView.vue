<script setup>

import { ref, onMounted } from 'vue'

import { useRoute, useRouter, RouterLink } from 'vue-router'

import { useAuth } from '../composables/useAuth'

import OAuthButtons from '../components/OAuthButtons.vue'



const route = useRoute()

const router = useRouter()

const { login, loading, completeOAuthLogin } = useAuth()



const email = ref('')

const password = ref('')

const error = ref('')

const oauthBusy = ref(false)



function loginQueryAfterOauth() {

  const r = route.query.redirect

  return typeof r === 'string' && r.startsWith('/') ? { redirect: r } : {}

}



const oauthErrorText = {

  denied: 'Вход через соцсеть отменён',

  state: 'Сессия устарела — попробуйте войти снова',

  email_busy: 'Этот email уже занят аккаунтом с паролем. Войдите по email и паролю.',

  fail: 'Ошибка авторизации у провайдера',

  invalid: 'Некорректный запрос',

}



onMounted(async () => {

  const oe = route.query.oauth_error

  if (typeof oe === 'string' && oe) {

    error.value = oauthErrorText[oe] || 'Ошибка входа через соцсеть'

    await router.replace({ path: '/login', query: loginQueryAfterOauth() })

    return

  }

  const oc = route.query.oauth_code

  if (typeof oc === 'string' && oc) {

    oauthBusy.value = true

    error.value = ''

    try {

      await completeOAuthLogin(oc)

      const r = route.query.redirect

      await router.replace(typeof r === 'string' && r.startsWith('/') ? r : '/channels')

    } catch (e) {

      error.value = e.message || 'Ошибка'

      await router.replace({ path: '/login', query: loginQueryAfterOauth() })

    } finally {

      oauthBusy.value = false

    }

  }

})



async function submit() {

  error.value = ''

  try {

    await login(email.value, password.value)

    const r = route.query.redirect

    router.push(typeof r === 'string' && r.startsWith('/') ? r : '/channels')

  } catch (e) {

    error.value = e.message || 'Ошибка'

  }

}

</script>



<template>

  <div class="auth">

    <div class="card premium-glow">

      <h1 class="title">Вход</h1>

      <p class="lead">Войдите, чтобы оформить подписку на канал и открыть ленту с чатом.</p>

      <form class="form" @submit.prevent="submit">

        <label class="field">

          <span>Email</span>

          <input v-model="email" type="email" autocomplete="email" required />

        </label>

        <label class="field">

          <span>Пароль</span>

          <input v-model="password" type="password" autocomplete="current-password" required />

        </label>

        <p v-if="error" class="err">{{ error }}</p>

        <p v-if="oauthBusy" class="hint">Завершение входа…</p>

        <button type="submit" class="btn btn--primary btn--block" :disabled="loading || oauthBusy">

          {{ loading ? 'Вход…' : 'Войти' }}

        </button>

      </form>

      <OAuthButtons />

      <p class="forgot">

        <RouterLink to="/forgot-password">Забыли пароль?</RouterLink>

      </p>

      <p class="foot">

        Нет аккаунта?

        <RouterLink to="/register">Регистрация</RouterLink>

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



.hint {

  margin: 0;

  font-size: 0.85rem;

  color: var(--tg-muted);

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



.forgot {

  margin: 28px 0 0;

  font-size: 0.88rem;

  text-align: center;

}



.forgot a {

  color: var(--tg-gold);

  font-weight: 600;

}



.foot {

  margin: 14px 0 0;

  font-size: 0.9rem;

  color: var(--tg-muted);

  text-align: center;

}



.foot a {

  color: var(--tg-gold);

  font-weight: 600;

}

</style>

