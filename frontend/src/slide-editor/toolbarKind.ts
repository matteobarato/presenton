import { getElementAtSelection, type RawElement, type RawUi, type Selection } from '@/slide-editor/model'
import { ungroupSelection } from '@/slide-editor/ops'
import { isVideoPlaceholderElement } from '@/render/legacy/components/slide-editor/video/video-placeholder'

import { isOpenVector } from '@/slide-editor/elementStyle'

export type ToolbarKind = 'text' | 'list' | 'image' | 'icon' | 'shape' | 'line' | 'video' | 'multi' | 'generic'

type KindElement = { type?: string; is_icon?: unknown; isIcon?: unknown }

function elementKind(el: KindElement | null | undefined): ToolbarKind {
  switch (el?.type) {
    case 'text':
      return 'text'
    case 'text-list':
      return 'list'
    case 'image':
      if (isVideoPlaceholderElement(el)) return 'video'
      return (el as KindElement).is_icon || (el as KindElement).isIcon ? 'icon' : 'image'
    case 'vector':
      return isOpenVector(el as RawElement) ? 'line' : 'shape'
    default:
      return 'generic'
  }
}

/** Which context toolbar a selection gets; Tasks 9 and 10 plug the text and image toolbars in by this. */
export function toolbarKind(ui: RawUi | null, sel: Selection): ToolbarKind {
  if (!ui || !sel) return 'generic'
  if (sel.kind === 'multi-component') return 'multi'
  if (sel.kind === 'element') {
    const element = getElementAtSelection(ui, sel)
    return elementKind(element)
  }
  const component = (ui.components as Array<{ elements?: KindElement[] }> | undefined)?.[sel.componentIndex]
  const elements = component?.elements
  return elements?.length === 1 ? elementKind(elements[0]) : 'generic'
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
  const names: Partial<Record<ToolbarKind, string>> = {
    text: 'Text',
    list: 'List',
    image: 'Image',
    icon: 'Icon',
    shape: 'Shape',
    line: 'Line',
    video: 'Video',
  }
  if (names[kind]) return names[kind]!
  if (isGroupSelection(ui, sel)) return 'Group'
  return 'Element'
}
