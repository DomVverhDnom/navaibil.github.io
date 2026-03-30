<script setup>
import { reactive, ref, watch, onUnmounted, onMounted, computed, nextTick } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { io } from 'socket.io-client'
import { useAuth } from '../composables/useAuth'
import { api, apiBase, parseJson, apiForm } from '../lib/api'
import { mediaUrl } from '../lib/mediaUrl'
import { formatPostHtml } from '../lib/postFormat'
import { REACTION_CATALOG } from '../lib/reactionsCatalog'
import CommunityGate from '../components/CommunityGate.vue'
import PostComments from '../components/PostComments.vue'
import PostImageSlider from '../components/PostImageSlider.vue'

const route = useRoute()
const { isSubscribed, token, canPost, canDeleteChannelPosts, canModerateThisChannel } = useAuth()

const channelKey = computed(() => String(route.params.channelKey || '').trim())
const channelId = ref(null)
const channelTitle = ref('')
const channelBannerPath = ref(null)
const channelDescription = ref('')
const channelSocialLinks = ref([])
/** @type {import('vue').Ref<Array<{ id: number, sortOrder: number, name: string, priceMonth: number, priceYear: number }>>} */
const subscriptionTiers = ref([])

const MAX_POST_PHOTOS = 12

function defaultChannelReactions() {
  const bar = REACTION_CATALOG.slice(0, 5).map((x) => ({ kind: x.kind, emoji: x.emoji }))
  const qs = new Set(bar.map((x) => x.kind))
  const overflow = REACTION_CATALOG.filter((x) => !qs.has(x.kind)).map((x) => ({ kind: x.kind, emoji: x.emoji }))
  return { bar, overflow }
}

const channelReactions = ref(defaultChannelReactions())
const reactionPickerPostId = ref(null)

const posts = ref([])
const postDraft = ref('')
const photoItems = ref([])
const photoInput = ref(null)
const postTextarea = ref(null)
const loading = ref(false)
const postError = ref('')
const commentsByPost = reactive({})
/** @type {Record<number, { hasMoreOlder?: boolean, total?: number | null, loadingOlder?: boolean }>} */
const commentsMeta = reactive({})

const COMMENTS_PAGE = 50
/** Пустая строка = все подписчики; иначе sort_order уровня */
const postMinTierSort = ref('')

let commentSocket = null
const origin = apiBase() || undefined

function fmtWhen(iso) {
  try {
    return new Date(iso).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return ''
  }
}

function pushComment(postId, comment) {
  if (!commentsByPost[postId]) commentsByPost[postId] = []
  if (commentsByPost[postId].some((c) => c.id === comment.id)) return
  commentsByPost[postId].push(comment)
  const post = posts.value.find((x) => x.id === postId)
  if (post) post.commentCount = (Number(post.commentCount) || 0) + 1
}

function removeCommentFromPost(postId, commentId) {
  const arr = commentsByPost[postId]
  let removedFromList = false
  if (arr?.length) {
    const i = arr.findIndex((c) => c.id === commentId)
    if (i !== -1) {
      arr.splice(i, 1)
      removedFromList = true
    }
  }
  const post = posts.value.find((x) => x.id === postId)
  if (!post) return
  if (removedFromList || !arr) {
    post.commentCount = Math.max(0, (Number(post.commentCount) || 0) - 1)
  }
}

function onPhotoChange(e) {
  const incoming = Array.from(e.target?.files || [])
  if (e.target) e.target.value = ''
  const next = [...photoItems.value]
  for (const f of incoming) {
    if (next.length >= MAX_POST_PHOTOS) break
    if (!/^image\/(jpeg|png|gif|webp)$/i.test(f.type)) continue
    next.push({ file: f, url: URL.createObjectURL(f) })
  }
  photoItems.value = next
}

function removePhotoAt(idx) {
  const it = photoItems.value[idx]
  if (it?.url) URL.revokeObjectURL(it.url)
  photoItems.value = photoItems.value.filter((_, i) => i !== idx)
}

function clearPhotos() {
  for (const it of photoItems.value) {
    if (it?.url) URL.revokeObjectURL(it.url)
  }
  photoItems.value = []
  if (photoInput.value) photoInput.value.value = ''
}

function wrapSelection(before, after) {
  const el = postTextarea.value
  if (!el) return
  const start = el.selectionStart ?? 0
  const end = el.selectionEnd ?? 0
  const v = postDraft.value
  const sel = v.slice(start, end)
  const insAfter = after ?? before
  postDraft.value = v.slice(0, start) + before + sel + insAfter + v.slice(end)
  nextTick(() => {
    el.focus()
    const caret = start + before.length + sel.length
    el.setSelectionRange(caret, caret)
  })
}

function insertLinePrefix(prefix) {
  const el = postTextarea.value
  if (!el) return
  const start = el.selectionStart ?? 0
  const v = postDraft.value
  const lineStart = v.lastIndexOf('\n', start - 1) + 1
  postDraft.value = v.slice(0, lineStart) + prefix + v.slice(lineStart)
  nextTick(() => {
    el.focus()
    const pos = start + prefix.length
    el.setSelectionRange(pos, pos)
  })
}

