import {
  absoluteBoxForSelection,
  getElementAtSelection,
  asRecord,
  boxContainingBoxes,
  componentBox,
  createAlignmentSnapTargets,
  isManualPositioned,
  isVectorType,
  localElementBox,
  polygonElementFromFrame,
  readArray,
  readPoint,
  readString,
  resizeComponent,
  rootElementsComponent,
  scaleRawElementTextMetrics,
  setComponentPositionsInUi,
  snapBoxToAlignmentGuides,
  translateVectorElement,
  updateComponentInUi,
  updateElementInUi,
  ROOT_ELEMENTS_COMPONENT_INDEX,
  STAGE_BOX,
  type AlignmentGuide,
  type AlignmentSnapTargets,
  type Box,
  type ElementSelection,
  type Point,
  type RawElement,
  type RawUi,
  type Selection,
} from '@/slide-editor/model'
import {
  resizeComponentFromSideTransform,
  type ComponentSideResizeAnchor,
} from '@/slide-editor/model/component-resize'
import { fontScaleFromResize } from '@/render/legacy/components/slide-editor/text/template-v2-text'
import {
  isVideoPlaceholderElement,
  isVideoPlaceholderLayer,
} from '@/render/legacy/components/slide-editor/video/video-placeholder'
import { isLayoutManagedElement } from '@/slide-editor/ops'
import { aabb, rotatedResizeShift, rotatePoint, selectionFrame, type Handle } from '@/slide-editor/rotation'
import type { TemplateV2ItemSource } from '@/render/legacy/lib/template-v2-json-to-html'

/** Snap distance in screen px, as `ALIGNMENT_GUIDE_SNAP_DISTANCE_PX` in the old TemplateV2KonvaSlide. */
export const SNAP_DISTANCE_PX = 8
/** Screen px the pointer travels before a press becomes a drag. */
export const DRAG_START_PX = 3
const MIN_SIZE = 8

// Re-exported so existing importers (SelectionOverlay) keep working; the type lives in slide-editor.
export type { Handle }
export const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

const SIDE_ANCHORS: Partial<Record<Handle, ComponentSideResizeAnchor>> = {
  n: 'top-center',
  e: 'middle-right',
  s: 'bottom-center',
  w: 'middle-left',
}

/** The model items a move drags, with their rendered layer source. */
export type MoveItem =
  | { kind: 'component'; index: number }
  | { kind: 'root-element'; index: number }

/**
 * What a drag of `sel` moves. A nested element drags its owning component (or, inside a root
 * element, that root element), as the old editor dragged the component group; a layout-managed
 * element (placed by its flex/grid parent) does not drag at all.
 */
export function moveItems(sel: Selection, ui: RawUi): MoveItem[] {
  if (!sel) return []
  if (sel.kind === 'component') return [{ kind: 'component', index: sel.componentIndex }]
  if (sel.kind === 'multi-component') return sel.componentIndexes.map((index) => ({ kind: 'component', index }))
  if (sel.elementPath.length === 0 || isLayoutManagedElement(ui, sel)) return []
  if (sel.componentIndex === ROOT_ELEMENTS_COMPONENT_INDEX) return [{ kind: 'root-element', index: sel.elementPath[0]! }]
  return [{ kind: 'component', index: sel.componentIndex }]
}

export function layerSource(item: MoveItem): TemplateV2ItemSource {
  return item.kind === 'component' ? { kind: 'component', index: item.index } : { kind: 'element', index: item.index }
}

function itemSelection(item: MoveItem): Selection {
  return item.kind === 'component'
    ? { kind: 'component', componentIndex: item.index }
    : { kind: 'element', componentIndex: ROOT_ELEMENTS_COMPONENT_INDEX, elementPath: [item.index] }
}

export interface MovePlan {
  items: MoveItem[]
  startBox: Box
  targets: AlignmentSnapTargets
}

/** The box snapping sees: the axis-aligned bounds of a rotated item, else its plain box. */
function snapBox(ui: RawUi, sel: Selection): Box | null {
  if (!sel || sel.kind === 'multi-component') return null
  const frame = selectionFrame(ui, sel)
  if (frame && frame.rotation !== 0) return aabb(frame)
  return absoluteBoxForSelection(ui, sel)
}

