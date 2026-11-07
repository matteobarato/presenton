<script setup lang="ts">
import { computed, onBeforeUnmount, onErrorCaptured, onMounted, provide, ref, watch } from 'vue'
import type { Slide } from '@/api/types'
import SlideRenderError from '@/render/SlideRenderError.vue'
import TemplateSlideHost from '@/render/TemplateSlideHost.vue'
import { slideKind } from '@/render/slide-kind'
import { getElementAtSelection, type ElementSelection, type RawUi } from '@/slide-editor/model'
import { blankTextAt } from '@/slide-editor/tiptapRuns'
import { useEditingShortcuts } from '@/slide-editor/useEditingShortcuts'
import { useSlideEditingContext } from '@/slide-editor/useSlideEditing'
import { EDITABLE_CANVAS_KEY } from './canvas-context'
import InlineTextEditor from './InlineTextEditor.vue'
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
const slideId = computed(() => props.slide.id ?? null)
// The inline edit open on this slide, if any.
const inlineEdit = computed(() => {
  const edit = editing.inlineEdit.value
  return edit && edit.slideId === slideId.value ? edit : null
})
// One editor instance per edit, even when the same element is reopened at once.
const editKeys = new WeakMap<object, number>()
let editSeq = 0
const inlineEditKey = computed(() => {
  const edit = inlineEdit.value
  if (!edit) return 0
  if (!editKeys.has(edit)) editKeys.set(edit, ++editSeq)
  return editKeys.get(edit)!
})
// The draft (resize preview, just-committed ui) wins over this slide's committed ui; the draft is
// dropped on slide change, so a slide fading out never shows its successor's ui. While the inline
// editor is open, the edited text is blanked underneath it (the editor shows it instead).
const renderUi = computed(() => {
  const base = editing.draftUi.value ?? props.slide.ui
  const edit = inlineEdit.value
  return edit && base ? blankTextAt(base as RawUi, edit.selection) : base
})

const scale = computed(() => (width.value && width.value > 0 ? width.value / STAGE_W : 1))
const stageStyle = computed(() => ({
  width: `${STAGE_W}px`,
  height: `${STAGE_H}px`,
  transform: `scale(${scale.value})`,
  // With a ResizeObserver, stay hidden until the first measurement so the unscaled stage never flashes.
  opacity: width.value == null && typeof ResizeObserver !== 'undefined' ? 0 : 1,
}))

// The context follows the canvas's current slide; a slide fading out after a switch is not it.
const current = computed(() => editing.slideId.value === slideId.value)
// Only the current slide handles keys; a slide fading out must not double-handle them.
useEditingShortcuts(editing, current)
provide(EDITABLE_CANVAS_KEY, { layerFor: (source) => host.value?.layerFor(source) ?? null, slideId })

// Text and text-list elements edit in place; every double-click is still reported.
function onOpenEditor(sel: ElementSelection) {
  const ui = editing.ui.value
  const type = ui ? getElementAtSelection(ui, sel)?.type : null
  if (type === 'text' || type === 'text-list') editing.requestInlineEdit(sel)
  emit('open-editor', sel)
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
  <!-- Not clipped itself: the overlay's edge handles reach past the slide. The slide and the inline
       editor are clipped to the (rounded) slide box by the inner layer. -->
  <div
    ref="root"
    :data-slide-id="slide.id"
    class="relative w-full bg-white"
    :style="{ aspectRatio: '16 / 9' }"
  >
    <div data-slide-clip class="absolute inset-0 overflow-hidden rounded-[inherit]">
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
      <!-- Same scale as the stage, so the editor box and its font are in slide px. -->
      <div
        v-if="inlineEdit && editing.enabled.value && !failure"
        data-inline-edit-layer
        class="pointer-events-none absolute top-0 left-0 z-20 origin-top-left"
        :style="{ width: `${STAGE_W}px`, height: `${STAGE_H}px`, transform: `scale(${scale})` }"
      >
        <InlineTextEditor :key="inlineEditKey" />
      </div>
    </div>
    <SelectionOverlay v-if="editing.enabled.value && current && !failure" @open-editor="onOpenEditor" />
  </div>
</template>
