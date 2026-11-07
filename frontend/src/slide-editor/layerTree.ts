import { rawTextContent, rawTextListRunsForEditor } from '@/render/legacy/components/slide-editor/text/template-v2-text'
import { textRunsContent } from '@/render/legacy/components/slide-editor/text/text-runs'
import {
  childArrayInfo,
  ROOT_ELEMENTS_COMPONENT_INDEX,
  type ComponentSelection,
  type ElementSelection,
  type RawElement,
  type RawUi,
  type Selection,
} from '@/slide-editor/model'

/** One row of the Element tab's layer list: something on the slide that can be selected. */
export interface LayerNode {
  /** Stable key for this position in the tree. */
  key: string
  selection: ComponentSelection | ElementSelection
  /** Raw element type ("text", "image", "group", ...), or "component" for a multi-element component. */
  type: string
  /** Short type name: "Text", "Image", "Group". */
  label: string
  /** What tells this row apart from its siblings: a text preview, an image file name, a description. */
  detail: string | null
  children: LayerNode[]
}

const TYPE_LABELS: Record<string, string> = {
  text: 'Text',
  'text-list': 'List',
  image: 'Image',
  chart: 'Chart',
  table: 'Table',
  group: 'Group',
  flex: 'Layout',
  grid: 'Layout',
  'list-view': 'Layout',
  'grid-view': 'Layout',
  container: 'Container',
  vector: 'Shape',
  smooth: 'Shape',
  infographic: 'Infographic',
  icon: 'Icon',
  svg: 'Icon',
  component: 'Component',
}

const PREVIEW_MAX = 40

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const readArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

function truncate(s: string): string | null {
  const t = s.replace(/\s+/g, ' ').trim()
  if (!t) return null
  return t.length > PREVIEW_MAX ? `${t.slice(0, PREVIEW_MAX - 1)}…` : t
}

function textPreview(el: RawElement): string | null {
  try {
    if (el.type === 'text') return truncate(rawTextContent(el as never))
    if (el.type === 'text-list') return truncate(textRunsContent(rawTextListRunsForEditor(el as never)))
  } catch {
    return null
  }
  return null
}

function fileName(src: unknown): string | null {
  if (typeof src !== 'string' || !src || src.startsWith('data:')) return null
  const last = src.split('?')[0].split('/').filter(Boolean).pop()
  return last ? truncate(decodeURIComponent(last)) : null
}

function elementDetail(el: RawElement): string | null {
  if (el.type === 'text' || el.type === 'text-list') return textPreview(el)
  if (el.type === 'image') {
    if (el.video_placeholder === true) return 'Video placeholder'
    return (typeof el.alt === 'string' && truncate(el.alt)) || fileName(el.src)
  }
  if (typeof el.name === 'string') return truncate(el.name)
  return null
}

const labelFor = (type: string) => TYPE_LABELS[type] ?? (type ? type[0].toUpperCase() + type.slice(1) : 'Element')

function elementChildren(el: RawElement, componentIndex: number, path: number[]): LayerNode[] {
  const items = childArrayInfo(el)?.items ?? []
  return items.flatMap((child, i) => (isRecord(child) ? [elementNode(child, componentIndex, [...path, i])] : []))
}

function elementNode(el: RawElement, componentIndex: number, path: number[]): LayerNode {
  const type = typeof el.type === 'string' ? el.type : ''
  return {
    key: `${componentIndex}:${path.join('.')}`,
    selection: { kind: 'element', componentIndex, elementPath: path },
    type,
    label: labelFor(type),
    detail: elementDetail(el),
    children: elementChildren(el, componentIndex, path),
  }
}

/** The single element a one-element component wraps (it stands in for the component in the tree). */
function soleElement(component: Record<string, unknown>): RawElement | null {
  const elements = readArray(component.elements)
  return elements.length === 1 && isRecord(elements[0]) ? elements[0] : null
}

function componentNode(component: Record<string, unknown>, index: number): LayerNode {
  const selection: ComponentSelection = { kind: 'component', componentIndex: index }
  const description = typeof component.description === 'string' ? truncate(component.description) : null
  const sole = soleElement(component)
  if (sole) {
    // A one-element component reads as that element; its children are the element's children.
    const node = elementNode(sole, index, [0])
    return { ...node, key: `c${index}`, selection, detail: node.detail ?? description }
  }
  const elements = readArray(component.elements)
  return {
    key: `c${index}`,
    selection,
    type: 'component',
    label: labelFor('component'),
    detail: description,
    children: elements.flatMap((el, i) => (isRecord(el) ? [elementNode(el, index, [i])] : [])),
  }
}

/** Everything on the slide as a tree: components (in drawing order), then root elements. */
export function layerTree(ui: RawUi | null): LayerNode[] {
  if (!ui) return []
  const components = readArray(ui.components).flatMap((c, i) => (isRecord(c) ? [componentNode(c, i)] : []))
  const roots = readArray(ui.elements).flatMap((el, i) =>
    isRecord(el) ? [elementNode(el, ROOT_ELEMENTS_COMPONENT_INDEX, [i])] : [],
  )
  return [...components, ...roots]
}

/** The selection the tree uses for `sel`: element [0] of a one-element component is that component. */
export function normalizeSelection(ui: RawUi | null, sel: Selection): Selection {
  if (!ui || !sel || sel.kind !== 'element' || sel.elementPath.length !== 1 || sel.elementPath[0] !== 0) return sel
  if (sel.componentIndex === ROOT_ELEMENTS_COMPONENT_INDEX) return sel
  const component = readArray(ui.components)[sel.componentIndex]
  return isRecord(component) && soleElement(component) ? { kind: 'component', componentIndex: sel.componentIndex } : sel
}

export function sameSelection(a: Selection, b: Selection): boolean {
  if (!a || !b || a.kind !== b.kind) return a === b
  if (a.kind === 'component' && b.kind === 'component') return a.componentIndex === b.componentIndex
  if (a.kind === 'element' && b.kind === 'element') {
    return (
      a.componentIndex === b.componentIndex &&
      a.elementPath.length === b.elementPath.length &&
      a.elementPath.every((v, i) => v === b.elementPath[i])
    )
  }
  if (a.kind === 'multi-component' && b.kind === 'multi-component') {
    return a.componentIndexes.length === b.componentIndexes.length && a.componentIndexes.every((v, i) => v === b.componentIndexes[i])
  }
  return false
}

/** The node for `sel` with its ancestors (outermost first), or null when the tree has no such node. */
export function layerPath(nodes: LayerNode[], ui: RawUi | null, sel: Selection): LayerNode[] | null {
  const target = normalizeSelection(ui, sel)
  if (!target || target.kind === 'multi-component') return null
  for (const node of nodes) {
    if (sameSelection(node.selection, target)) return [node]
    const below = layerPath(node.children, null, target)
    if (below) return [node, ...below]
  }
  return null
}
