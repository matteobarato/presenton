import { getElementAtSelection, type RawUi, type Selection } from '@/slide-editor/model'
import { ungroupSelection } from '@/slide-editor/ops'
import { isVideoPlaceholderElement } from '@/render/legacy/components/slide-editor/video/video-placeholder'

export type ToolbarKind = 'text' | 'image' | 'video' | 'multi' | 'generic'

const imageKind = (el: unknown): ToolbarKind => (isVideoPlaceholderElement(el) ? 'video' : 'image')

/** Which context toolbar a selection gets; Tasks 9 and 10 plug the text and image toolbars in by this. */
export function toolbarKind(ui: RawUi | null, sel: Selection): ToolbarKind {
  if (!ui || !sel) return 'generic'
  if (sel.kind === 'multi-component') return 'multi'
  if (sel.kind === 'element') {
    const element = getElementAtSelection(ui, sel)
    const type = element?.type
    return type === 'text' || type === 'text-list' ? 'text' : type === 'image' ? imageKind(element) : 'generic'
  }
  const component = (ui.components as Array<{ elements?: Array<{ type?: string }> }> | undefined)?.[sel.componentIndex]
  const elements = component?.elements
  if (elements?.length === 1) {
    const type = elements[0]?.type
    if (type === 'text' || type === 'text-list') return 'text'
    if (type === 'image') return imageKind(elements[0])
  }
  return 'generic'
}

/** True when the selection is a single group component that can be ungrouped. */
export function isGroupSelection(ui: RawUi | null, sel: Selection): boolean {
  return !!ui && sel?.kind === 'component' && ungroupSelection(ui, sel) !== null
}

/** Short name of what is selected: "Text", "Image", "Video", "Group", "Element", or "N items". */
export function selectionLabel(ui: RawUi | null, sel: Selection): string | null {
  if (!sel) return null
  if (sel.kind === 'multi-component') return `${sel.componentIndexes.length} items`
  const kind = toolbarKind(ui, sel)
  if (kind === 'text') return 'Text'
  if (kind === 'image') return 'Image'
  if (kind === 'video') return 'Video'
  if (isGroupSelection(ui, sel)) return 'Group'
  return 'Element'
}
