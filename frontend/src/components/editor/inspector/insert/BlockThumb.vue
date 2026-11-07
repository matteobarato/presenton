<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import TemplateSlideHost from '@/render/TemplateSlideHost.vue'
import type { TemplateBlock } from '@/slide-editor/insert/templateBlocks'

const STAGE_W = 1280
const STAGE_H = 720

const props = defineProps<{ block: TemplateBlock; theme: unknown; fonts: unknown }>()

const root = ref<HTMLElement | null>(null)
const width = ref<number | null>(null)
// The slide renders only once the tile is scrolled into view.
const visible = ref(typeof IntersectionObserver === 'undefined')
const ui = computed(() => ({ components: [props.block.raw] }))
const stageStyle = computed(() => ({
  width: `${STAGE_W}px`,
  height: `${STAGE_H}px`,
  transform: `scale(${(width.value ?? 0) / STAGE_W})`,
  opacity: width.value ? 1 : 0,
}))

let resizeObserver: ResizeObserver | undefined
let intersectionObserver: IntersectionObserver | undefined

onMounted(() => {
  const el = root.value
  if (!el) return
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver((entries) => {
      const rect = entries[entries.length - 1]?.contentRect
      if (rect) width.value = rect.width
    })
    resizeObserver.observe(el)
  } else {
    width.value = el.clientWidth || null
  }
  if (!visible.value) {
    intersectionObserver = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
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
  <div ref="root" class="pointer-events-none relative aspect-video w-full overflow-hidden bg-white" aria-hidden="true">
    <div
      class="absolute top-0 left-0 origin-top-left transition-opacity duration-200"
      :style="stageStyle"
    >
      <TemplateSlideHost v-if="visible" :ui="ui" :theme="theme" :fonts="fonts" />
    </div>
  </div>
</template>
