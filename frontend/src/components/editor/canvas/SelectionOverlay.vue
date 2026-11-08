<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { hitComponent, hitDeepest, selectionFrames, toSlidePoint } from '@/slide-editor/geometry'
import {
  getElementAtSelection,
  selectionWithComponentToggle,
  STAGE_HEIGHT,
  STAGE_WIDTH,
  type ElementSelection,
  type Point,
  type RawUi,
  type Selection,
  ROOT_ELEMENTS_COMPONENT_INDEX,
} from '@/slide-editor/model'
import { normalizeRotation } from '@/slide-editor/elementStyle'
import { canRotate, rotateSelection } from '@/slide-editor/ops'
import { dataRoot } from '@/slide-editor/dataRoot'
import { sameSelection } from '@/slide-editor/layerTree'
import { cellAtPoint, cellFrame } from '@/slide-editor/tableGeometry'
import { tableSize } from '@/slide-editor/tableOps'
import { appearanceTargets, readRotation } from '@/slide-editor/appearanceTarget'
import { pointInFrame, selectionFrame, type Frame } from '@/slide-editor/rotation'
import { useSlideEditingContext } from '@/slide-editor/useSlideEditing'
import type { TemplateV2ItemSource } from '@/render/legacy/lib/template-v2-json-to-html'
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
// Shared with the inspector's layer list, which outlines the row under the pointer here.
const hover = editing.hover

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
  /** Set when the press landed on a table that was already selected: a release without a drag picks the cell. */
  cellPress: { root: ElementSelection; point: Point } | null
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
interface RotateGesture {
  type: 'rotate'
  slideId: string | null
  pointerId: number
  ui: RawUi
  sel: Selection
  /** Frame centre, slide px. */
  center: Point
  startAngle: number
  startRotation: number
  angle: number
  layers: HTMLElement[]
}
let gesture: MoveGesture | ResizeGesture | RotateGesture | null = null
// Mirrored into the context: the inspector waits for the release before it opens (and resizes the canvas).
function setGesture(g: MoveGesture | ResizeGesture | RotateGesture | null) {
  gesture = g
  editing.gestureActive.value = g != null
}
// Mirrors a running move for the template (the gesture itself is not reactive).
const dragging = ref(false)
const dragDelta = ref<Point>({ x: 0, y: 0 })
// The angle of a running rotation (null otherwise) and how far it has turned the selection.
const rotateAngle = ref<number | null>(null)
const rotateDelta = ref(0)

// Inert unless the editing context is on this canvas's slide.
const active = computed(() => editing.slideId.value != null && editing.slideId.value === canvas.slideId.value)
const ui = computed(() => (active.value ? editing.ui.value : null))
const selection = computed(() => editing.selection.value)

const selected = computed<Frame[]>(() => {
  const u = ui.value
  if (!u) return []
  const offset = dragDelta.value
  return selectionFrames(u, selection.value).map(({ box, rotation }) => ({
    box: { ...box, x: box.x + offset.x, y: box.y + offset.y },
    rotation: rotation + rotateDelta.value,
  }))
})
const showHandles = computed(
  () =>
    !dragging.value &&
    rotateAngle.value == null &&
    selected.value.length === 1 &&
    selection.value?.kind !== 'multi-component',
)
// The layer a rotate handle turns: a component, or a root element (nested elements get no handle).
function rotateLayerSource(sel: Selection): TemplateV2ItemSource | null {
  if (sel?.kind === 'component') return { kind: 'component', index: sel.componentIndex }
  if (sel?.kind === 'element' && sel.componentIndex === ROOT_ELEMENTS_COMPONENT_INDEX && sel.elementPath.length === 1) {
    return { kind: 'element', index: sel.elementPath[0]! }
  }
  return null
}
const showRotate = computed(() => {
  const u = ui.value
  const sel = selection.value
  return !!u && !dragging.value && selected.value.length === 1 && rotateLayerSource(sel) != null && canRotate(u, sel)
})
// The selected cell's outline, hidden while a gesture is moving or turning the table.
const cellOutline = computed(() => {
  const u = ui.value
  const cell = editing.tableCell.value
  if (!u || !cell || dragging.value || rotateAngle.value != null) return null
  const table = getElementAtSelection(u, cell.root)
  const frame = table ? selectionFrame(u, cell.root) : null
  if (!table || !frame) return null
  const { rows, cols } = tableSize(table)
  return { row: cell.row, col: cell.col, frame: cellFrame(frame, rows, cols, cell) }
})
const hoverBox = computed<Frame | null>(() => {
  const u = ui.value
  const h = hover.value
  if (!u || !h || dragging.value) return null
  const sel = selection.value
  if (sel && JSON.stringify(sel) === JSON.stringify(h)) return null
  if (sel?.kind === 'multi-component' && h.kind === 'component' && sel.componentIndexes.includes(h.componentIndex)) {
    return null
  }
  return h.kind === 'multi-component' ? null : selectionFrame(u, h)
})

