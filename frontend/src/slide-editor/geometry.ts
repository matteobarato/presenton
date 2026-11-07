import {
  absoluteBoxForSelection,
  absoluteElementBox,
  childArrayInfo,
  rootElementsComponent,
  ROOT_ELEMENTS_COMPONENT_INDEX,
  type Box,
  type ElementSelection,
  type Point,
  type RawUi,
  type Selection,
} from '@/slide-editor/model'
import {
  isVideoPlaceholderElement,
  isVideoPlaceholderLayer,
} from '@/render/legacy/components/slide-editor/video/video-placeholder'

const SLIDE_WIDTH = 1280
const SLIDE_HEIGHT = 720
// A decorative root vector this close to the full slide counts as background.
const FULL_SLIDE_RATIO = 0.95

type Rec = Record<string, unknown>

const isRec = (v: unknown): v is Rec => !!v && typeof v === 'object' && !Array.isArray(v)
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

function contains(box: Box | null | undefined, p: Point): boolean {
  return (
    !!box &&
    p.x >= box.x &&
    p.x <= box.x + box.width &&
    p.y >= box.y &&
    p.y <= box.y + box.height
  )
}

function isDecorativeBackground(element: Rec, box: Box | null): boolean {
  return (
    element.decorative === true &&
    !!box &&
    box.width >= SLIDE_WIDTH * FULL_SLIDE_RATIO &&
    box.height >= SLIDE_HEIGHT * FULL_SLIDE_RATIO
  )
}

/** Topmost component or root element under `p`, or null. */
export function hitComponent(ui: RawUi, p: Point): Selection {
  const components = arr(ui.components)
  for (let i = components.length - 1; i >= 0; i -= 1) {
    const component = components[i]
    if (!isRec(component) || isVideoPlaceholderLayer(component)) continue
    if (contains(absoluteBoxForSelection(ui, { kind: 'component', componentIndex: i }), p)) {
      return { kind: 'component', componentIndex: i }
    }
  }
  const root = rootElementsComponent(ui)
  const elements = arr(root.elements)
  for (let i = elements.length - 1; i >= 0; i -= 1) {
    const element = elements[i]
    if (!isRec(element) || isVideoPlaceholderElement(element)) continue
    const box = absoluteElementBox(root, [i]) as Box | null
    if (isDecorativeBackground(element, box)) continue
    if (contains(box, p)) {
      return { kind: 'element', componentIndex: ROOT_ELEMENTS_COMPONENT_INDEX, elementPath: [i] }
    }
  }
  return null
}

function deepestIn(
  ui: RawUi,
  componentIndex: number,
  items: unknown[],
  prefix: number[],
  p: Point,
): number[] | null {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i]
    if (!isRec(item) || isVideoPlaceholderElement(item)) continue
    const path = [...prefix, i]
    const sel: ElementSelection = { kind: 'element', componentIndex, elementPath: path }
    if (!contains(absoluteBoxForSelection(ui, sel), p)) continue
    const info = childArrayInfo(item)
    const deeper = info ? deepestIn(ui, componentIndex, info.items, path, p) : null
    return deeper ?? path
  }
  return null
}

/** Deepest element under `p`, within the topmost hit component or root element. */
export function hitDeepest(ui: RawUi, p: Point): ElementSelection | null {
  const hit = hitComponent(ui, p)
  if (!hit) return null
  if (hit.kind === 'element') {
    const root = rootElementsComponent(ui)
    const info = childArrayInfo(arr(root.elements)[hit.elementPath[0]] as Rec)
    const deeper = info
      ? deepestIn(ui, hit.componentIndex, info.items, hit.elementPath, p)
      : null
    return { ...hit, elementPath: deeper ?? hit.elementPath }
  }
  if (hit.kind !== 'component') return null
  const component = arr(ui.components)[hit.componentIndex] as Rec
  const path = deepestIn(ui, hit.componentIndex, arr(component.elements), [], p)
  return path ? { kind: 'element', componentIndex: hit.componentIndex, elementPath: path } : null
}

/** One box per selected component, or the element's box. */
export function selectionBoxes(ui: RawUi, sel: Selection): Box[] {
  if (!sel) return []
  if (sel.kind === 'multi-component') {
    return sel.componentIndexes.flatMap((componentIndex) => {
      const box = absoluteBoxForSelection(ui, { kind: 'component', componentIndex })
      return box ? [box] : []
    })
  }
  const box = absoluteBoxForSelection(ui, sel)
  return box ? [box] : []
}

export function toSlidePoint(clientX: number, clientY: number, rect: DOMRect): Point {
  const scale = SLIDE_WIDTH / rect.width
  return { x: (clientX - rect.left) * scale, y: (clientY - rect.top) * scale }
}
