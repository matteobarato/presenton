import {
  absoluteBoxForSelection,
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
import type { TemplateV2ItemSource } from '@/render/legacy/lib/template-v2-json-to-html'

/** Snap distance in screen px, as `ALIGNMENT_GUIDE_SNAP_DISTANCE_PX` in the old TemplateV2KonvaSlide. */
export const SNAP_DISTANCE_PX = 8
/** Screen px the pointer travels before a press becomes a drag. */
export const DRAG_START_PX = 3
const MIN_SIZE = 8

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
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

export function moveItems(sel: Selection): MoveItem[] {
  if (!sel) return []
  if (sel.kind === 'component') return [{ kind: 'component', index: sel.componentIndex }]
  if (sel.kind === 'multi-component') return sel.componentIndexes.map((index) => ({ kind: 'component', index }))
  if (sel.componentIndex === ROOT_ELEMENTS_COMPONENT_INDEX && sel.elementPath.length === 1) {
    return [{ kind: 'root-element', index: sel.elementPath[0]! }]
  }
  return []
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

/** Bounding box of the moving items and the boxes of everything else to snap against. */
export function planMove(ui: RawUi, items: MoveItem[]): MovePlan | null {
  const boxes = items.flatMap((item) => {
    const box = absoluteBoxForSelection(ui, itemSelection(item))
    return box ? [box] : []
  })
  if (boxes.length === 0) return null
  const movingComponents = new Set(items.filter((i) => i.kind === 'component').map((i) => i.index))
  const movingRoot = new Set(items.filter((i) => i.kind === 'root-element').map((i) => i.index))
  const others: Box[] = []
  readArray(ui.components).forEach((component, index) => {
    const record = asRecord(component)
    if (!record || movingComponents.has(index) || isVideoPlaceholderLayer(record)) return
    const box = absoluteBoxForSelection(ui, { kind: 'component', componentIndex: index })
    if (box) others.push(box)
  })
  readArray(rootElementsComponent(ui).elements).forEach((element, index) => {
    const record = asRecord(element)
    if (!record || movingRoot.has(index) || isVideoPlaceholderElement(record)) return
    const box = absoluteBoxForSelection(ui, { kind: 'element', componentIndex: ROOT_ELEMENTS_COMPONENT_INDEX, elementPath: [index] })
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
  if (sel.kind === 'component') {
    return updateComponentInUi(ui, sel.componentIndex, (component) => {
      const source = componentBox(component)
      const side = SIDE_ANCHORS[handle]
      if (side) {
        const size = resizedBox(source, handle, delta, false)
        return resizeComponentFromSideTransform(component, source, size, side, STAGE_BOX).component
      }
      const next = resizedBox(source, handle, delta, keepRatio)
      return resizeComponent(component, {
        ...next,
        scaleX: source.width > 0 ? next.width / source.width : 1,
        scaleY: source.height > 0 ? next.height / source.height : 1,
      })
    })
  }
  const abs = absoluteBoxForSelection(ui, sel)
  const parent =
    sel.componentIndex === ROOT_ELEMENTS_COMPONENT_INDEX
      ? rootElementsComponent(ui)
      : asRecord(readArray(ui.components)[sel.componentIndex])
  const local = parent ? localElementBox(parent, sel.elementPath) : null
  if (!abs || !local) return ui
  const next = resizedBox(abs, handle, delta, keepRatio)
  const scaleX = abs.width > 0 ? next.width / abs.width : 1
  const scaleY = abs.height > 0 ? next.height / abs.height : 1
  const position = { x: local.x + next.x - abs.x, y: local.y + next.y - abs.y }
  return updateElementInUi(ui, sel, (current: RawElement) => {
    const scaled = scaleRawElementTextMetrics(current, fontScaleFromResize(scaleX, scaleY))
    const geometry = isVectorType(readString(current.type))
      ? polygonElementFromFrame(scaled, position, scaleX, scaleY)
      : { ...scaled, position, size: { width: next.width, height: next.height } }
    return isManualPositioned(current) ? { ...geometry, __presenton_manual_position: true } : geometry
  })
}
