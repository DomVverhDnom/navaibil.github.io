import { createRouter, createWebHistory } from 'vue-router'
import { useAuth, invalidateAuthPrepare } from '../composables/useAuth'
import HomeView from '../views/HomeView.vue'
import CommunityView from '../views/CommunityView.vue'
import ChatView from '../views/ChatView.vue'
import SubscribeView from '../views/SubscribeView.vue'
import LoginView from '../views/LoginView.vue'
import RegisterView from '../views/RegisterView.vue'
import ForgotPasswordView from '../views/ForgotPasswordView.vue'
import ResetPasswordView from '../views/ResetPasswordView.vue'
import CabinetView from '../views/CabinetView.vue'
import AdminView from '../views/AdminView.vue'
import ChannelsView from '../views/ChannelsView.vue'
import ChannelManageView from '../views/ChannelManageView.vue'
import MessagesView from '../views/MessagesView.vue'
import DirectThreadView from '../views/DirectThreadView.vue'

const routes = [
  { path: '/', name: 'home', component: HomeView, meta: { title: 'Vibe Club' } },
  {
    path: '/channels',
    name: 'channels',
    component: ChannelsView,
    meta: { title: 'Каналы', requiresAuth: true },
  },
  {
    path: '/channels/:channelKey/feed',
    name: 'channel-feed',
    component: CommunityView,
    meta: { title: 'Лента' },
  },
  {
    path: '/channels/:channelKey/chat',
    name: 'channel-chat',
    component: ChatView,
    meta: { title: 'Чат' },
  },
  {
    path: '/channels/:channelKey/subscribe',
    name: 'channel-subscribe',
    component: SubscribeView,
    meta: { title: 'Подписка' },
  },
  {
    path: '/channels/:channelKey/manage',
    name: 'channel-manage',
    component: ChannelManageView,
    meta: { title: 'Управление каналом', requiresAuth: true },
  },
  {
    path: '/channels/:channelKey/analytics',
    name: 'channel-analytics',
    component: () => import('../views/ChannelAnalyticsView.vue'),
    meta: { title: 'Аналитика канала', requiresAuth: true },
  },
  {
    path: '/channels/:channelKey/live',
    name: 'channel-live',
    component: () => import('../views/ChannelLiveSoonView.vue'),
    meta: { title: 'Прямой эфир (скоро)' },
  },
  { path: '/community', redirect: '/channels' },
  { path: '/chat', redirect: '/channels' },
  { path: '/subscribe', redirect: '/channels' },
  { path: '/login', name: 'login', component: LoginView, meta: { title: 'Вход' } },
  { path: '/register', name: 'register', component: RegisterView, meta: { title: 'Регистрация' } },
  {
    path: '/forgot-password',
    name: 'forgot-password',
    component: ForgotPasswordView,
    meta: { title: 'Восстановление пароля' },
  },
  {
    path: '/reset-password',
    name: 'reset-password',
    component: ResetPasswordView,
    meta: { title: 'Новый пароль' },
  },
  {
    path: '/cabinet',
    name: 'cabinet',
    component: CabinetView,
    meta: { title: 'Личный кабинет', requiresAuth: true },
  },
  {
    path: '/messages',
    name: 'messages',
    component: MessagesView,
    meta: { title: 'Сообщения', requiresAuth: true },
  },
  {
    path: '/messages/:userId',
    name: 'dm-thread',
    component: DirectThreadView,
    meta: { title: 'Диалог', requiresAuth: true },
  },
  {
    path: '/admin',
    name: 'admin',
    component: AdminView,
    meta: { title: 'Админка', requiresAuth: true, requiresStaff: true },
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior() {
    return { top: 0 }
  },
})

router.beforeEach(async (to) => {
  if (to.meta.requiresAuth || to.meta.requiresStaff) {
    invalidateAuthPrepare()
  }
  const { prepareAuth, isAuthenticated, isStaff } = useAuth()
  await prepareAuth()
  if (to.meta.requiresAuth && !isAuthenticated.value) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.meta.requiresStaff && !isStaff.value) {
    return { name: 'home' }
  }
  if (
    (to.name === 'login' ||
      to.name === 'register' ||
      to.name === 'forgot-password' ||
      to.name === 'reset-password') &&
    isAuthenticated.value
  ) {
    return { name: 'channels' }
  }
  return true
})

router.afterEach((to) => {
  const base = to.meta.title || 'Vibe Club'
  document.title = base === 'Vibe Club' ? base : `${base} · Vibe Club`
})

export default router
