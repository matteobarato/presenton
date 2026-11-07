<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { hitComponent, hitDeepest, selectionBoxes, toSlidePoint } from '@/slide-editor/geometry'
import {
  absoluteBoxForSelection,
  selectionWithComponentToggle,
  STAGE_HEIGHT,
  STAGE_WIDTH,
  type Box,
  type ElementSelection,
  type Point,
  type RawUi,
  type Selection,
} from '@/slide-editor/model'
import { useSlideEditingContext } from '@/slide-editor/useSlideEditing'
import { useEditableCanvas } from './canvas-context'
import {
  applyMove,
  applyResize,
  DRAG_START_PX,
  HANDLES,
  layerSource,
  moveDelta,
  moveItems,
  planMove,
  SNAP_DISTANCE_PX,
  type Handle,
  type MoveItem,
  type MovePlan,
} from './gestures'

const emit = defineEmits<{ 'open-editor': [sel: ElementSelection] }>()

const editing = useSlideEditingContext()
const canvas = useEditableCanvas()

const el = ref<HTMLElement | null>(null)
const hover = shallowRef<Selection>(null)

interface MoveGesture {
  type: 'move'
  slideId: string | null
  pointerId: number
  ui: RawUi
  startClient: Point
  /** Screen px per slide px when the press started. */
  scale: number
  items: MoveItem[]
  plan: MovePlan | null
  started: boolean
  delta: Point
  layers: HTMLElement[]
}
interface ResizeGesture {
  type: 'resize'
  slideId: string | null
  pointerId: number
  ui: RawUi
  sel: Selection
  handle: Handle
  startClient: Point
  scale: number
  last: { client: Point; shift: boolean }
  frame: number | null
  moved: boolean
}
let gesture: MoveGesture | ResizeGesture | null = null
// Mirrored into the context: the inspector waits for the release before it opens (and resizes the canvas).
function setGesture(g: MoveGesture | ResizeGesture | null) {
  gesture = g
  editing.gestureActive.value = g != null
}
// Mirrors a running move for the template (the gesture itself is not reactive).
const dragging = ref(false)
const dragDelta = ref<Point>({ x: 0, y: 0 })

// Inert unless the editing context is on this canvas's slide.
const active = computed(() => editing.slideId.value != null && editing.slideId.value === canvas.slideId.value)
const ui = computed(() => (active.value ? editing.ui.value : null))
const selection = computed(() => editing.selection.value)

const selected = computed(() => {
  const u = ui.value
  if (!u) return []
  const offset = dragDelta.value
  return selectionBoxes(u, selection.value).map((b) => ({ ...b, x: b.x + offset.x, y: b.y + offset.y }))
})
const showHandles = computed(
  () => !dragging.value && selected.value.length === 1 && selection.value?.kind !== 'multi-component',
)
const hoverBox = computed<Box | null>(() => {
  const u = ui.value
  const h = hover.value
  if (!u || !h || dragging.value) return null
  const sel = selection.value
  if (sel && JSON.stringify(sel) === JSON.stringify(h)) return null
  if (sel?.kind === 'multi-component' && h.kind === 'component' && sel.componentIndexes.includes(h.componentIndex)) {
    return null
  }
  return absoluteBoxForSelection(u, h)
})

const pct = (v: number, of: number) => `${(v / of) * 100}%`
function boxStyle(b: Box) {
  return {
    left: pct(b.x, STAGE_WIDTH),
    top: pct(b.y, STAGE_HEIGHT),
    width: pct(b.width, STAGE_WIDTH),
    height: pct(b.height, STAGE_HEIGHT),
  }
}
function handleStyle(b: Box, h: Handle) {
  const x = h.includes('w') ? b.x : h.includes('e') ? b.x + b.width : b.x + b.width / 2
  const y = h.startsWith('n') ? b.y : h.startsWith('s') ? b.y + b.height : b.y + b.height / 2
  return { left: pct(x, STAGE_WIDTH), top: pct(y, STAGE_HEIGHT) }
}
const HANDLE_CURSOR: Record<Handle, string> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
}
const guideStyles = computed(() =>
  editing.guides.value.map((g) =>
    g.axis === 'vertical'
      ? { left: pct(g.coordinate, STAGE_WIDTH), top: pct(g.start, STAGE_HEIGHT), height: pct(g.end - g.start, STAGE_HEIGHT), width: '1px' }
      : { top: pct(g.coordinate, STAGE_HEIGHT), left: pct(g.start, STAGE_WIDTH), width: pct(g.end - g.start, STAGE_WIDTH), height: '1px' },
  ),
)