function insertHorizontalRule() {
  const el = postTextarea.value
  if (!el) return
  const v = postDraft.value
  const start = el.selectionStart ?? 0
  const pad = start > 0 && v[start - 1] !== '\n' ? '\n' : ''
  const ins = `${pad}---\n`
  postDraft.value = v.slice(0, start) + ins + v.slice(el.selectionEnd ?? start)
  nextTick(() => {
    el.focus()
    const pos = start + ins.length
    el.setSelectionRange(pos, pos)
  })
}

function insertBlockQuoteLine() {
  insertLinePrefix('> ')
}

function onComposerKeydown(e) {
  if (!(e.ctrlKey || e.metaKey)) return
  const k = e.key.toLowerCase()
  if (k === 'b') {
    e.preventDefault()
    wrapSelection('**', '**')
  } else if (k === 'i') {
    e.preventDefault()
    wrapSelection('*', '*')
  }
}

function toggleReactionPicker(postId) {
  reactionPickerPostId.value = reactionPickerPostId.value === postId ? null : postId
}

function onDocumentClickClosePicker(e) {
  const t = e?.target
  if (t && typeof t.closest === 'function' && t.closest('.react-more-wrap')) return
  reactionPickerPostId.value = null
}

onMounted(() => {
  document.addEventListener('click', onDocumentClickClosePicker)
})

