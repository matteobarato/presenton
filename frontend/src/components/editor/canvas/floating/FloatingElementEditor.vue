<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useElementBounding, useElementSize, useEventListener, useMediaQuery } from '@vueuse/core'
import type { Presentation, Slide } from '@/api/types'
import { selectionFrames } from '@/slide-editor/geometry'
import { STAGE_WIDTH } from '@/slide-editor/model'
import { aabb } from '@/slide-editor/rotation'
import { toolbarKind } from '@/slide-editor/toolbarKind'
import { useSlideEditingContext } from '@/slide-editor/useSlideEditing'
import { useEditorStore } from '@/stores/editor'
import { barFor, type BarContext } from './barItems'
import ContextBar from './ContextBar.vue'
import { floatingAnchor, type Rect } from './floatingAnchor'

/**
 * Screen-space host of the element bar. It covers the canvas section (never catching pointers itself),
 * finds the selection's bounds on screen and floats the bar next to them.
 */
const props = defineProps<{
  /** The slide box on screen (its width is the slide's scale). */
  stage: HTMLElement | null
  /** The canvas scroll container (a zoomed-in slide scrolls inside it). */
  scroller: HTMLElement | null
  presentation: Presentation
  presentationId: string
  slide: Slide | null
}>()

const ctx = useSlideEditingContext()
const editor = useEditorStore()

const layer = ref<HTMLElement | null>(null)
const barRef = ref<InstanceType<typeof ContextBar> | null>(null)

// Below this width the bar docks at the bottom of the canvas instead of following the selection.
const docked = useMediaQuery('(max-width: 760px)')

const MARGIN = 8
// A docked bar sits above the status row: its height (26px, 8px canvas padding when docked) plus 8px of air.
const DOCK_BOTTOM = 42
// The rotate handle sits below the selection (24px stem + 6px handle + 8px air); a half-turn puts it above.
const GAP_ROTATED = 44
// The slide tools float over the top of the canvas; the bar never goes under them.
const TOP_INSET = 54
// Until it is measured the bar is assumed to be about this big.
const FALLBACK_BAR = { width: 280, height: 43 }

const stageBox = useElementBounding(() => props.stage)
const layerBox = useElementBounding(layer)
// Scrolling a zoomed slide moves the stage without resizing it.
useEventListener(() => props.scroller, 'scroll', () => stageBox.update(), { passive: true })
// The canvas resizing can recentre a stage that kept its size (it is height-bound), so re-measure it too.
watch([layerBox.width, layerBox.height, layerBox.left, layerBox.top], () => stageBox.update(), { flush: 'post' })
const barEl = computed<HTMLElement | null>(() => (barRef.value?.$el as HTMLElement | undefined) ?? null)
const barSize = useElementSize(barEl, undefined, { box: 'border-box' })

const kind = computed(() => toolbarKind(ctx.ui.value, ctx.selection.value))
const items = computed(() => barFor(kind.value))
const context = computed<BarContext>(() => ({
  ctx,
  presentation: props.presentation,
  presentationId: props.presentationId,
  slide: props.slide,
  locked: editor.locked,
}))

/** The selection's axis-aligned bounds (rotation included) in slide px. */
const slideBounds = computed<Rect | null>(() => {
  const ui = ctx.ui.value
  if (!ui || !ctx.selection.value) return null
  const boxes = selectionFrames(ui, ctx.selection.value).map(aabb)
  if (!boxes.length) return null
  const left = Math.min(...boxes.map((b) => b.x))
  const top = Math.min(...boxes.map((b) => b.y))
  const right = Math.max(...boxes.map((b) => b.x + b.width))
  const bottom = Math.max(...boxes.map((b) => b.y + b.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
})

/** True when the selected frame's rotate handle ends up above it (a rotation between 90 and 270 degrees). */
const handleAbove = computed(() => {
  const ui = ctx.ui.value
  if (!ui || !ctx.selection.value) return false
  const frames = selectionFrames(ui, ctx.selection.value)
  if (frames.length !== 1) return false
  const deg = (((frames[0]!.rotation % 360) + 360) % 360)
  return deg >= 90 && deg <= 270
})

const visible = computed(
  () => ctx.enabled.value && !ctx.gestureActive.value && !!props.stage && !!slideBounds.value && stageBox.width.value > 0,
)

/** The bounds in layer px: scaled by the slide's on-screen width and offset by where the stage sits in the layer. */
const target = computed<Rect | null>(() => {
  const b = slideBounds.value
  if (!b) return null
  const scale = stageBox.width.value / STAGE_WIDTH
  return {
    x: stageBox.left.value - layerBox.left.value + b.x * scale,
    y: stageBox.top.value - layerBox.top.value + b.y * scale,
    width: b.width * scale,
    height: b.height * scale,
  }
})

const placed = computed(() => {
  const t = target.value
  const bar = { width: barSize.width.value || FALLBACK_BAR.width, height: barSize.height.value || FALLBACK_BAR.height }
  const viewport = { width: layerBox.width.value, height: layerBox.height.value }
  if (docked.value) {
    return { x: (viewport.width - bar.width) / 2, y: viewport.height - bar.height - DOCK_BOTTOM, placement: 'dock' as const }
  }
  if (!t) return null
  // Placed in the area under the slide tools: shift the target up by the inset and the result back down.
  const r = floatingAnchor({
    target: { ...t, y: t.y - TOP_INSET },
    viewport: { width: viewport.width, height: viewport.height - TOP_INSET },
    bar,
    margin: MARGIN,
    ...(handleAbove.value ? { gapAbove: GAP_ROTATED } : {}),
  })
  return { x: r.x, y: r.y + TOP_INSET, placement: r.placement }
})

const style = computed(() => ({
  left: `${Math.round(placed.value?.x ?? 0)}px`,
  top: `${Math.round(placed.value?.y ?? 0)}px`,
}))

// One popover at a time; it belongs to the selection it was opened for and to the idle (no gesture) bar.
const openPanel = ref<string | null>(null)
const selectionKey = computed(() => JSON.stringify(ctx.selection.value))
// A selection change made from inside the open panel (Contains drill-down, Bring forward) keeps the panel
// open when the new selection still offers it; any other change (canvas click, Layers row) closes it.
let lastPanelClick = 0
useEventListener(
  window,
  'click',
  (e: MouseEvent) => {
    if ((e.target as HTMLElement | null)?.closest?.('[data-floating-panel]')) lastPanelClick = performance.now()
  },
  { capture: true },
)
watch(selectionKey, () => {
  const id = openPanel.value
  const fromPanel = performance.now() - lastPanelClick < 400
  const stillOffered = items.value.some((i) => i.type === 'panel' && i.id === id)
  if (!(fromPanel && stillOffered)) openPanel.value = null
})
watch(visible, (v) => {
  if (!v) openPanel.value = null
})

// Escape closes an open popover first. The popover may already be gone when the slide's Esc handler
// runs (it unmounts between listeners), so the guard tells that handler to leave the selection alone.
useEventListener(
  window,
  'keydown',
  (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || openPanel.value === null) return
    editor.panelEscapeGuard = true
    setTimeout(() => (editor.panelEscapeGuard = false), 0)
  },
  { capture: true },
)
</script>

<template>
  <div ref="layer" class="pointer-events-none absolute inset-0 z-20">
    <ContextBar
      v-if="visible && placed"
      ref="barRef"
      v-model:open-panel="openPanel"
      class="pointer-events-auto absolute"
      :style="style"
      :data-placement="placed.placement"
      :items="items"
      :context="context"
      :side="docked ? 'top' : 'bottom'"
    />
  </div>
</template>