function measure() {
  const rect = el.value!.getBoundingClientRect()
  return { rect, scale: rect.width > 0 ? rect.width / STAGE_WIDTH : 1 }
}

/**
 * The press prevents its default (no text selection, no native drag), which also keeps focus where
 * it was, e.g. in the notes or the Ask input, where Delete and the arrows would then go. Move focus
 * to the canvas instead, so the editing shortcuts follow what the user pressed.
 */
function takeFocus() {
  if (document.activeElement !== el.value) el.value?.focus({ preventScroll: true })
}

function capture(pointerId: number) {
  try {
    el.value?.setPointerCapture?.(pointerId)
  } catch {
    // jsdom and synthetic events have no active pointer to capture.
  }
}

function listenForEnd() {
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerCancel)
}
function stopListening() {
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerCancel)
}

function selectionAfterPress(u: RawUi, p: Point, shift: boolean): Selection {
  const hit = hitComponent(u, p)
  const current = selection.value
  if (!hit) return null
  if (shift) return selectionWithComponentToggle(current, hit, { additive: true })
  if (current?.kind === 'multi-component' && hit.kind === 'component' && current.componentIndexes.includes(hit.componentIndex)) {
    return current
  }
  // A deeper element picked by double-click stays selected while pressed inside it.
  if (current?.kind === 'element') {
    const box = absoluteBoxForSelection(u, current)
    if (box && p.x >= box.x && p.x <= box.x + box.width && p.y >= box.y && p.y <= box.y + box.height) return current
  }
  return hit
}

function onPointerDown(e: PointerEvent) {
  if (e.button !== 0 || gesture) return
  const u = ui.value
  if (!u) return
  takeFocus()
  const { rect, scale } = measure()
  const p = toSlidePoint(e.clientX, e.clientY, rect)
  const next = selectionAfterPress(u, p, e.shiftKey)
  editing.select(next)
  hover.value = null
  // Shift-click only toggles the multi-selection.
  const items = e.shiftKey ? [] : moveItems(next, u)
  if (items.length === 0) return
  e.preventDefault()
  setGesture({
    type: 'move',
    slideId: editing.slideId.value,
    pointerId: e.pointerId,
    ui: u,
    startClient: { x: e.clientX, y: e.clientY },
    scale,
    items,
    plan: null,
    started: false,
    delta: { x: 0, y: 0 },
    layers: [],
  })
  capture(e.pointerId)
  listenForEnd()
}

function onHandleDown(e: PointerEvent, handle: Handle) {
  if (e.button !== 0 || gesture) return
  e.stopPropagation()
  e.preventDefault()
  const u = ui.value
  if (!u) return
  const { scale } = measure()
  const client = { x: e.clientX, y: e.clientY }
  setGesture({
    type: 'resize',
    slideId: editing.slideId.value,
    pointerId: e.pointerId,
    ui: u,
    sel: selection.value,
    handle,
    startClient: client,
    scale,
    last: { client, shift: e.shiftKey },
    frame: null,
    moved: false,
  })
  capture(e.pointerId)
  listenForEnd()
}

function slideDelta(g: { startClient: Point; scale: number }, client: Point): Point {
  return { x: (client.x - g.startClient.x) / g.scale, y: (client.y - g.startClient.y) / g.scale }
}

function setTransforms(g: MoveGesture, delta: Point) {
  // Layers sit inside the scaled stage, so the translation is in slide px.
  const value = delta.x === 0 && delta.y === 0 ? '' : `translate(${delta.x}px, ${delta.y}px)`
  for (const layer of g.layers) layer.style.transform = value
}

function resizedUi(g: ResizeGesture): RawUi {
  return applyResize(g.ui, g.sel, g.handle, slideDelta(g, g.last.client), g.last.shift)
}