function insertLink() {
  const url = window.prompt('Адрес ссылки (https://…)')
  if (url == null) return
  const u = String(url).trim()
  if (!u) return
  const defLabel = u.replace(/^https?:\/\//i, '').slice(0, 40)
  const label = window.prompt('Текст ссылки', defLabel)
  if (label == null) return
  const t = String(label).trim() || defLabel
  const el = postTextarea.value
  if (!el) return
  const start = el.selectionStart ?? 0
  const end = el.selectionEnd ?? 0
  const v = postDraft.value
  const sel = v.slice(start, end) || t
  const chunk = `[${sel}](${u})`
  postDraft.value = v.slice(0, start) + chunk + v.slice(end)
  nextTick(() => {
    el.focus()
    const pos = start + chunk.length
    el.setSelectionRange(pos, pos)
  })
}

function postMediaPaths(p) {
  if (p?.imagePaths?.length) return p.imagePaths
  if (p?.imagePath) return [p.imagePath]
  return []
}

/** Порядок как на сервере: закреплённые сверху (новее закрепление — выше), остальные по дате поста. */
function sortFeedPosts(list) {
  return [...list].sort((a, b) => {
    const ap = a.pinnedAt ? 1 : 0
    const bp = b.pinnedAt ? 1 : 0
    if (ap !== bp) return bp - ap
    if (ap && bp) {
      const ta = new Date(a.pinnedAt).getTime()
      const tb = new Date(b.pinnedAt).getTime()
      if (Number.isFinite(tb) && Number.isFinite(ta) && tb !== ta) return tb - ta
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })
}

async function loadSummary() {
  const k = channelKey.value
  if (!k) return
  const res = await api(`/api/channels/${encodeURIComponent(k)}/summary`)
  const data = await parseJson(res)
    if (res.ok && data?.channel) {
    channelId.value = data.channel.id
    channelTitle.value = data.channel.name || ''
    channelBannerPath.value = data.channel.bannerPath || null
    channelDescription.value = data.channel.description || ''
    channelSocialLinks.value = Array.isArray(data.channel.socialLinks) ? data.channel.socialLinks : []
    subscriptionTiers.value = Array.isArray(data.channel.subscriptionTiers)
      ? data.channel.subscriptionTiers.map((t) => ({
          id: t.id,
          sortOrder: t.sortOrder,
          name: t.name,
          priceMonth: t.priceMonth,
          priceYear: t.priceYear,
        }))
      : []
    const r = data.channel.reactions
    if (r?.bar?.length) {
      channelReactions.value = {
        bar: r.bar.map((x) => ({ kind: x.kind, emoji: x.emoji })),
        overflow: Array.isArray(r.overflow) ? r.overflow.map((x) => ({ kind: x.kind, emoji: x.emoji })) : [],
      }
    } else {
      channelReactions.value = defaultChannelReactions()
    }
  }
}

async function loadPosts() {
  const k = channelKey.value
  if (!k || !isSubscribed.value) return
  loading.value = true
  postError.value = ''
  try {
    const res = await api(`/api/channels/${encodeURIComponent(k)}/posts?limit=80`)
    const data = await parseJson(res)
    if (!res.ok) {
      postError.value = data?.error || 'Не удалось загрузить ленту'
      return
    }
    posts.value = sortFeedPosts(data.posts || [])
    if (data.channelId) channelId.value = data.channelId
  } finally {
    loading.value = false
  }
}

async function deletePost(p) {
  const k = channelKey.value
  if (!k || !p?.id) return
  if (!confirm('Удалить этот пост? Комментарии и реакции будут удалены.')) return
  postError.value = ''
  const res = await api(`/api/channels/${encodeURIComponent(k)}/posts/${p.id}`, { method: 'DELETE' })
  const data = await parseJson(res)
  if (!res.ok) {
    postError.value = data?.error || 'Не удалось удалить пост'
    return
  }
  posts.value = posts.value.filter((x) => x.id !== p.id)
  delete commentsByPost[p.id]
  delete commentsMeta[p.id]
}

function tierLabelForPost(sort) {
  if (sort == null) return ''
  const t = subscriptionTiers.value.find((x) => x.sortOrder === Number(sort))
  return t ? `От «${t.name}»` : `Уровень ${sort}`
}

async function createPost() {
  const k = channelKey.value
  const t = postDraft.value.trim()
  const files = photoItems.value.map((x) => x.file)
  if (!k || (!t && !files.length)) return
  postError.value = ''
  const fd = new FormData()
  fd.append('content', t)
  const mts = String(postMinTierSort.value || '').trim()
  if (mts) fd.append('minTierSort', mts)
  for (const f of files) fd.append('photos', f)
  const res = await apiForm(`/api/channels/${encodeURIComponent(k)}/posts`, fd)
  const data = await parseJson(res)
  if (!res.ok) {
    postError.value = data?.error || 'Не удалось опубликовать'
    return
  }
  postDraft.value = ''
  clearPhotos()
  posts.value = sortFeedPosts([data.post, ...posts.value])
}

async function togglePostPin(p) {
  const k = channelKey.value
  if (!k || !p?.id) return
  const nextPinned = !p.pinnedAt
  postError.value = ''
  const res = await api(`/api/channels/${encodeURIComponent(k)}/posts/${p.id}/pin`, {
    method: 'PATCH',
    body: { pinned: nextPinned },
  })
  const data = await parseJson(res)
  if (!res.ok) {
    postError.value = data?.error || 'Не удалось изменить закрепление'
    return
  }
  const updated = data.post
  if (updated?.id) {
    const i = posts.value.findIndex((x) => x.id === updated.id)
    if (i >= 0) {
      posts.value[i] = { ...posts.value[i], ...updated }
      posts.value = sortFeedPosts(posts.value)
    }
  }
}

async function fetchComments(postId, opts = {}) {
  const k = channelKey.value
  if (!k) return
  const beforeId = opts.beforeId
  const qs = new URLSearchParams()
  qs.set('limit', String(COMMENTS_PAGE))
  if (beforeId != null) qs.set('beforeId', String(beforeId))
  const res = await api(
    `/api/channels/${encodeURIComponent(k)}/posts/${postId}/comments?${qs}`
  )
  const data = await parseJson(res)
  if (!res.ok) return
  const list = data.comments || []
  if (beforeId != null) {
    const cur = commentsByPost[postId] || []
    commentsByPost[postId] = [...list, ...cur]
    commentsMeta[postId] = {
      ...commentsMeta[postId],
      hasMoreOlder: !!data.hasMoreOlder,
    }
  } else {
    commentsByPost[postId] = list
    commentsMeta[postId] = {
      hasMoreOlder: !!data.hasMoreOlder,
      total: data.total != null ? Number(data.total) : null,
      loadingOlder: false,
    }
  }
}

async function loadOlderComments(postId) {
  const arr = commentsByPost[postId]
  const meta = commentsMeta[postId]
  if (!arr?.length || !meta?.hasMoreOlder || meta.loadingOlder) return
  commentsMeta[postId] = { ...meta, loadingOlder: true }
  try {
    await fetchComments(postId, { beforeId: arr[0].id })
  } finally {
    const m = commentsMeta[postId]
    if (m) commentsMeta[postId] = { ...m, loadingOlder: false }
  }
}

function onCommentAppend(postId, comment) {
  pushComment(postId, comment)
}

function applyReactionToPost(postId, reactionCounts, myReaction) {
  const p = posts.value.find((x) => x.id === postId)
  if (!p) return
  p.reactionCounts = reactionCounts && typeof reactionCounts === 'object' ? { ...reactionCounts } : {}
  p.myReaction = myReaction ?? null
}

async function toggleReaction(post, kind) {
  const k = channelKey.value
  if (!k || !post?.id) return
  const res = await api(`/api/channels/${encodeURIComponent(k)}/posts/${post.id}/react`, {
    method: 'POST',
    body: { kind },
  })
  const data = await parseJson(res)
  if (!res.ok) {
    postError.value = data?.error || 'Не удалось поставить реакцию'
    return
  }
  applyReactionToPost(data.postId, data.reactionCounts, data.myReaction)
  reactionPickerPostId.value = null
}

function reactionCount(post, kind) {
  const n = post?.reactionCounts?.[kind]
  return typeof n === 'number' && n > 0 ? n : 0
}

function sameLiveChannelId(a, b) {
  if (a == null || b == null) return false
  return Number(a) === Number(b)
}

function tryJoinCommentChannelRoom() {
  if (!commentSocket?.connected) return
  const id = channelId.value
  if (id == null || id === '') return
  commentSocket.emit('channel:join', id)
}

function connectCommentSocket() {
  disconnectCommentSocket()
  if (!token.value || !isSubscribed.value || !channelKey.value) return
  commentSocket = io(origin, {
    path: '/socket.io',
    autoConnect: false,
    auth: { token: token.value },
    transports: ['websocket', 'polling'],
  })
  commentSocket.on('connect', tryJoinCommentChannelRoom)
  commentSocket.io.on('reconnect', tryJoinCommentChannelRoom)
  commentSocket.on('post:comment', (payload) => {
    const cid = payload?.channelId
    const postId = payload?.postId
    const comment = payload?.comment
    if (!sameLiveChannelId(cid, channelId.value) || !comment) return
    pushComment(postId, comment)
  })
  commentSocket.on('post:comment:remove', (payload) => {
    const cid = payload?.channelId
    const postId = payload?.postId
    const commentId = payload?.commentId
    if (!sameLiveChannelId(cid, channelId.value) || postId == null || commentId == null) return
    removeCommentFromPost(postId, commentId)
  })
  commentSocket.on('post:react', (payload) => {
    const cid = payload?.channelId
    const postId = payload?.postId
    if (!sameLiveChannelId(cid, channelId.value) || postId == null) return
    const p = posts.value.find((x) => x.id === postId)
    if (!p) return
    p.reactionCounts =
      payload.reactionCounts && typeof payload.reactionCounts === 'object'
        ? { ...payload.reactionCounts }
        : {}
  })
  commentSocket.on('post:remove', (payload) => {
    const cid = payload?.channelId
    const postId = payload?.postId
    if (!sameLiveChannelId(cid, channelId.value) || postId == null) return
    posts.value = posts.value.filter((x) => x.id !== postId)
    delete commentsByPost[postId]
    delete commentsMeta[postId]
  })
  commentSocket.on('post:pin', (payload) => {
    const cid = payload?.channelId
    const postId = payload?.postId
    if (!sameLiveChannelId(cid, channelId.value) || postId == null) return
    const pin = posts.value.find((x) => x.id === postId)
    if (!pin) return
    pin.pinnedAt = payload.pinnedAt || null
    posts.value = sortFeedPosts(posts.value)
  })
  commentSocket.connect()
}

function disconnectCommentSocket() {
  if (commentSocket) {
    commentSocket.removeAllListeners()
    commentSocket.io.off('reconnect', tryJoinCommentChannelRoom)
    commentSocket.disconnect()
    commentSocket = null
  }
}

watch(channelId, () => {
  tryJoinCommentChannelRoom()
})

watch(
  [channelKey, isSubscribed, token],
  async () => {
    Object.keys(commentsByPost).forEach((k) => delete commentsByPost[k])
    Object.keys(commentsMeta).forEach((k) => delete commentsMeta[k])
    posts.value = []
    postError.value = ''
    await loadSummary()
    await loadPosts()
    disconnectCommentSocket()
    connectCommentSocket()
  },
  { immediate: true }
)

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClickClosePicker)
  disconnectCommentSocket()
  for (const it of photoItems.value) {
    if (it?.url) URL.revokeObjectURL(it.url)
  }
})
</script>