/** Bounding box of the moving items and the boxes of everything else to snap against. */
export function planMove(ui: RawUi, items: MoveItem[]): MovePlan | null {
  const boxes = items.flatMap((item) => {
    const box = snapBox(ui, itemSelection(item))
    return box ? [box] : []
  })
  if (boxes.length === 0) return null
  const movingComponents = new Set(items.filter((i) => i.kind === 'component').map((i) => i.index))
  const movingRoot = new Set(items.filter((i) => i.kind === 'root-element').map((i) => i.index))
  const others: Box[] = []
  readArray(ui.components).forEach((component, index) => {
    const record = asRecord(component)
    if (!record || movingComponents.has(index) || isVideoPlaceholderLayer(record)) return
    const box = snapBox(ui, { kind: 'component', componentIndex: index })
    if (box) others.push(box)
  })
  readArray(rootElementsComponent(ui).elements).forEach((element, index) => {
    const record = asRecord(element)
    if (!record || movingRoot.has(index) || isVideoPlaceholderElement(record)) return
    const box = snapBox(ui, { kind: 'element', componentIndex: ROOT_ELEMENTS_COMPONENT_INDEX, elementPath: [index] })
    if (box) others.push(box)
  })
  return { items, startBox: boxContainingBoxes(boxes), targets: createAlignmentSnapTargets(STAGE_BOX, others) }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)

/** Snapped and slide-clamped delta for a raw pointer delta (slide px). */
export function moveDelta(
  plan: MovePlan,
  raw: Point,
  threshold: number,
): { delta: Point; guides: AlignmentGuide[] } {
  const box = plan.startBox
  const snapped = snapBoxToAlignmentGuides({
    movingBox: { ...box, x: box.x + raw.x, y: box.y + raw.y },
    stageBox: STAGE_BOX,
    targets: plan.targets,
    threshold,
  })
  // Never push a box that already sticks out; only stop it from leaving further.
  const delta = {
    x: clamp(snapped.position.x - box.x, Math.min(0, -box.x), Math.max(0, STAGE_BOX.width - box.x - box.width)),
    y: clamp(snapped.position.y - box.y, Math.min(0, -box.y), Math.max(0, STAGE_BOX.height - box.y - box.height)),
  }
  return { delta, guides: snapped.guides }
}

export function applyMove(ui: RawUi, items: MoveItem[], delta: Point): RawUi {
  const components = readArray(ui.components)
  const positions = items.flatMap((item) => {
    if (item.kind !== 'component') return []
    const record = asRecord(components[item.index])
    if (!record) return []
    const p = readPoint(record.position)
    return [{ componentIndex: item.index, position: { x: p.x + delta.x, y: p.y + delta.y } }]
  })
  let next = setComponentPositionsInUi(ui, positions)
  for (const item of items) {
    if (item.kind !== 'root-element') continue
    const sel: ElementSelection = { kind: 'element', componentIndex: ROOT_ELEMENTS_COMPONENT_INDEX, elementPath: [item.index] }
    next = updateElementInUi(next, sel, (element) => {
      if (readArray(element.points).length > 0) return translateVectorElement(element, delta)
      const p = readPoint(element.position)
      return { ...element, position: { x: p.x + delta.x, y: p.y + delta.y } }
    })
  }
  return next
}

/** The box a handle drag produces from `box`; shift keeps the aspect ratio (corners only). */
export function resizedBox(box: Box, handle: Handle, delta: Point, keepRatio: boolean): Box {
  const west = handle.includes('w')
  const north = handle.startsWith('n')
  const horizontal = handle !== 'n' && handle !== 's'
  const vertical = handle !== 'e' && handle !== 'w'
  let width = horizontal ? Math.max(MIN_SIZE, box.width + (west ? -delta.x : delta.x)) : box.width
  let height = vertical ? Math.max(MIN_SIZE, box.height + (north ? -delta.y : delta.y)) : box.height
  if (keepRatio && horizontal && vertical && box.width > 0 && box.height > 0) {
    const scale = Math.max(width / box.width, height / box.height)
    width = box.width * scale
    height = box.height * scale
  }
  return {
    x: west ? box.x + box.width - width : box.x,
    y: north ? box.y + box.height - height : box.y,
    width,
    height,
  }
}

/** The point (fractions of the box) that stays put while `handle` is dragged. */
const ANCHOR_FRACTION: Record<Handle, Point> = {
  se: { x: 0, y: 0 }, nw: { x: 1, y: 1 }, e: { x: 0, y: 0.5 }, w: { x: 1, y: 0.5 },
  s: { x: 0.5, y: 0 }, n: { x: 0.5, y: 1 }, ne: { x: 0, y: 1 }, sw: { x: 1, y: 0 },
}

const ownRotation = (item: unknown): number => {
  const r = asRecord(item)?.rotation
  return typeof r === 'number' && Number.isFinite(r) ? r : 0
}

