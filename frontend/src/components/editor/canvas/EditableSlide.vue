<script setup lang="ts">
import { computed, onBeforeUnmount, onErrorCaptured, onMounted, provide, ref, watch } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import type { Slide } from '@/api/types'
import { useSlideAnimationContext } from '@/composables/useSlideAnimation'
import { createPreview, type MotionPreview } from '@/motion/preview'
import SlideRenderError from '@/render/SlideRenderError.vue'
import TemplateSlideHost from '@/render/TemplateSlideHost.vue'
import { slideKind } from '@/render/slide-kind'
import { getElementAtSelection, type ElementSelection, type RawUi } from '@/slide-editor/model'
import { blankTableCellAt, blankTextAt } from '@/slide-editor/tiptapRuns'
import { useEditingShortcuts } from '@/slide-editor/useEditingShortcuts'
import { useSlideEditingContext } from '@/slide-editor/useSlideEditing'
import { useEditorStore } from '@/stores/editor'
import { EDITABLE_CANVAS_KEY } from './canvas-context'
import InlineTextEditor from './InlineTextEditor.vue'
import SelectionOverlay from './SelectionOverlay.vue'

const STAGE_W = 1280
const STAGE_H = 720

const props = withDefaults(
  defineProps<{ slide: Slide; theme?: unknown; fonts?: unknown; videoSrc?: string | null }>(),
  { theme: undefined, fonts: undefined, videoSrc: null },
)
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
// editor is open, the edited text (or table cell) is blanked underneath it (the editor shows it instead).
const renderUi = computed(() => {
  const base = editing.draftUi.value ?? props.slide.ui
  const edit = inlineEdit.value
  if (!edit || !base) return base
  return edit.target.kind === 'cell'
    ? blankTableCellAt(base as RawUi, edit.selection, edit.target)
    : blankTextAt(base as RawUi, edit.selection)
})

const editor = useEditorStore()
const animation = useSlideAnimationContext()
const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
const motionOpen = computed(() => editor.inspectorTab === 'motion' || editor.footerTab === 'motion')
// The motion preview runs on the current slide only; while it does, direct editing is off.
const previewing = computed(() => editor.motionTime !== null && current.value && kind.value === 'template')

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
// Nothing edits the slide while the motion preview owns its DOM.
useEditingShortcuts(editing, computed(() => current.value && !previewing.value))
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

// Motion preview. It is built only once the user plays or scrubs (it shows the FROM state at once), and it
// snapshots the targets' inline style, so it is rebuilt (never edited) when the tweens or the DOM change.
let preview: MotionPreview | null = null
function stopPreview() {
  preview?.restore()
  preview = null
}
function syncPreview() {
  const time = editor.motionTime
  // A stale plan names elements the slide no longer has (ids are positional): never preview it.
  if (time === null || !previewing.value || !animation || animation.stale?.value || failure.value) return stopPreview()
  if (!preview) {
    const root = host.value?.shadowRoot()
    if (!root) return
    preview = createPreview(root, animation.draft.value, { reducedMotion: reducedMotion.value })
  }
  preview.seek(time)
}
function rebuildPreview() {
  if (!preview) return
  stopPreview()
  syncPreview()
}
watch(() => editor.motionTime, syncPreview)
watch(previewing, (on) => {
  if (!on) return stopPreview()
  syncPreview()
})
// The preview owns the slide: no selection (and so no floating bar or inline edit) while it is live, however
// the selection is made (canvas, Layers panel).
watch(
  () => [previewing.value, editing.selection.value] as const,
  ([on, sel]) => {
    if (on && sel) editing.select(null)
  },
  { immediate: true },
)
watch(() => animation?.draft.value, rebuildPreview, { deep: true })
watch(() => animation?.stale?.value, rebuildPreview)
watch(reducedMotion, rebuildPreview)
watch(slideId, stopPreview)
// Leaving Motion ends the preview.
watch(motionOpen, (open) => {
  if (!open) editor.motionTime = null
})
onBeforeUnmount(stopPreview)

// The element picked in Motion gets the mockup's dashed outline (an attribute plus one shadow rule, so the
// preview's inline-style snapshot never captures it). Hidden while the preview plays.
const OUTLINE_CSS = '[data-motion-selected]{outline:2px dashed #648d9e;outline-offset:5px}'
function markSelected() {
  const root = host.value?.shadowRoot()
  if (!root) return
  root.querySelectorAll('[data-motion-selected]').forEach((el) => el.removeAttribute('data-motion-selected'))
  const id = editor.motionTarget
  if (!id || !motionOpen.value || editor.motionTime !== null || !current.value) return
  if (!root.querySelector('style[data-motion-outline]')) {
    const style = document.createElement('style')
    style.dataset.motionOutline = ''
    style.textContent = OUTLINE_CSS
    root.appendChild(style)
  }
  root.querySelectorAll(`[data-hf-el="${CSS.escape(id)}"]`).forEach((el) => el.setAttribute('data-motion-selected', ''))
}
watch(() => [editor.motionTarget, motionOpen.value, editor.motionTime, current.value], markSelected)

// A re-render (remote edit, refetch) replaces the slide DOM: mark it again and rebuild a live preview on it.
function onRendered() {
  markSelected()
  rebuildPreview()
  emit('rendered')
}

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
          :video-src="videoSrc"
          annotate
          @rendered="onRendered"
          @error="onFailed"
        />
      </div>
      <!-- Same scale as the stage, so the editor box and its font are in slide px. -->
      <div
        v-if="inlineEdit && editing.enabled.value && !failure && !previewing"
        data-inline-edit-layer
        class="pointer-events-none absolute top-0 left-0 z-20 origin-top-left"
        :style="{ width: `${STAGE_W}px`, height: `${STAGE_H}px`, transform: `scale(${scale})` }"
      >
        <InlineTextEditor :key="inlineEditKey" />
      </div>
    </div>
    <SelectionOverlay v-if="editing.enabled.value && current && !failure && !previewing" @open-editor="onOpenEditor" />
  </div>
</template>