<template>
  <div class="page">
    <CommunityGate>
      <header class="head premium-glow">
        <div
          class="head__cover"
          :class="{ 'head__cover--empty': !channelBannerPath }"
          :style="channelBannerPath ? { backgroundImage: `url(${mediaUrl(channelBannerPath)})` } : {}"
        />
        <div class="head__inner">
          <p class="head__kicker">Лента канала</p>
          <h1 class="head__title">{{ channelTitle || 'Канал' }}</h1>
          <p v-if="channelDescription" class="head__desc">{{ channelDescription }}</p>
          <p v-else class="head__subtitle">
            Публикации готовит команда канала. Участники с доступом читают материалы, комментируют и общаются в чате.
          </p>
          <ul v-if="channelSocialLinks.length" class="head__socials" aria-label="Ссылки канала">
            <li v-for="(s, i) in channelSocialLinks" :key="i">
              <a :href="s.url" class="head__social" target="_blank" rel="noopener noreferrer">{{ s.label }}</a>
            </li>
          </ul>
          <div class="head__nav">
            <RouterLink :to="`/channels/${encodeURIComponent(channelKey)}/chat`" class="head__chat-btn">
              <span class="head__chat-ico" aria-hidden="true">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              </span>
              Чат канала
            </RouterLink>
            <span class="head__live-soon" title="Прямые эфиры скоро">Эфир · скоро</span>
          </div>
        </div>
      </header>

      <section v-if="canPost" class="composer premium-glow">
        <h2 class="section-label">Новый пост</h2>
        <p class="composer__lead">Разметка как в мессенджере: **жирный**, *курсив*, `код`, списки, цитата, линия <code class="composer__code-hint">---</code>. Ctrl+B / Ctrl+I.</p>
        <div class="composer__toolbar" aria-label="Форматирование">
          <button type="button" class="composer__tbtn" title="Жирный (Ctrl+B)" @click="wrapSelection('**', '**')">
            <strong>B</strong>
          </button>
          <button type="button" class="composer__tbtn" title="Курсив (Ctrl+I)" @click="wrapSelection('*', '*')">
            <em>I</em>
          </button>
          <button type="button" class="composer__tbtn composer__tbtn--mono" title="Код (inline)" @click="wrapSelection('`', '`')">
            &#96;
          </button>
          <button type="button" class="composer__tbtn" title="Зачёркнутый" @click="wrapSelection('~~', '~~')">
            <s>S</s>
          </button>
          <button type="button" class="composer__tbtn" title="Ссылка" @click="insertLink">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
          </button>
          <span class="composer__tsep" aria-hidden="true" />
          <button type="button" class="composer__tbtn" title="Маркированный список" @click="insertLinePrefix('- ')">•</button>
          <button type="button" class="composer__tbtn" title="Нумерованный список" @click="insertLinePrefix('1. ')">1.</button>
          <button type="button" class="composer__tbtn" title="Цитата" @click="insertBlockQuoteLine">❝</button>
          <button type="button" class="composer__tbtn" title="Разделитель —-" @click="insertHorizontalRule">─</button>
        </div>
        <textarea
          ref="postTextarea"
          v-model="postDraft"
          class="composer__input"
          rows="5"
          maxlength="8000"
          placeholder="Напишите текст поста… **важное**, ссылки [текст](https://…), строка только с --- даст разделитель."
          @keydown="onComposerKeydown"
        />
        <p class="composer__fmt-hint">
          До {{ MAX_POST_PHOTOS }} фото (JPEG, PNG, GIF, WebP). Свайп или стрелки в ленте перелистывают снимки.
        </p>
        <div v-if="subscriptionTiers.length" class="composer__tier">
          <label class="composer__tier-lab" for="post-min-tier">Видимость поста</label>
          <select
            id="post-min-tier"
            v-model="postMinTierSort"
            class="composer__tier-select"
          >
            <option value="">Все подписчики</option>
            <option
              v-for="t in [...subscriptionTiers].sort((a, b) => a.sortOrder - b.sortOrder)"
              :key="t.id"
              :value="String(t.sortOrder)"
            >
              Только от «{{ t.name }}» (ур. {{ t.sortOrder }})
            </option>
          </select>
          <p class="composer__tier-hint">
            Подписчики с уровнем ниже не увидят пост в ленте (и не откроют комментарии).
          </p>
        </div>
        <div class="composer__file">
          <label class="tg-file-btn" :class="{ 'tg-file-btn--disabled': loading }">
            <input
              ref="photoInput"
              type="file"
              multiple
              accept="image/jpeg,image/png,image/gif,image/webp"
              class="tg-file-hidden"
              :disabled="loading"
              @change="onPhotoChange"
            />
            <span class="tg-file-btn__icon" aria-hidden="true">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            </span>
            Добавить фото
          </label>
          <span v-if="photoItems.length" class="composer__count">{{ photoItems.length }} / {{ MAX_POST_PHOTOS }}</span>
          <button v-if="photoItems.length" type="button" class="composer__clear" @click="clearPhotos">Сбросить все</button>
        </div>
        <div v-if="photoItems.length" class="composer__previews">
          <div v-for="(it, idx) in photoItems" :key="idx" class="composer__thumb-wrap">
            <img :src="it.url" alt="" class="composer__thumb" width="72" height="72" />
            <button type="button" class="composer__thumb-rm" title="Убрать" @click="removePhotoAt(idx)">×</button>
          </div>
        </div>
        <div class="composer__row">
          <button
            type="button"
            class="btn btn--publish"
            :disabled="loading || (!postDraft.trim() && !photoItems.length)"
            @click="createPost"
          >
            Опубликовать
          </button>
          <span v-if="loading" class="hint">Загрузка…</span>
        </div>
        <p v-if="postError" class="err">{{ postError }}</p>
      </section>
      <p v-else class="no-post">
        Публиковать посты могут только модераторы и администраторы. Вы можете комментировать посты и писать в
        <RouterLink :to="`/channels/${encodeURIComponent(channelKey)}/chat`">чате канала</RouterLink>.
      </p>

      <h2 class="section-label section-label--feed">Лента</h2>
      <div class="feed">
        <article v-for="p in posts" :key="p.id" class="post" :class="{ 'post--pinned': !!p.pinnedAt }">
          <div class="post__meta">
            <img
              v-if="p.authorAvatar"
              class="post__avatar"
              :src="mediaUrl(p.authorAvatar)"
              alt=""
              width="32"
              height="32"
            />
            <div v-else class="post__avatar post__avatar--ph" aria-hidden="true" />
            <div class="post__meta-text">
              <span class="post__author">{{ p.authorName }}</span>
              <span class="post__time">{{ fmtWhen(p.createdAt) }}</span>
              <span v-if="p.minTierSort != null" class="post__tier-badge" :title="'Минимальный уровень подписки'"
                >{{ tierLabelForPost(p.minTierSort) }}</span
              >
              <span v-if="p.pinnedAt" class="post__pin-badge" title="Закреплён администратором канала">Закреплён</span>
            </div>
            <div v-if="canDeleteChannelPosts" class="post__actions">
              <button
                type="button"
                class="post__pin"
                :title="p.pinnedAt ? 'Открепить пост' : 'Закрепить пост вверху ленты'"
                @click="togglePostPin(p)"
              >
                {{ p.pinnedAt ? 'Открепить' : 'Закрепить' }}
              </button>
              <button type="button" class="post__del" title="Удалить пост" @click="deletePost(p)">Удалить</button>
            </div>
          </div>
          <div
            v-if="p.content"
            class="post__text post__text--rich"
            v-html="formatPostHtml(p.content)"
          />
          <PostImageSlider v-if="postMediaPaths(p).length" :paths="postMediaPaths(p)" class="post__slider" />
          <div class="post__react" role="group" aria-label="Реакции" @click.stop>
            <button
              v-for="r in channelReactions.bar"
              :key="r.kind"
              type="button"
              class="react-btn"
              :class="{ 'react-btn--mine': p.myReaction === r.kind }"
              @click="toggleReaction(p, r.kind)"
            >
              <span class="react-btn__emoji" aria-hidden="true">{{ r.emoji }}</span>
              <span v-if="reactionCount(p, r.kind)" class="react-btn__cnt">{{ reactionCount(p, r.kind) }}</span>
            </button>
            <div v-if="channelReactions.overflow.length" class="react-more-wrap">
              <button
                type="button"
                class="react-more-btn"
                :class="{ 'react-more-btn--open': reactionPickerPostId === p.id }"
                :aria-expanded="reactionPickerPostId === p.id"
                aria-label="Ещё реакции"
                @click.stop="toggleReactionPicker(p.id)"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
              </button>
              <div v-if="reactionPickerPostId === p.id" class="react-popover" @click.stop>
                <button
                  v-for="r in channelReactions.overflow"
                  :key="r.kind"
                  type="button"
                  class="react-popover__btn"
                  :class="{ 'react-popover__btn--mine': p.myReaction === r.kind }"
                  @click="toggleReaction(p, r.kind)"
                >
                  <span class="react-popover__emoji">{{ r.emoji }}</span>
                  <span class="react-popover__kind">{{ r.kind }}</span>
                </button>
              </div>
            </div>
          </div>
          <PostComments
            :channel-key="channelKey"
            :post-id="p.id"
            :comments="commentsByPost[p.id] || []"
            :feed-comment-count="p.commentCount ?? 0"
            :has-more-older="commentsMeta[p.id]?.hasMoreOlder ?? false"
            :comments-total="commentsMeta[p.id]?.total ?? null"
            :loading-older="commentsMeta[p.id]?.loadingOlder ?? false"
            :can-moderate="canModerateThisChannel"
            @fetch="fetchComments(p.id)"
            @loadOlder="loadOlderComments(p.id)"
            @append="onCommentAppend(p.id, $event)"
            @removed="removeCommentFromPost(p.id, $event)"
          />
        </article>
        <p v-if="!loading && !posts.length" class="empty">
          {{ canPost ? 'Пока нет постов — создайте первый.' : 'Пока нет постов. Ожидайте публикаций от модераторов.' }}
        </p>
      </div>
    </CommunityGate>
  </div>
