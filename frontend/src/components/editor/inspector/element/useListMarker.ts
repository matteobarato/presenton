import { readListMarker, setListMarker } from '@/slide-editor/elementStyle'
import { useSelectedElement } from '@/slide-editor/useSelectedElement'
import { useSlideEditingContext } from '@/slide-editor/useSlideEditing'
import { computed } from 'vue'
import { i18n } from '@/i18n'

export type ListMarker = 'bullet' | 'number' | 'none'
export const MARKERS = [
  { value: 'bullet', get label() { return i18n.global.t('editorInspector.element.list.bullet') } },
  { value: 'number', get label() { return i18n.global.t('editorInspector.element.list.number') } },
  { value: 'none', get label() { return i18n.global.t('editorInspector.element.list.none') } },
] as const

/** The list marker of the selected list, shared by the List inspector section and the floating bar. */
export function useListMarker() {
  const { element, patch } = useSelectedElement(useSlideEditingContext())
  const marker = computed<ListMarker | null>(() => (element.value ? readListMarker(element.value) : null))
  const choose = (m: string) => patch('List marker', (el) => setListMarker(el, m as ListMarker))
  return { element, marker, choose }
}
