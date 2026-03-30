import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { api, apiForm, parseJson } from '../lib/api'

const TOKEN_KEY = 'vibe_token'

const token = ref(typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_KEY) || '' : '')
const user = ref(null)
const channels = ref([])
const loading = ref(false)

let authPreparePromise = null

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function setToken(t) {
  const next = t || ''
  if (token.value !== next) {
    authPreparePromise = null
  }
  token.value = next
  try {
    if (next) localStorage.setItem(TOKEN_KEY, next)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore */
  }
}

function matchChannel(route, list) {
  const key = String(route.params.channelKey || '').trim()
  if (!key) return null
  return list.find((c) => c.slug === key || String(c.id) === key) || null
}

async function hydrateSessionFromApi() {
  if (!token.value) {
    user.value = null
    channels.value = []
    return
  }
  loading.value = true
  try {
    const maxAttempts = 6
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const res = await api('/api/me')
        const data = await parseJson(res)

        if (res.status === 401) {
          setToken('')
          user.value = null
          channels.value = []
          return
        }

        if (!res.ok) {
          if (attempt < maxAttempts - 1 && res.status >= 500) {
            await delay(250 * (attempt + 1))
            continue
          }
          return
        }

        user.value = data.user
        channels.value = data.channels || []
        return
      } catch {
        if (attempt < maxAttempts - 1) {
          await delay(250 * (attempt + 1))
          continue
        }
      }
    }
  } finally {
    loading.value = false
  }
}

export function prepareAuth() {
  if (!authPreparePromise) {
    authPreparePromise = hydrateSessionFromApi()
  }
  return authPreparePromise
}

export function invalidateAuthPrepare() {
  authPreparePromise = null
}

export function useAuth() {
  const route = useRoute()

  const currentChannel = computed(() => matchChannel(route, channels.value))

  const isAuthenticated = computed(() => !!user.value?.id)
  const isSubscribed = computed(() => currentChannel.value?.canAccess === true)
  const hasAnyChannelAccess = computed(() => channels.value.some((c) => c.canAccess === true))
  const isBanned = computed(() => user.value?.banned === true)
  const canPost = computed(() => {
    const c = currentChannel.value
    if (!c?.canAccess) return false
    const r = c.myRole
    return r === 'owner' || r === 'admin' || r === 'moderator'
  })
  const isAdmin = computed(() => user.value?.role === 'admin')
  const isStaff = computed(() => {
    const r = user.value?.role
    return r === 'admin' || r === 'moderator'
  })
  /** Владелец или админ канала (и глобальный админ сайта) — удаление постов в ленте. */
  const canDeleteChannelPosts = computed(() => {
    const c = currentChannel.value
    if (!c?.canAccess) return false
    if (isAdmin.value) return true
    const r = c.myRole
    return r === 'owner' || r === 'admin'
  })

  /** Модерация комментариев и чата в текущем канале (по маршруту). */
  const canModerateThisChannel = computed(() => {
    if (isAdmin.value) return true
    const c = currentChannel.value
    if (!c?.canAccess) return false
    const r = c.myRole
    return r === 'owner' || r === 'admin' || r === 'moderator'
  })

  async function refreshMe() {
    authPreparePromise = null
    await hydrateSessionFromApi()
  }

  async function bootstrap() {
    await prepareAuth()
  }

  async function login(email, password) {
    const res = await api('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    })
    const data = await parseJson(res)
    if (!res.ok) throw new Error(data?.error || 'Ошибка входа')
    setToken(data.token)
    user.value = data.user
    authPreparePromise = null
    await hydrateSessionFromApi()
  }

  async function completeOAuthLogin(oauthCode) {
    const res = await api('/api/auth/oauth/complete', {
      method: 'POST',
      body: { oauth_code: oauthCode },
    })
    const data = await parseJson(res)
    if (!res.ok) throw new Error(data?.error || 'Не удалось завершить вход')
    setToken(data.token)
    authPreparePromise = null
    await hydrateSessionFromApi()
  }

  async function register(payload) {
    const res = await api('/api/auth/register', {
      method: 'POST',
      body: payload,
    })
    const data = await parseJson(res)
    if (!res.ok) throw new Error(data?.error || 'Ошибка регистрации')
    setToken(data.token)
    user.value = data.user
    channels.value = []
    authPreparePromise = null
    await hydrateSessionFromApi()
  }

  function logout() {
    setToken('')
    user.value = null
    channels.value = []
    authPreparePromise = null
  }

  /** @param {string | { displayName?: string, showPublicChannels?: boolean }} updates */
  async function updateProfile(updates) {
    const body = typeof updates === 'string' ? { displayName: updates } : { ...updates }
    const res = await api('/api/me', {
      method: 'PATCH',
      body,
    })
    const data = await parseJson(res)
    if (!res.ok) throw new Error(data?.error || 'Не удалось сохранить')
    user.value = data.user
  }

  async function uploadAvatar(file) {
    if (!file) throw new Error('Выберите файл')
    const fd = new FormData()
    fd.append('avatar', file)
    const res = await apiForm('/api/me/avatar', fd)
    const data = await parseJson(res)
    if (!res.ok) throw new Error(data?.error || 'Не удалось загрузить аватар')
    await refreshMe()
  }

  async function activateSubscription(plan, channelKey, tierId) {
    const key = String(channelKey || '').trim()
    if (!key) throw new Error('Не выбран канал')
    const tid = Number(tierId)
    if (!Number.isFinite(tid) || tid <= 0) throw new Error('Не выбран уровень подписки')
    const res = await api(`/api/channels/${encodeURIComponent(key)}/subscription/activate`, {
      method: 'POST',
      body: { plan, tierId: tid },
    })
    const data = await parseJson(res)
    if (!res.ok) throw new Error(data?.error || 'Ошибка активации')
    await refreshMe()
  }

  async function cancelSubscription(channelKey) {
    const key = String(channelKey || '').trim()
    if (!key) throw new Error('Не выбран канал')
    const res = await api(`/api/channels/${encodeURIComponent(key)}/subscription/cancel`, { method: 'POST' })
    const data = await parseJson(res)
    if (!res.ok) throw new Error(data?.error || 'Ошибка отмены')
    await refreshMe()
  }

  return {
    token,
    user,
    channels,
    loading,
    currentChannel,
    isAuthenticated,
    isSubscribed,
    hasAnyChannelAccess,
    isBanned,
    canPost,
    canDeleteChannelPosts,
    canModerateThisChannel,
    isAdmin,
    isStaff,
    prepareAuth,
    bootstrap,
    refreshMe,
    login,
    completeOAuthLogin,
    register,
    logout,
    updateProfile,
    uploadAvatar,
    activateSubscription,
    cancelSubscription,
  }
}