</template>

<style scoped>
.page {
  max-width: var(--layout-max);
  margin: 0 auto;
  padding: 28px 20px 56px;
}

.head {
  margin-bottom: 26px;
  border-radius: var(--tg-radius-lg);
  overflow: hidden;
  border: 1px solid var(--tg-border);
  background: linear-gradient(
    165deg,
    color-mix(in srgb, var(--tg-surface) 88%, var(--tg-accent-soft)),
    var(--tg-surface)
  );
  box-shadow: 0 16px 48px -28px rgba(0, 0, 0, 0.55);
}

.head__cover {
  height: 160px;
  background-size: cover;
  background-position: center;
}

.head__cover--empty {
  background: linear-gradient(135deg, color-mix(in srgb, var(--tg-accent) 22%, #12141a), var(--tg-surface));
}

.head__inner {
  padding: 18px 20px 20px;
}

.head__kicker {
  margin: 0 0 6px;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--tg-muted);
}

.head__title {
  margin: 0 0 8px;
  font-size: clamp(1.45rem, 3vw, 1.85rem);
  font-weight: 750;
  letter-spacing: -0.02em;
}

.head__subtitle {
  margin: 0 0 8px;
  font-size: 0.9rem;
  color: var(--tg-muted);
}

.head__desc {
  margin: 0 0 12px;
  font-size: 0.92rem;
  line-height: 1.55;
  color: var(--tg-text);
  white-space: pre-wrap;
  word-break: break-word;
}

.head__socials {
  list-style: none;
  margin: 0 0 12px;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
}

.head__social {
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--tg-gold);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.head__nav {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 16px;
  margin-top: 14px;
}

.head__chat-btn {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  border-radius: var(--tg-radius-md);
  font-size: 0.95rem;
  font-weight: 750;
  text-decoration: none;
  color: var(--tg-on-accent);
  background: var(--tg-gradient-primary-strong);
  border: 1px solid color-mix(in srgb, var(--tg-accent-hi) 45%, transparent);
  box-shadow:
    0 4px 22px -4px var(--tg-glow),
    0 0 0 1px color-mix(in srgb, var(--tg-accent) 25%, transparent);
  transition:
    transform 0.15s ease,
    filter 0.15s ease;
}

.head__chat-btn:hover {
  filter: brightness(1.06);
  transform: translateY(-1px);
}

.head__chat-ico {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 0;
  flex-shrink: 0;
  opacity: 0.95;
}

.head__chat-ico svg {
  display: block;
  flex-shrink: 0;
}

.head__live-soon {
  display: inline-flex;
  align-items: center;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--tg-muted);
  background: color-mix(in srgb, var(--tg-border) 55%, transparent);
  border: 1px solid var(--tg-border);
  cursor: default;
  user-select: none;
}