const pct = (v: number, of: number) => `${(v / of) * 100}%`
function boxStyle(f: Frame) {
  const b = f.box
  return {
    left: pct(b.x, STAGE_WIDTH),
    top: pct(b.y, STAGE_HEIGHT),
    width: pct(b.width, STAGE_WIDTH),
    height: pct(b.height, STAGE_HEIGHT),
    ...(f.rotation !== 0 ? { transform: `rotate(${f.rotation}deg)`, transformOrigin: 'center' } : {}),
  }
}
// Handles are children of the (rotated) selection box, so they sit at fractions of it. The box has a
// 1.5px border, so edge handles move out by half of it to centre on the line.
function handleStyle(h: Handle) {
  const fx = h.includes('w') ? 0 : h.includes('e') ? 100 : 50
  const fy = h.startsWith('n') ? 0 : h.startsWith('s') ? 100 : 50
  const edge = (f: number) => (f === 0 ? ' - 1.5px' : f === 100 ? ' + 1.5px' : '')
  return { left: `calc(${fx}%${edge(fx)})`, top: `calc(${fy}%${edge(fy)})` }
}
const HANDLE_ANGLE: Record<Handle, number> = { e: 0, se: 45, s: 90, sw: 135, w: 180, nw: 225, n: 270, ne: 315 }
const CURSORS = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize']
function handleCursor(h: Handle, rotation: number): string {
  const steps = Math.round((HANDLE_ANGLE[h] + rotation) / 45)
  return CURSORS[((steps % 4) + 4) % 4]!
}
const ROTATE_STEM_PX = 24
const rotateBadgeStyle = computed(() => {
  const f = selected.value[0]
  if (!f) return {}
  return { left: pct(f.box.x + f.box.width / 2, STAGE_WIDTH), top: pct(f.box.y + f.box.height / 2, STAGE_HEIGHT) }
})
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
  window.removeEventListener('keydown', onRotateKey, true)
}
// Esc during a rotation cancels it, and nothing else sees the key.
function onRotateKey(e: KeyboardEvent) {
  if (e.key !== 'Escape' || gesture?.type !== 'rotate') return
  e.preventDefault()
  e.stopPropagation()
  finish(false)
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
    const frame = selectionFrame(u, current)
    if (frame && pointInFrame(frame, p)) return current
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
  const tableBefore = dataRoot(u, selection.value, 'table')
  const next = selectionAfterPress(u, p, e.shiftKey)
  editing.select(next)
  hover.value = null
  // A press on the table that was already selected picks a cell on release; the first press only selects it.
  const tableNow = e.shiftKey ? null : dataRoot(u, next, 'table')
  const cellPress =
    tableBefore && tableNow && sameSelection(tableBefore, tableNow) ? { root: tableNow, point: p } : null
  // Shift-click only toggles the multi-selection.
  const items = e.shiftKey ? [] : moveItems(next, u)
  // A table that cannot move (layout-managed) still gets a gesture, so its release can pick the cell.
  if (items.length === 0 && !cellPress) return
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
    cellPress,
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

const angleOf = (p: Point, c: Point) => (Math.atan2(p.y - c.y, p.x - c.x) * 180) / Math.PI

function onRotateDown(e: PointerEvent) {
  if (e.button !== 0 || gesture) return
  e.stopPropagation()
  e.preventDefault()
  const u = ui.value
  const sel = selection.value
  const targets = u ? appearanceTargets(u, sel) : null
  const frame = u && sel && sel.kind !== 'multi-component' ? selectionFrame(u, sel) : null
  const source = rotateLayerSource(sel)
  if (!u || !source || !targets || !frame) return
  const { rect } = measure()
  const center = { x: frame.box.x + frame.box.width / 2, y: frame.box.y + frame.box.height / 2 }
  const startRotation = normalizeRotation(readRotation(u, targets.rotation))
  const layer = canvas.layerFor(source)
  setGesture({
    type: 'rotate',
    slideId: editing.slideId.value,
    pointerId: e.pointerId,
    ui: u,
    sel,
    center,
    startAngle: angleOf(toSlidePoint(e.clientX, e.clientY, rect), center),
    startRotation,
    angle: startRotation,
    layers: layer ? [layer] : [],
  })
  rotateAngle.value = startRotation
  capture(e.pointerId)
  listenForEnd()
  window.addEventListener('keydown', onRotateKey, true)
}

function slideDelta(g: { startClient: Point; scale: number }, client: Point): Point {
  return { x: (client.x - g.startClient.x) / g.scale, y: (client.y - g.startClient.y) / g.scale }
}

function setRotation(g: RotateGesture, e: PointerEvent) {
  const p = toSlidePoint(e.clientX, e.clientY, measure().rect)
  let raw = g.startRotation + angleOf(p, g.center) - g.startAngle
  if (e.shiftKey) raw = Math.round(raw / 15) * 15
  // Hundredths: float noise around 180 must not tip the angle to -180.
  raw = Math.round(raw * 100) / 100
  g.angle = normalizeRotation(raw)
  rotateAngle.value = g.angle
  rotateDelta.value = g.angle - g.startRotation
  const value = rotateDelta.value === 0 ? '' : `rotate(${rotateDelta.value}deg)`
  for (const layer of g.layers) layer.style.transform = value
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
  if (g.type === 'rotate') {
    setRotation(g, e)
    return
  }
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
    if (g.items.length === 0) return
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
  if (g.type === 'rotate') {
    for (const layer of g.layers) layer.style.transform = ''
    rotateAngle.value = null
    rotateDelta.value = 0
    if (commit && g.angle !== g.startRotation) {
      const result = rotateSelection(g.ui, g.sel, g.angle)
      if (result) void editing.commit(result.ui, 'Rotate')
    }
    return
  }
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
  if (commit && !g.started && g.cellPress) selectCell(g.ui, g.cellPress)
}

function selectCell(u: RawUi, press: { root: ElementSelection; point: Point }) {
  const table = getElementAtSelection(u, press.root)
  const frame = table ? selectionFrame(u, press.root) : null
  if (!table || !frame) return
  const { rows, cols } = tableSize(table)
  const cell = cellAtPoint(frame, rows, cols, press.point)
  if (cell) editing.tableCell.value = { root: press.root, ...cell }
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
    @pointerleave="editing.hover.value = null"
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
      v-for="(f, i) in selected"
      :key="i"
      data-selection-box
      class="pointer-events-none absolute box-border border-[1.5px] border-solid border-[#4bb3e6]"
      :style="boxStyle(f)"
    >
      <template v-if="i === 0 && showHandles">
        <div
          v-for="h in HANDLES"
          :key="h"
          :data-handle="h"
          class="pointer-events-auto absolute box-border size-2 -translate-x-1/2 -translate-y-1/2 border border-[#4bb3e6] bg-white"
          :style="[handleStyle(h), { cursor: handleCursor(h, f.rotation) }]"
          @pointerdown="onHandleDown($event, h)"
        />
      </template>
      <template v-if="i === 0 && showRotate">
        <div
          class="pointer-events-none absolute w-px -translate-x-1/2 bg-[#4bb3e6]"
          :style="{ left: '50%', top: '100%', height: `${ROTATE_STEM_PX}px` }"
        />
        <div
          data-rotate-handle
          role="button"
          aria-label="Rotate"
          class="pointer-events-auto absolute box-border size-3 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border border-[#4bb3e6] bg-white"
          :style="{ left: '50%', top: `calc(100% + ${ROTATE_STEM_PX}px)` }"
          @pointerdown="onRotateDown"
        />
      </template>
    </div>
    <div
      v-if="cellOutline"
      data-table-cell-outline
      :data-row="cellOutline.row"
      :data-col="cellOutline.col"
      class="pointer-events-none absolute box-border border-2 border-solid border-[#4bb3e6]"
      :style="boxStyle(cellOutline.frame)"
    />
    <div
      v-if="rotateAngle != null"
      data-rotate-badge
      class="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded bg-[#0f1417] px-1.5 py-0.5 text-xs text-white"
      :style="rotateBadgeStyle"
    >
      {{ normalizeRotation(Math.round(rotateAngle)) }}°
    </div>
    <div
      v-for="(g, i) in guideStyles"
      :key="`g${i}`"
      data-guide
      class="pointer-events-none absolute bg-[#ff3d8b]"
      :style="g"
    />
  </div>
</template>