function onPointerMove(e: PointerEvent) {
  const g = gesture
  if (!g) {
    const u = ui.value
    if (u) hover.value = hitComponent(u, toSlidePoint(e.clientX, e.clientY, measure().rect))
    return
  }
  if (e.pointerId !== g.pointerId) return
  const client = { x: e.clientX, y: e.clientY }
  if (g.type === 'resize') {
    g.last = { client, shift: e.shiftKey }
    g.moved = true
    g.frame ??= requestAnimationFrame(() => {
      g.frame = null
      if (gesture === g && editing.slideId.value === g.slideId) editing.draftUi.value = resizedUi(g)
    })
    return
  }
  if (!g.started) {
    if (Math.hypot(client.x - g.startClient.x, client.y - g.startClient.y) < DRAG_START_PX) return
    g.plan = planMove(g.ui, g.items)
    if (!g.plan) return
    g.started = true
    g.layers = g.items.flatMap((item) => {
      const layer = canvas.layerFor(layerSource(item))
      return layer ? [layer] : []
    })
    dragging.value = true
  }
  const { delta, guides } = moveDelta(g.plan!, slideDelta(g, client), SNAP_DISTANCE_PX / g.scale)
  g.delta = delta
  dragDelta.value = delta
  editing.guides.value = guides
  setTransforms(g, delta)
}

function finish(commit: boolean) {
  const g = gesture
  if (!g) return
  setGesture(null)
  stopListening()
  try {
    el.value?.releasePointerCapture?.(g.pointerId)
  } catch {
    // Already released.
  }
  // A gesture never outlives its slide: its ui must not reach another one.
  const sameSlide = editing.slideId.value === g.slideId
  commit &&= sameSlide
  if (g.type === 'resize') {
    if (g.frame != null) cancelAnimationFrame(g.frame)
    if (!sameSlide) return
    if (commit && g.moved) void editing.commit(resizedUi(g), 'Resize')
    else editing.cancelDraft()
    return
  }
  setTransforms(g, { x: 0, y: 0 })
  dragging.value = false
  dragDelta.value = { x: 0, y: 0 }
  editing.guides.value = []
  if (commit && g.started && (g.delta.x !== 0 || g.delta.y !== 0)) {
    void editing.commit(applyMove(g.ui, g.items, g.delta), 'Move')
  }
}

function onPointerUp(e: PointerEvent) {
  if (gesture && e.pointerId === gesture.pointerId) finish(true)
}
function onPointerCancel(e: PointerEvent) {
  if (gesture && e.pointerId === gesture.pointerId) finish(false)
}
function onLostCapture(e: PointerEvent) {
  if (gesture && e.pointerId === gesture.pointerId) finish(true)
}

function onDoubleClick(e: MouseEvent) {
  const u = ui.value
  if (!u) return
  const hit = hitDeepest(u, toSlidePoint(e.clientX, e.clientY, measure().rect))
  if (!hit) return
  editing.select(hit)
  emit('open-editor', hit)
}

watch(
  () => editing.slideId.value,
  (id) => {
    if (gesture && gesture.slideId !== id) finish(false)
  },
  { flush: 'sync' },
)
watch(active, (on) => {
  if (!on) hover.value = null
})

onBeforeUnmount(() => finish(false))
</script>

<template>
  <div
    ref="el"
    data-testid="selection-overlay"
    tabindex="-1"
    class="absolute inset-0 z-10 touch-none outline-none select-none"
    :class="dragging && 'cursor-move'"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerleave="hover = null"
    @lostpointercapture="onLostCapture"
    @dblclick="onDoubleClick"
  >
    <div
      v-if="hoverBox"
      data-hover-box
      class="pointer-events-none absolute box-border border border-dashed border-[#4bb3e6]"
      :style="boxStyle(hoverBox)"
    />
    <div
      v-for="(b, i) in selected"
      :key="i"
      data-selection-box
      class="pointer-events-none absolute box-border border-[1.5px] border-solid border-[#4bb3e6]"
      :style="boxStyle(b)"
    />
    <template v-if="showHandles">
      <div
        v-for="h in HANDLES"
        :key="h"
        :data-handle="h"
        class="absolute box-border size-2 -translate-x-1/2 -translate-y-1/2 border border-[#4bb3e6] bg-white"
        :style="[handleStyle(selected[0]!, h), { cursor: HANDLE_CURSOR[h] }]"
        @pointerdown="onHandleDown($event, h)"
      />
    </template>
    <div
      v-for="(g, i) in guideStyles"
      :key="`g${i}`"
      data-guide
      class="pointer-events-none absolute bg-[#ff3d8b]"
      :style="g"
    />
  </div>
</template>