.no-post {
  margin: 0 0 24px;
  padding: 14px 16px;
  border-radius: var(--tg-radius-md);
  background: var(--tg-surface);
  border: 1px solid var(--tg-border);
  font-size: 0.9rem;
  color: var(--tg-muted);
  line-height: 1.5;
}

.no-post a {
  color: var(--tg-gold);
  font-weight: 600;
}

.section-label {
  margin: 0 0 10px;
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--tg-muted);
}

.section-label--feed {
  margin-top: 8px;
  margin-bottom: 14px;
}

.composer {
  margin-bottom: 28px;
  padding: 20px 20px 22px;
  border-radius: var(--tg-radius-lg);
  background: var(--tg-surface);
  border: 1px solid var(--tg-border);
}

.composer__lead {
  margin: 0 0 14px;
  font-size: 0.84rem;
  color: var(--tg-muted);
  line-height: 1.5;
}

.composer__code-hint {
  font-family: ui-monospace, monospace;
  font-size: 0.8em;
  padding: 0.1em 0.35em;
  border-radius: 4px;
  background: var(--tg-elevated);
}

.composer__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
  padding: 8px 10px;
  border-radius: var(--tg-radius-md);
  background: var(--tg-elevated);
  border: 1px solid var(--tg-border);
}

.composer__tbtn {
  min-width: 34px;
  height: 34px;
  padding: 0 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--tg-radius-sm);
  font-size: 0.82rem;
  font-weight: 600;
  border: 1px solid transparent;
  background: transparent;
  color: var(--tg-text);
  cursor: pointer;
  font-family: inherit;
}

