import { getElementAtSelection, type RawElement, type RawUi, type Selection } from '@/slide-editor/model'
import { ungroupSelection } from '@/slide-editor/ops'
import { isVideoPlaceholderElement } from '@/render/legacy/components/slide-editor/video/video-placeholder'
import { isOpenVector } from '@/slide-editor/elementStyle'
import { dataRoot } from '@/slide-editor/dataRoot'
import type { TableCellRef } from '@/slide-editor/tableOps'

export type ToolbarKind = 'text' | 'list' | 'image' | 'icon' | 'shape' | 'line' | 'video' | 'table' | 'chart' | 'infographic' | 'layout' | 'multi' | 'generic'

type KindElement = { type?: string; is_icon?: unknown; isIcon?: unknown }

function elementKind(el: KindElement | null | undefined): ToolbarKind {
  const isIcon = !!(el?.is_icon || el?.isIcon)
  switch (el?.type) {
    case 'text':
      return 'text'
    case 'text-list':
      return 'list'
    case 'image':
      if (isVideoPlaceholderElement(el)) return 'video'
      return isIcon ? 'icon' : 'image'
    case 'table':
      return 'table'
    case 'chart':
      return 'chart'
    case 'infographic':
      return 'infographic'
    case 'flex':
    case 'grid':
    case 'container':
      return 'layout'
    case 'vector':
      return isOpenVector(el as RawElement) ? 'line' : 'shape'
    default:
      return 'generic'
  }
}

/** Which inspector section a selection gets: the kind of the selected element, or of a component's lone element. */
export function toolbarKind(ui: RawUi | null, sel: Selection): ToolbarKind {
  if (!ui || !sel) return 'generic'
  if (sel.kind === 'multi-component') return 'multi'
  if (sel.kind === 'element') {
    const element = getElementAtSelection(ui, sel)
    return elementKind(element)
  }
  if (dataRoot(ui, sel, 'table')) return 'table'
  if (dataRoot(ui, sel, 'chart')) return 'chart'
  if (dataRoot(ui, sel, 'infographic')) return 'infographic'
  if (dataRoot(ui, sel, 'layout')) return 'layout'
  const component = (ui.components as Array<{ elements?: KindElement[] }> | undefined)?.[sel.componentIndex]
  const elements = component?.elements
  return elements?.length === 1 ? elementKind(elements[0]) : 'generic'
}

/** True when the selection is a single group component that can be ungrouped. */
export function isGroupSelection(ui: RawUi | null, sel: Selection): boolean {
  return !!ui && sel?.kind === 'component' && ungroupSelection(ui, sel) !== null
}

/** Short name of what is selected: "Text", "List", "Image", "Icon", "Shape", "Line", "Video", "Table", "Chart", "Infographic", "Flex layout", "Grid layout", "Container", "Cell", "Group", "Element", or "N items". */
export function selectionLabel(ui: RawUi | null, sel: Selection, cell?: TableCellRef | null): string | null {
  if (!sel) return null
  if (sel.kind === 'multi-component') return `${sel.componentIndexes.length} items`
  const kind = toolbarKind(ui, sel)
  if (kind === 'table' && cell) return 'Cell'
  const names: Partial<Record<ToolbarKind, string>> = {
    text: 'Text',
    list: 'List',
    image: 'Image',
    icon: 'Icon',
    shape: 'Shape',
    line: 'Line',
    video: 'Video',
    table: 'Table',
    chart: 'Chart',
    infographic: 'Infographic',
  }
  if (kind === 'layout') {
    const root = dataRoot(ui, sel, 'layout')
    const type = root ? getElementAtSelection(ui!, root)?.type : undefined
    return type === 'flex' ? 'Flex layout' : type === 'grid' ? 'Grid layout' : 'Container'
  }
  if (names[kind]) return names[kind]!
  if (isGroupSelection(ui, sel)) return 'Group'
  return 'Element'
}
