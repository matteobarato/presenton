import { getElementAtSelection, type ElementSelection, type RawUi, type Selection } from '@/slide-editor/model'
import { findFirstComponentLayoutElement } from '@/slide-editor/model/layoutToolbarTarget'
import {
  findFirstComponentChartElement,
  findFirstComponentInfographicElement,
  findFirstComponentTableElement,
} from '@/slide-editor/model/toolbarTarget'

export type DataRootKind = 'table' | 'chart' | 'infographic' | 'layout'
export type LayoutType = 'flex' | 'grid' | 'container'

export const LAYOUT_TYPES: readonly string[] = ['flex', 'grid', 'container'] satisfies LayoutType[]

type Found = { element: { type?: unknown }; elementPath: number[] } | null

function find(kind: DataRootKind, elements: unknown[]): Found {
  switch (kind) {
    case 'table':
      return findFirstComponentTableElement(elements)
    case 'chart':
      return findFirstComponentChartElement(elements)
    case 'infographic':
      return findFirstComponentInfographicElement(elements)
    case 'layout':
      return findFirstComponentLayoutElement(elements)
  }
}

/** The table, chart, infographic or layout element a selection edits: the selected element itself, or the first one inside a selected component. */
export function dataRoot(ui: RawUi | null, sel: Selection, kind: DataRootKind): ElementSelection | null {
  if (!ui || !sel) return null
  if (sel.kind === 'element') {
    const type = getElementAtSelection(ui, sel)?.type
    if (kind === 'layout') return typeof type === 'string' && LAYOUT_TYPES.includes(type) ? sel : null
    return type === kind ? sel : null
  }
  if (sel.kind !== 'component') return null
  const elements = (ui.components as Array<{ elements?: unknown[] }> | undefined)?.[sel.componentIndex]?.elements
  if (!Array.isArray(elements)) return null
  const found = find(kind, elements)
  if (!found) return null
  if (kind === 'layout' && !LAYOUT_TYPES.includes(found.element.type as string)) return null
  return { kind: 'element', componentIndex: sel.componentIndex, elementPath: found.elementPath }
}
