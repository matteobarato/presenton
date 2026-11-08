import { getElementAtSelection, type ElementSelection, type RawUi, type Selection } from '@/slide-editor/model'
import { findFirstComponentChartElement, findFirstComponentTableElement } from '@/slide-editor/model/toolbarTarget'

/** The table or chart element a selection edits: the selected element itself, or the first one inside a selected component. */
export function dataRoot(ui: RawUi | null, sel: Selection, type: 'table' | 'chart'): ElementSelection | null {
  if (!ui || !sel) return null
  if (sel.kind === 'element') {
    return getElementAtSelection(ui, sel)?.type === type ? sel : null
  }
  if (sel.kind !== 'component') return null
  const elements = (ui.components as Array<{ elements?: unknown[] }> | undefined)?.[sel.componentIndex]?.elements
  if (!Array.isArray(elements)) return null
  const found = type === 'table' ? findFirstComponentTableElement(elements) : findFirstComponentChartElement(elements)
  return found ? { kind: 'element', componentIndex: sel.componentIndex, elementPath: found.elementPath } : null
}