.composer__tbtn:hover {
  background: color-mix(in srgb, var(--tg-accent) 12%, transparent);
  border-color: var(--tg-accent-line);
  color: var(--tg-gold);
}

.composer__tbtn--mono {
  font-family: ui-monospace, 'Cascadia Code', monospace;
  font-weight: 700;
}

.composer__tsep {
  width: 1px;
  height: 22px;
  background: var(--tg-border);
  margin: 0 4px;
}

.composer__input {
  width: 100%;
  margin-bottom: 12px;
  padding: 14px 16px;
  border-radius: var(--tg-radius-md);
  border: 1px solid var(--tg-border);
  background: var(--tg-bg);
  color: var(--tg-text);
  font-family: inherit;
  font-size: 0.96rem;
  line-height: 1.5;
  resize: vertical;
  min-height: 120px;
}

.composer__input:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--tg-accent) 45%, var(--tg-border));
  box-shadow: 0 0 0 3px var(--tg-accent-soft);
}

.composer__fmt-hint {
  margin: 0 0 12px;
  font-size: 0.78rem;
  color: var(--tg-muted);
  line-height: 1.45;
}

.composer__file {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.composer__count {
  font-size: 0.82rem;
  color: var(--tg-gold);
  font-weight: 600;
}

.composer__previews {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 12px;
}

.composer__thumb-wrap {
  position: relative;
  width: 72px;
  height: 72px;
  border-radius: var(--tg-radius-sm);
  overflow: hidden;
  border: 1px solid var(--tg-border);
}

.composer__thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.composer__thumb-rm {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 6px;
  background: color-mix(in srgb, #000 55%, transparent);
  color: #fff;
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.composer__clear {
  padding: 6px 10px;
  border-radius: var(--tg-radius-sm);
  font-size: 0.8rem;
  border: 1px solid var(--tg-border);
  background: transparent;
  color: var(--tg-muted);
  cursor: pointer;
}

.composer__tier {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--tg-border);
}

.composer__tier-lab {
  display: block;
  font-size: 0.78rem;
  font-weight: 650;
  color: var(--tg-muted);
  margin-bottom: 6px;
}

.composer__tier-select {
  width: 100%;
  max-width: 420px;
  padding: 10px 12px;
  border-radius: var(--tg-radius-sm);
  border: 1px solid var(--tg-border);
  background: var(--tg-elevated);
  color: var(--tg-text);
  font-size: 0.9rem;
}

.composer__tier-hint {
  margin: 8px 0 0;
  font-size: 0.78rem;
  color: var(--tg-muted);
  line-height: 1.4;
  max-width: 520px;
}

.composer__row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.hint {
  font-size: 0.85rem;
  color: var(--tg-muted);
}

.err {
  margin: 10px 0 0;
  font-size: 0.85rem;
  color: #ff8a80;
}

.feed {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.post {
  padding: 20px;
  border-radius: var(--tg-radius-lg);
  background: var(--tg-surface);
  border: 1px solid var(--tg-border);
  box-shadow: 0 10px 36px -26px rgba(0, 0, 0, 0.5);
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}

.post:hover {
  border-color: color-mix(in srgb, var(--tg-accent) 18%, var(--tg-border));
}

.post--pinned {
  border-color: color-mix(in srgb, var(--tg-gold) 38%, var(--tg-border));
  background: color-mix(in srgb, var(--tg-gold) 6%, var(--tg-surface));
}

.post__pin-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--tg-gold);
  background: color-mix(in srgb, var(--tg-gold) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--tg-gold) 28%, transparent);
}

.post__tier-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 650;
  color: var(--tg-muted);
  background: color-mix(in srgb, var(--tg-muted) 12%, transparent);
  border: 1px solid var(--tg-border);
}

.post__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 12px;
  margin-bottom: 10px;
  font-size: 0.82rem;
}

.post__avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid var(--tg-border);
}

.post__avatar--ph {
  background: color-mix(in srgb, var(--tg-border) 45%, transparent);
}

.post__meta-text {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  align-items: baseline;
}

.post__author {
  font-weight: 600;
  color: var(--tg-gold);
}

.post__time {
  color: var(--tg-muted);
}

