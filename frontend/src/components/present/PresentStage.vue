<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { Slide } from '@/api/types'
import SlideView from '@/render/SlideView.vue'
import AvatarLayer from './AvatarLayer.vue'

const STAGE_W = 1280
const STAGE_H = 720

defineProps<{
  slide: Slide
  theme?: unknown
  fonts?: unknown
  reducedMotion: boolean
  avatar: { src: string; rect: { x: number; y: number; width: number; height: number } } | null
  playing: boolean
}>()

const root = ref<HTMLElement | null>(null)
const box = ref({ width: window.innerWidth, height: window.innerHeight })

/** The largest 16:9 stage that fits the screen; the slide and the avatar share this factor. */
const scale = computed(() => Math.min(box.value.width / STAGE_W, box.value.height / STAGE_H) || 1)

let observer: ResizeObserver | undefined
function measure() {
  const el = root.value
  if (el && el.clientWidth > 0 && el.clientHeight > 0) box.value = { width: el.clientWidth, height: el.clientHeight }
  else box.value = { width: window.innerWidth, height: window.innerHeight }
}
onMounted(() => {
  measure()
  if (typeof ResizeObserver !== 'undefined' && root.value) {
    observer = new ResizeObserver(measure)
    observer.observe(root.value)
  } else window.addEventListener('resize', measure)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  window.removeEventListener('resize', measure)
})
</script>

<template>
  <div ref="root" class="flex h-full w-full items-center justify-center">
    <div
      data-present-stage
      :data-transition="reducedMotion ? 'present-fade' : 'present-change'"
      class="relative"
      :style="{ width: `${STAGE_W * scale}px`, height: `${STAGE_H * scale}px` }"
    >
      <Transition :name="reducedMotion ? 'present-fade' : 'present-change'">
        <SlideView :key="slide.id ?? slide.index" :slide="slide" :theme="theme" :fonts="fonts" :scale="scale" class="absolute inset-0" />
      </Transition>
      <AvatarLayer v-if="avatar" :src="avatar.src" :rect="avatar.rect" :scale="scale" :playing="playing" />
    </div>
  </div>
</template>
