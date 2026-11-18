import { readListMarker, setListMarker } from '@/slide-editor/elementStyle'
import { useSelectedElement } from '@/slide-editor/useSelectedElement'
import { useSlideEditingContext } from '@/slide-editor/useSlideEditing'
import { computed } from 'vue'

export type ListMarker = 'bullet' | 'number' | 'none'
export const MARKERS = [
  { value: 'bullet', label: 'Bullet' },
  { value: 'number', label: 'Number' },
  { value: 'none', label: 'None' },
] as const

/** The list marker of the selected list, shared by the List inspector section and the floating bar. */
export function useListMarker() {
  const { element, patch } = useSelectedElement(useSlideEditingContext())
  const marker = computed<ListMarker | null>(() => (element.value ? readListMarker(element.value) : null))
  const choose = (m: string) => patch('List marker', (el) => setListMarker(el, m as ListMarker))
  return { element, marker, choose }
}