.post__actions {
  margin-left: auto;
  flex-shrink: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.post__pin {
  padding: 5px 10px;
  border-radius: var(--tg-radius-sm);
  font-size: 0.78rem;
  font-weight: 600;
  border: 1px solid color-mix(in srgb, var(--tg-gold) 42%, var(--tg-border));
  background: color-mix(in srgb, var(--tg-gold) 10%, transparent);
  color: var(--tg-gold);
  cursor: pointer;
  font-family: inherit;
}

.post__pin:hover {
  background: color-mix(in srgb, var(--tg-gold) 18%, transparent);
  border-color: color-mix(in srgb, var(--tg-gold) 55%, var(--tg-border));
}

.post__del {
  padding: 5px 10px;
  border-radius: var(--tg-radius-sm);
  font-size: 0.78rem;
  font-weight: 600;
  border: 1px solid color-mix(in srgb, #f44336 45%, var(--tg-border));
  background: transparent;
  color: #e57373;
  cursor: pointer;
  font-family: inherit;
}

.post__del:hover {
  background: color-mix(in srgb, #f44336 12%, transparent);
  border-color: color-mix(in srgb, #f44336 55%, var(--tg-border));
}

.post__text {
  margin: 0 0 12px;
  font-size: 0.95rem;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}

.post__text--rich {
  white-space: normal;
}

.post__text--rich :deep(strong) {
  font-weight: 700;
  color: var(--tg-text);
}

.post__text--rich :deep(em) {
  font-style: italic;
}

.post__text--rich :deep(del) {
  opacity: 0.75;
  text-decoration: line-through;
}

.post__text--rich :deep(.post-code) {
  font-family: ui-monospace, 'Cascadia Code', 'Segoe UI Mono', monospace;
  font-size: 0.88em;
  padding: 0.12em 0.35em;
  border-radius: 6px;
  background: var(--tg-elevated);
  border: 1px solid var(--tg-border);
}

.post__text--rich :deep(.post-link) {
  color: var(--tg-accent);
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.post__text--rich :deep(.post-link:hover) {
  filter: brightness(1.08);
}

.post__text--rich :deep(.post-hr) {
  border: none;
  height: 1px;
  margin: 14px 0;
  background: linear-gradient(
    90deg,
    transparent,
    color-mix(in srgb, var(--tg-accent) 45%, var(--tg-border)),
    transparent
  );
}

.post__slider {
  margin: 0 0 12px;
}

.post__react {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.react-more-wrap {
  position: relative;
  flex-shrink: 0;
}

.react-more-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 36px;
  padding: 0;
  border-radius: 999px;
  border: 1px dashed color-mix(in srgb, var(--tg-muted) 50%, var(--tg-border));
  background: var(--tg-elevated);
  color: var(--tg-muted);
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    color 0.15s ease,
    background 0.15s ease;
}

.react-more-btn:hover,
.react-more-btn--open {
  border-style: solid;
  border-color: color-mix(in srgb, var(--tg-accent) 40%, var(--tg-border));
  color: var(--tg-gold);
  background: var(--tg-accent-soft);
}

.react-popover {
  position: absolute;
  z-index: 30;
  left: 0;
  bottom: 100%;
  margin-bottom: 8px;
  padding: 10px;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  min-width: 200px;
  max-width: min(92vw, 280px);
  border-radius: var(--tg-radius-md);
  border: 1px solid var(--tg-border);
  background: var(--tg-surface);
  box-shadow: 0 12px 40px -8px rgba(0, 0, 0, 0.55);
}

.react-popover__btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 6px;
  border-radius: var(--tg-radius-sm);
  border: 1px solid transparent;
  background: var(--tg-elevated);
  cursor: pointer;
  font-size: 0.65rem;
  color: var(--tg-muted);
}

.react-popover__btn:hover {
  border-color: var(--tg-accent-line);
}

.react-popover__btn--mine {
  border-color: color-mix(in srgb, var(--tg-accent) 45%, var(--tg-border));
  background: var(--tg-accent-soft);
}

.react-popover__emoji {
  font-size: 1.35rem;
  line-height: 1;
}

.react-popover__kind {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.react-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid var(--tg-border);
  background: var(--tg-elevated);
  color: var(--tg-text);
  font-size: 0.85rem;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.react-btn:hover {
  border-color: color-mix(in srgb, var(--tg-accent) 35%, var(--tg-border));
}

.react-btn--mine {
  border-color: color-mix(in srgb, var(--tg-accent) 55%, var(--tg-border));
  background: var(--tg-accent-soft);
}

.react-btn__emoji {
  line-height: 1;
}

.react-btn__cnt {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--tg-muted);
  min-width: 1ch;
}

.empty {
  margin: 0;
  padding: 24px;
  text-align: center;
  color: var(--tg-muted);
  font-size: 0.9rem;
  border-radius: var(--tg-radius-lg);
  border: 1px dashed var(--tg-border);
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 12px 22px;
  border-radius: var(--tg-radius-md);
  font-weight: 600;
  font-size: 0.92rem;
  border: none;
  cursor: pointer;
  transition: opacity 0.15s, transform 0.15s;
}

.btn--gold {
  color: var(--tg-on-accent);
  background: var(--tg-gradient-primary);
}

.btn--publish {
  color: var(--tg-on-accent);
  background: var(--tg-gradient-primary-strong);
  box-shadow: 0 6px 24px -6px var(--tg-glow);
}

.btn--publish:hover:not(:disabled) {
  filter: brightness(1.05);
  transform: translateY(-1px);
}

.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
