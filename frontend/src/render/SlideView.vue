<script setup lang="ts">
import { computed, onBeforeUnmount, onErrorCaptured, onMounted, ref, watch } from 'vue'
import type { Slide } from '@/api/types'
import SlideRenderError from '@/render/SlideRenderError.vue'
import SmartSlideFrame from '@/render/SmartSlideFrame.vue'
import TemplateSlideHost from '@/render/TemplateSlideHost.vue'
import { slideKind } from '@/render/slide-kind'

const STAGE_W = 1280
const STAGE_H = 720

const props = withDefaults(
  defineProps<{
    slide: Slide
    theme?: unknown
    fonts?: unknown
    fit?: 'contain' | 'width'
    scale?: number
    lazy?: boolean
    annotate?: boolean
  }>(),
  { theme: undefined, fonts: undefined, fit: 'contain', scale: undefined, lazy: false, annotate: false },
)
const emit = defineEmits<{ rendered: []; error: [message: string] }>()

const root = ref<HTMLElement | null>(null)
const box = ref<{ width: number; height: number } | null>(null)
const visible = ref(!props.lazy || typeof IntersectionObserver === 'undefined')
const failure = ref<string | null>(null)

const kind = computed(() => slideKind(props.slide))

const stageScale = computed(() => {
  if (props.scale != null) return props.scale
  if (!box.value || box.value.width <= 0) return 1
  const byWidth = box.value.width / STAGE_W
  if (props.fit === 'width' || box.value.height <= 0) return byWidth
  return Math.min(byWidth, box.value.height / STAGE_H)
})

const rootStyle = computed(() =>
  props.scale != null
    ? { width: `${STAGE_W * props.scale}px`, height: `${STAGE_H * props.scale}px` }
    : {},
)
const stageStyle = computed(() => {
  const s = stageScale.value
  const offsetX = box.value && props.scale == null ? Math.max(0, (box.value.width - STAGE_W * s) / 2) : 0
  return {
    width: `${STAGE_W}px`,
    height: `${STAGE_H}px`,
    left: `${offsetX}px`,
    transform: `scale(${s})`,
  }
})

function onRendered() {
  emit('rendered')
}
function onFailed(message: string) {
  failure.value = message
  emit('error', message)
}

onErrorCaptured((error) => {
  onFailed(error instanceof Error ? error.message : String(error))
  return false
})

watch(
  () => [props.slide, props.theme, props.fonts],
  () => {
    failure.value = null
  },
)

let resizeObserver: ResizeObserver | undefined
let intersectionObserver: IntersectionObserver | undefined

onMounted(() => {
  const el = root.value
  if (!el) return
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver((entries) => {
      const rect = entries[entries.length - 1]?.contentRect
      if (rect) box.value = { width: rect.width, height: rect.height }
    })
    resizeObserver.observe(el)
  }
  if (props.lazy && typeof IntersectionObserver !== 'undefined') {
    intersectionObserver = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        visible.value = true
        intersectionObserver?.disconnect()
      }
    })
    intersectionObserver.observe(el)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  intersectionObserver?.disconnect()
})
</script>

<template>
  <div
    ref="root"
    :data-slide-id="slide.id"
    class="relative w-full overflow-hidden bg-white"
    :style="[{ aspectRatio: '16 / 9' }, rootStyle]"
  >
    <div data-slide-stage class="absolute top-0 origin-top-left overflow-hidden bg-white" :style="stageStyle">
      <SlideRenderError v-if="failure" :message="failure" />
      <template v-else-if="visible">
        <TemplateSlideHost
          v-if="kind === 'template'"
          :ui="slide.ui"
          :theme="theme"
          :fonts="fonts"
          :annotate="annotate"
          @rendered="onRendered"
          @error="onFailed"
        />
        <SmartSlideFrame
          v-else-if="kind === 'smart'"
          :html="slide.html_content ?? ''"
          :theme="theme"
          :fonts="fonts"
          @rendered="onRendered"
          @error="onFailed"
        />
      </template>
    </div>
  </div>
</template>
