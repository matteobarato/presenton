// Pure layout operations for the Layout inspector section. Never mutate inputs.
// Ported (logic only) from servers/nextjs/components/slide-editor/layout/ContainerToolbarControls.tsx,
// layout/LayoutToolbar.tsx (gap) and surface/TemplateV2KonvaSlide.tsx (`applyLayoutElementChange`).
import {
  ROOT_ELEMENTS_COMPONENT_INDEX,
  absoluteBoxForSelection,
  addLayoutItemChanges,
  childrenBounds,
  elementBox,
  elementSize,
  elementWithNormalizedLayoutChildren,
  getElementAtSelection,
  isManualPositioned,
  removeLastLayoutItemChanges,
  rootElementsComponent,
  updateComponentInUi,
  updateComponentLayoutElement,
  type ElementSelection,
  type RawElement,
  type RawUi,
} from '@/slide-editor/model'
import type { LayoutType } from '@/slide-editor/dataRoot'

export type { LayoutType }
export type Horizontal = 'left' | 'center' | 'right'
export type Vertical = 'top' | 'middle' | 'bottom'
type Rec = Record<string, unknown>

export interface ContainerControls {
  fillColor: string
  fillOpacity: number
  strokeColor: string
  strokeWidth: number
  strokeOpacity: number
  radius: number
  maxRadius: number
  horizontal: Horizontal
  vertical: Vertical
  paddingX: number
  paddingY: number
}

const LAYOUT_TYPES: readonly string[] = ['flex', 'grid', 'container']

function rec(value: unknown): Rec {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Rec) : {}
}
function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}
function str(value: unknown, fallback: string): string {
  return typeof value === 'string' && value ? value : fallback
}
function colour(value: unknown, fallback: string): string {
  const c = str(value, fallback)
  return (c.startsWith('#') ? c : `#${c}`).toLowerCase()
}
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export function layoutType(el: RawElement | null): LayoutType | null {
  const type = el?.type
  return typeof type === 'string' && LAYOUT_TYPES.includes(type) ? (type as LayoutType) : null
}

export function readGap(el: RawElement): number {
  return num(el.gap, num(el.column_gap, num(el.row_gap)))
}

export function readContainer(el: RawElement, box: { width: number; height: number }): ContainerControls {
  const alignment = rec(el.alignment)
  const fill = rec(el.fill)
  const stroke = rec(el.stroke)
  const padding = rec(el.padding)
  const borderRadius = rec(el.border_radius)
  return {
    fillColor: colour(fill.color, '#4A6FF3'),
    fillOpacity: num(fill.opacity, 1),
    strokeColor: colour(stroke.color, '#1A1F36'),
    strokeWidth: num(stroke.width),
    strokeOpacity: num(stroke.opacity, 1),
    radius: typeof el.border_radius === 'number' ? el.border_radius : num(borderRadius.radius, num(borderRadius.tl)),
    maxRadius: Math.max(0, Math.min(box.width, box.height) / 2),
    horizontal: str(alignment.horizontal, 'left') as Horizontal,
    vertical: str(alignment.vertical, 'top') as Vertical,
    paddingX: num(padding.x, (num(padding.left) + num(padding.right)) / 2),
    paddingY: num(padding.y, (num(padding.top) + num(padding.bottom)) / 2),
  }
}

export function gapChanges(value: number): Rec {
  const gap = Math.max(0, Math.round(value * 10) / 10)
  return { gap, column_gap: gap, row_gap: gap }
}

export function fillChanges(el: RawElement, patch: { color?: string; opacity?: number }): Rec {
  const fill = { ...rec(el.fill) }
  if (patch.color !== undefined) fill.color = patch.color
  if (patch.opacity !== undefined) fill.opacity = clamp(patch.opacity, 0, 1)
  return { fill }
}

export function strokeChanges(el: RawElement, patch: { color?: string; width?: number; opacity?: number }): Rec {
  const stroke = { ...rec(el.stroke) }
  if (patch.color !== undefined) stroke.color = patch.color
  if (patch.width !== undefined) stroke.width = clamp(patch.width, 0, 32)
  if (patch.opacity !== undefined) stroke.opacity = clamp(patch.opacity, 0, 1)
  return { stroke }
}

export function radiusChanges(value: number, maxRadius: number): Rec {
  const r = clamp(value, 0, maxRadius)
  return { border_radius: { tl: r, tr: r, br: r, bl: r } }
}

export function alignmentChanges(el: RawElement, horizontal: Horizontal, vertical: Vertical): Rec {
  return { alignment: { ...rec(el.alignment), horizontal, vertical } }
}

export function paddingChanges(el: RawElement, axis: 'x' | 'y', value: number): Rec {
  const v = Math.max(0, value)
  const padding = rec(el.padding)
  return {
    padding:
      axis === 'x'
        ? { ...padding, x: v, left: v, right: v }
        : { ...padding, y: v, top: v, bottom: v },
  }
}

/** Applies changes to the layout at `root`, resizing its component when the item count changed. Null when root is not a layout. */
export function applyLayoutChanges(ui: RawUi, root: ElementSelection, changes: Rec): RawUi | null {
  if (!layoutAt(ui, root)) return null
  const isRoot = root.componentIndex === ROOT_ELEMENTS_COMPONENT_INDEX
  const component = isRoot
    ? rootElementsComponent(ui)
    : (ui.components as RawElement[] | undefined)?.[root.componentIndex]
  if (!component) return null
  const box = absoluteBoxForSelection(ui, root)
  if (!box) return null
  const deps = {
    childrenBounds,
    elementBox,
    elementSize,
    isManualPositioned,
    normalizeLayoutChildren: elementWithNormalizedLayoutChildren,
  }
  const update = (c: RawElement) => updateComponentLayoutElement(c, root.elementPath, changes, box, deps)
  if (isRoot) {
    const updated = update(component)
    return { ...ui, elements: Array.isArray(updated.elements) ? updated.elements : [] }
  }
  return updateComponentInUi(ui, root.componentIndex, update)
}

function layoutAt(ui: RawUi, root: ElementSelection): RawElement | null {
  const el = getElementAtSelection(ui, root)
  return layoutType(el) ? el : null
}

export function addLayoutItem(ui: RawUi, root: ElementSelection): RawUi | null {
  const el = layoutAt(ui, root)
  return el ? applyLayoutChanges(ui, root, addLayoutItemChanges(el)) : null
}

export function removeLastLayoutItem(ui: RawUi, root: ElementSelection): RawUi | null {
  const el = layoutAt(ui, root)
  if (!el) return null
  const changes = removeLastLayoutItemChanges(el)
  return changes ? applyLayoutChanges(ui, root, changes) : null
}