/**
 * Adds the anchor-fixing shift to the stored position. Both live in the parent's frame: the box
 * grows about its own centre, which turns with `own` only, so the shift comes from `own` alone
 * (an ancestor's rotation turns the displacement and the target alike and cancels out).
 * Known limitation: under an odd ancestor flip the delta would also need mirroring.
 */
export function withShiftedPosition<T extends Record<string, unknown>>(item: T, shift: Point): T {
  const p = readPoint(item.position)
  return { ...item, position: { ...asRecord(item.position), x: p.x + shift.x, y: p.y + shift.y } }
}

/**
 * The ui after dragging `handle` by `delta` (slide px) from `ui`, following the old editor's
 * transform end: side handles → resizeComponentFromSideTransform (element bounds), corners →
 * resizeComponent (scales content); an element gets its new frame and scaled text metrics.
 */
export function applyResize(
  ui: RawUi,
  sel: Selection,
  handle: Handle,
  delta: Point,
  keepRatio: boolean,
): RawUi {
  if (!sel || sel.kind === 'multi-component') return ui
  // The pointer moves in screen space; the box's own axes are rotated by the frame's total rotation.
  const total = selectionFrame(ui, sel)?.rotation ?? 0
  const localDelta = total === 0 ? delta : rotatePoint(delta, { x: 0, y: 0 }, -total)
  if (sel.kind === 'component') {
    return updateComponentInUi(ui, sel.componentIndex, (component) => {
      const source = componentBox(component)
      const side = SIDE_ANCHORS[handle]
      let resized: Record<string, unknown>
      if (side) {
        const size = resizedBox(source, handle, localDelta, false)
        resized = resizeComponentFromSideTransform(component, source, size, side, STAGE_BOX).component
      } else {
        const next = resizedBox(source, handle, localDelta, keepRatio)
        resized = resizeComponent(component, {
          ...next,
          scaleX: source.width > 0 ? next.width / source.width : 1,
          scaleY: source.height > 0 ? next.height / source.height : 1,
        })
      }
      const own = ownRotation(component)
      return own === 0 ? resized : withShiftedPosition(resized, rotatedResizeShift(source, componentBox(resized), handle, own))
    })
  }
  const abs = absoluteBoxForSelection(ui, sel)
  const parent =
    sel.componentIndex === ROOT_ELEMENTS_COMPONENT_INDEX
      ? rootElementsComponent(ui)
      : asRecord(readArray(ui.components)[sel.componentIndex])
  const local = parent ? localElementBox(parent, sel.elementPath) : null
  if (!abs || !local) return ui
  const next = resizedBox(abs, handle, localDelta, keepRatio)
  const scaleX = abs.width > 0 ? next.width / abs.width : 1
  const scaleY = abs.height > 0 ? next.height / abs.height : 1
  let position = { x: local.x + next.x - abs.x, y: local.y + next.y - abs.y }
  const own = ownRotation(getElementAtSelection(ui, sel))
  if (own !== 0) {
    const shift = rotatedResizeShift(abs, next, handle, own)
    position = { x: position.x + shift.x, y: position.y + shift.y }
  }
  const build = (at: Point): RawUi =>
    updateElementInUi(ui, sel, (current: RawElement) => {
      const scaled = scaleRawElementTextMetrics(current, fontScaleFromResize(scaleX, scaleY))
      const geometry = isVectorType(readString(current.type))
        ? polygonElementFromFrame(scaled, at, scaleX, scaleY)
        : { ...scaled, position: at, size: { width: next.width, height: next.height } }
      return isManualPositioned(current) ? { ...geometry, __presenton_manual_position: true } : geometry
    })
  let result = build(position)
  if (total === own) return result
  // Under a rotated ancestor the ancestor's box (and so its centre of rotation) may change with the
  // element, which no closed form covers: nudge the position until the anchor is back on screen.
  const anchor = ANCHOR_FRACTION[handle]
  const anchorOnScreen = (u: RawUi): Point | null => {
    const frame = selectionFrame(u, sel)
    if (!frame) return null
    const { box } = frame
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    return rotatePoint({ x: box.x + box.width * anchor.x, y: box.y + box.height * anchor.y }, centre, frame.rotation)
  }
  const target = anchorOnScreen(ui)
  for (let i = 0; i < 30 && target; i += 1) {
    const now = anchorOnScreen(result)
    if (!now || Math.hypot(target.x - now.x, target.y - now.y) < 1e-9) break
    const fix = rotatePoint({ x: target.x - now.x, y: target.y - now.y }, { x: 0, y: 0 }, -(total - own))
    position = { x: position.x + fix.x, y: position.y + fix.y }
    result = build(position)
  }
  return result
}
