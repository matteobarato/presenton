<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { AnimationTween, Slide } from '@/api/types'
import { createPreview, type MotionPreview } from '@/motion/preview'
import SlideView from '@/render/SlideView.vue'
import AvatarLayer from './AvatarLayer.vue'

const STAGE_W = 1280
const STAGE_H = 720

const props = withDefaults(defineProps<{
  slide: Slide
  theme?: unknown
  fonts?: unknown
  reducedMotion: boolean
  /** The slide's stored entrance plan; played once each time the slide appears. */
  tweens?: AnimationTween[]
  avatar: { src: string; rect: { x: number; y: number; width: number; height: number } } | null
  playing: boolean
}>(), { tweens: () => [] })

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
  stopMotion()
})

// The entrance plan plays on the slide's own DOM (the same GSAP calls as the editor preview and the
// export), once the slide has rendered. A new slide, new tweens or leaving present mode restores the DOM.
const slideView = ref<{ $el: HTMLElement } | null>(null)
// Counts renders of the current slide: turning on `annotate` (when the plan arrives) re-renders the host.
const renders = ref(0)
let motion: MotionPreview | null = null

function stopMotion() {
  motion?.dispose()
  motion = null
}

function startMotion() {
  stopMotion()
  if (!renders.value || !props.tweens.length) return
  const stage = slideView.value?.$el?.querySelector('[data-slide-stage]')
  const host = stage ? Array.from(stage.querySelectorAll<HTMLElement>('*')).find((el) => el.shadowRoot) : undefined
  if (!host?.shadowRoot) return
  motion = createPreview(host.shadowRoot, props.tweens, { reducedMotion: props.reducedMotion })
  motion.play()
}

watch(
  () => props.slide.id ?? props.slide.index,
  () => {
    renders.value = 0
    stopMotion()
  },
)
watch([renders, () => props.tweens], startMotion)
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
        <SlideView
          :key="slide.id ?? slide.index"
          ref="slideView"
          :slide="slide"
          :theme="theme"
          :fonts="fonts"
          :scale="scale"
          :annotate="tweens.length > 0"
          class="absolute inset-0"
          @rendered="renders++"
        />
      </Transition>
      <AvatarLayer v-if="avatar" :src="avatar.src" :rect="avatar.rect" :scale="scale" :playing="playing" />
    </div>
  </div>
</template>
