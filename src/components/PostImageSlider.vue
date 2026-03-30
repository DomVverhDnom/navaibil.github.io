<script setup>
import { computed, ref, watch, onUnmounted } from 'vue'
import { Swiper, SwiperSlide } from 'swiper/vue'
import { Navigation, Pagination } from 'swiper/modules'
import { mediaUrl } from '../lib/mediaUrl'
import 'swiper/css'
import 'swiper/css/navigation'
import 'swiper/css/pagination'

const props = defineProps({
  paths: { type: Array, default: () => [] },
})

const list = computed(() => (Array.isArray(props.paths) ? props.paths : []))
const modules = [Navigation, Pagination]
const many = computed(() => list.value.length > 1)
const loopSlides = computed(() => list.value.length > 2)

const swiperRef = ref(null)
const lightboxOpen = ref(false)
const lightboxIndex = ref(0)

function setSwiper(s) {
  swiperRef.value = s
}

function currentSlideIndex() {
  const s = swiperRef.value
  if (!s) return 0
  const ri = typeof s.realIndex === 'number' ? s.realIndex : s.activeIndex
  return Math.max(0, Math.min(ri ?? 0, list.value.length - 1))
}

function openLightbox() {
  if (!list.value.length) return
  lightboxIndex.value = currentSlideIndex()
  lightboxOpen.value = true
}

function closeLightbox() {
  lightboxOpen.value = false
}

function lightboxPrev() {
  const n = list.value.length
  if (n < 2) return
  lightboxIndex.value = (lightboxIndex.value - 1 + n) % n
}

function lightboxNext() {
  const n = list.value.length
  if (n < 2) return
  lightboxIndex.value = (lightboxIndex.value + 1) % n
}

function onLightboxKey(e) {
  if (!lightboxOpen.value) return
  if (e.key === 'Escape') {
    e.preventDefault()
    closeLightbox()
  } else if (e.key === 'ArrowLeft') {
    lightboxPrev()
  } else if (e.key === 'ArrowRight') {
    lightboxNext()
  }
}

