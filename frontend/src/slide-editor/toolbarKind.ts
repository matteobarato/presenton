import { getElementAtSelection, type RawUi, type Selection } from '@/slide-editor/model'
import { ungroupSelection } from '@/slide-editor/ops'

export type ToolbarKind = 'text' | 'image' | 'multi' | 'generic'

/** Which context toolbar a selection gets; Tasks 9 and 10 plug the text and image toolbars in by this. */
export function toolbarKind(ui: RawUi | null, sel: Selection): ToolbarKind {
  if (!ui || !sel) return 'generic'
  if (sel.kind === 'multi-component') return 'multi'
  if (sel.kind === 'element') {
    const type = getElementAtSelection(ui, sel)?.type
    return type === 'text' || type === 'text-list' ? 'text' : type === 'image' ? 'image' : 'generic'
  }
  const component = (ui.components as Array<{ elements?: Array<{ type?: string }> }> | undefined)?.[sel.componentIndex]
  const elements = component?.elements
  if (elements?.length === 1) {
    const type = elements[0]?.type
    if (type === 'text' || type === 'text-list') return 'text'
    if (type === 'image') return 'image'
  }
  return 'generic'
}

/** True when the selection is a single group component that can be ungrouped. */
export function isGroupSelection(ui: RawUi | null, sel: Selection): boolean {
  return !!ui && sel?.kind === 'component' && ungroupSelection(ui, sel) !== null
}
