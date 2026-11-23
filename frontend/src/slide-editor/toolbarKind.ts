import { i18n } from '@/i18n'
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

/** Short, translated name of what is selected ("Text", "Flex layout", "Cell", "N items", ...). */
export function selectionLabel(ui: RawUi | null, sel: Selection, cell?: TableCellRef | null): string | null {
  if (!sel) return null
  if (sel.kind === 'multi-component') return i18n.global.t('slideEditor.selection.items', { count: sel.componentIndexes.length }, sel.componentIndexes.length)
  const kind = toolbarKind(ui, sel)
  if (kind === 'table' && cell) return i18n.global.t('slideEditor.selection.cell')
  const nameKeys: Partial<Record<ToolbarKind, string>> = {
    text: 'slideEditor.selection.text',
    list: 'slideEditor.selection.list',
    image: 'slideEditor.selection.image',
    icon: 'slideEditor.selection.icon',
    shape: 'slideEditor.selection.shape',
    line: 'slideEditor.selection.line',
    video: 'slideEditor.selection.video',
    table: 'slideEditor.selection.table',
    chart: 'slideEditor.selection.chart',
    infographic: 'slideEditor.selection.infographic',
  }
  if (kind === 'layout') {
    const root = dataRoot(ui, sel, 'layout')
    const type = root ? getElementAtSelection(ui!, root)?.type : undefined
    return type === 'flex'
      ? i18n.global.t('slideEditor.selection.flexLayout')
      : type === 'grid'
        ? i18n.global.t('slideEditor.selection.gridLayout')
        : i18n.global.t('slideEditor.selection.container')
  }
  if (nameKeys[kind]) return i18n.global.t(nameKeys[kind]!)
  if (isGroupSelection(ui, sel)) return i18n.global.t('slideEditor.selection.group')
  return i18n.global.t('slideEditor.selection.element')
}