watch(lightboxOpen, (v) => {
  if (v) {
    window.addEventListener('keydown', onLightboxKey)
    document.body.style.overflow = 'hidden'
  } else {
    window.removeEventListener('keydown', onLightboxKey)
    document.body.style.overflow = ''
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', onLightboxKey)
  document.body.style.overflow = ''
})
</script>

<template>
  <figure v-if="list.length" class="post-swiper-fig">
    <Swiper
      class="post-swiper"
      :modules="modules"
      :slides-per-view="1"
      :space-between="0"
      :loop="loopSlides"
      :watch-overflow="true"
      :navigation="many"
      :pagination="
        many
          ? {
              clickable: true,
              dynamicBullets: list.length > 5,
            }
          : false
      "
      @swiper="setSwiper"
    >
      <SwiperSlide v-for="(pth, i) in list" :key="`${i}-${pth}`">
        <div class="post-swiper__slide">
          <button
            type="button"
            class="post-swiper__fs"
            title="На весь экран"
            aria-label="Открыть изображение на весь экран"
            @click.stop="openLightbox"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
          </button>
          <button
            type="button"
            class="post-swiper__img-btn"
            title="На весь экран"
            aria-label="Открыть изображение на весь экран"
            @click="openLightbox"
          >
            <img :src="mediaUrl(pth)" alt="" class="post-swiper__img" loading="lazy" />
          </button>
        </div>
      </SwiperSlide>
    </Swiper>

    <Teleport to="body">
      <div
        v-if="lightboxOpen"
        class="lightbox"
        role="dialog"
        aria-modal="true"
        aria-label="Просмотр изображения"
        @click.self="closeLightbox"
      >
        <button type="button" class="lightbox__close" aria-label="Закрыть" @click="closeLightbox">
          ×
        </button>
        <button
          v-if="many"
          type="button"
          class="lightbox__nav lightbox__nav--prev"
          aria-label="Предыдущее"
          @click.stop="lightboxPrev"
        >
          ‹
        </button>
        <div class="lightbox__frame" @click.stop>
          <img
            :src="mediaUrl(list[lightboxIndex])"
            alt=""
            class="lightbox__img"
            draggable="false"
          />
        </div>
        <button
          v-if="many"
          type="button"
          class="lightbox__nav lightbox__nav--next"
          aria-label="Следующее"
          @click.stop="lightboxNext"
        >
          ›
        </button>
        <p v-if="many" class="lightbox__hint">{{ lightboxIndex + 1 }} / {{ list.length }} · Esc — закрыть</p>
        <p v-else class="lightbox__hint">Esc — закрыть · клик вне фото — закрыть</p>
      </div>
    </Teleport>
  </figure>
</template>

<style scoped>
.post-swiper-fig {
  margin: 0;
  border-radius: var(--tg-radius-md);
  overflow: hidden;
  border: 1px solid var(--tg-border);
  background: var(--tg-bg);
}

.post-swiper {
  position: relative;
  /* размер шеврона внутри кнопок навигации */
  --swiper-navigation-size: 9px;
  --swiper-navigation-color: var(--tg-text);
  --swiper-pagination-color: var(--tg-accent);
  --swiper-pagination-bullet-inactive-color: var(--tg-muted);
  --swiper-pagination-bullet-inactive-opacity: 0.45;
}

.post-swiper__slide {
  cursor: pointer;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  background: var(--tg-surface);
}

.post-swiper__fs {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border-radius: var(--tg-radius-sm);
  border: 1px solid var(--tg-border);
  background: color-mix(in srgb, var(--tg-surface) 88%, transparent);
  color: var(--tg-text);
  cursor: pointer;
  backdrop-filter: blur(6px);
}

.post-swiper__fs:hover {
  color: var(--tg-accent);
  border-color: color-mix(in srgb, var(--tg-accent) 35%, var(--tg-border));
}

.post-swiper__img-btn {
  display: block;
  width: 100%;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  font: inherit;
  color: inherit;
}

.post-swiper__img {
  display: block;
  width: 100%;
  max-height: 520px;
  object-fit: contain;
}

.post-swiper :deep(.swiper-button-prev),
.post-swiper :deep(.swiper-button-next) {
  width: 22px;
  height: 22px;
  margin-top: 0;
  z-index: 4;
  top: 50%;
  transform: translateY(-50%);
}

.post-swiper :deep(.swiper-button-prev) {
  left: 6px;
}

.post-swiper :deep(.swiper-button-next) {
  right: 6px;
}

.post-swiper :deep(.swiper-button-prev::after),
.post-swiper :deep(.swiper-button-next::after) {
  font-size: 9px;
  font-weight: 800;
}

.post-swiper :deep(.swiper-pagination) {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 3;
  margin: 0;
  padding: 8px 8px 10px;
  background: linear-gradient(to top, color-mix(in srgb, var(--tg-surface) 92%, transparent), transparent);
  border-top: none;
  pointer-events: none;
}

.post-swiper :deep(.swiper-pagination-bullet) {
  pointer-events: auto;
  border: 1px solid var(--tg-border);
}

/* Лайтбокс (Teleport → body, глобальные стили) */
.lightbox {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px 56px 40px;
  background: color-mix(in srgb, #000 88%, transparent);
  box-sizing: border-box;
}

.lightbox__frame {
  max-width: 100%;
  max-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.lightbox__img {
  max-width: min(100vw - 32px, 100%);
  max-height: min(100dvh - 100px, 100%);
  width: auto;
  height: auto;
  object-fit: contain;
  border-radius: var(--tg-radius-sm);
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.55);
}

.lightbox__close {
  position: absolute;
  top: 12px;
  right: 16px;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: var(--tg-radius-sm);
  background: color-mix(in srgb, var(--tg-surface) 55%, transparent);
  color: var(--tg-text);
  font-size: 1.75rem;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.lightbox__close:hover {
  background: color-mix(in srgb, var(--tg-surface) 75%, transparent);
  color: var(--tg-accent);
}

.lightbox__nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid var(--tg-border);
  background: color-mix(in srgb, var(--tg-surface) 70%, transparent);
  color: var(--tg-text);
  font-size: 1.25rem;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  backdrop-filter: blur(8px);
}

.lightbox__nav:hover {
  color: var(--tg-accent);
}

.lightbox__nav--prev {
  left: 12px;
}

.lightbox__nav--next {
  right: 12px;
}

.lightbox__hint {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  margin: 0;
  font-size: 0.78rem;
  color: rgba(255, 255, 255, 0.65);
  text-align: center;
  pointer-events: none;
  max-width: 90vw;
}
</style>
