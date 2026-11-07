<script setup lang="ts">
import { computed, onBeforeUnmount, onErrorCaptured, onMounted, provide, ref, watch } from 'vue'
import type { Slide } from '@/api/types'
import SlideRenderError from '@/render/SlideRenderError.vue'
import TemplateSlideHost from '@/render/TemplateSlideHost.vue'
import { slideKind } from '@/render/slide-kind'
import type { ElementSelection } from '@/slide-editor/model'
import { useSlideEditingContext } from '@/slide-editor/useSlideEditing'
import { EDITABLE_CANVAS_KEY } from './canvas-context'
import SelectionOverlay from './SelectionOverlay.vue'

const STAGE_W = 1280
const STAGE_H = 720

const props = withDefaults(defineProps<{ slide: Slide; theme?: unknown; fonts?: unknown }>(), {
  theme: undefined,
  fonts: undefined,
})
const emit = defineEmits<{ rendered: []; error: [message: string]; 'open-editor': [sel: ElementSelection] }>()

const editing = useSlideEditingContext()

const root = ref<HTMLElement | null>(null)
const host = ref<InstanceType<typeof TemplateSlideHost> | null>(null)
const width = ref<number | null>(null)
const failure = ref<string | null>(null)

const kind = computed(() => slideKind(props.slide))
// The draft (resize preview, just-committed ui) wins over this slide's committed ui; the draft is
// dropped on slide change, so a slide fading out never shows its successor's ui.
const renderUi = computed(() => editing.draftUi.value ?? props.slide.ui)

const scale = computed(() => (width.value && width.value > 0 ? width.value / STAGE_W : 1))
const stageStyle = computed(() => ({
  width: `${STAGE_W}px`,
  height: `${STAGE_H}px`,
  transform: `scale(${scale.value})`,
  // With a ResizeObserver, stay hidden until the first measurement so the unscaled stage never flashes.
  opacity: width.value == null && typeof ResizeObserver !== 'undefined' ? 0 : 1,
}))

const slideId = computed(() => props.slide.id ?? null)
// The context follows the canvas's current slide; a slide fading out after a switch is not it.
const current = computed(() => editing.slideId.value === slideId.value)
provide(EDITABLE_CANVAS_KEY, { layerFor: (source) => host.value?.layerFor(source) ?? null, slideId })

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
watch(
  kind,
  (k) => {
    if (k === 'blank' || k === 'empty') emit('rendered')
  },
  { immediate: true },
)

let resizeObserver: ResizeObserver | undefined
onMounted(() => {
  if (!root.value || typeof ResizeObserver === 'undefined') return
  resizeObserver = new ResizeObserver((entries) => {
    const rect = entries[entries.length - 1]?.contentRect
    if (rect) width.value = rect.width
  })
  resizeObserver.observe(root.value)
})
onBeforeUnmount(() => resizeObserver?.disconnect())
</script>

<template>
  <div
    ref="root"
    :data-slide-id="slide.id"
    class="relative w-full overflow-hidden bg-white"
    :style="{ aspectRatio: '16 / 9' }"
  >
    <div data-slide-stage class="absolute top-0 left-0 origin-top-left overflow-hidden bg-white" :style="stageStyle">
      <SlideRenderError v-if="failure" :message="failure" />
      <TemplateSlideHost
        v-else-if="kind === 'template'"
        ref="host"
        :ui="renderUi"
        :theme="theme"
        :fonts="fonts"
        annotate
        @rendered="emit('rendered')"
        @error="onFailed"
      />
    </div>
    <SelectionOverlay v-if="editing.enabled.value && current && !failure" @open-editor="emit('open-editor', $event)" />
  </div>
</template>
