import { computed } from 'vue'
import { dataRoot } from '@/slide-editor/dataRoot'
import { infographicGroup } from '@/slide-editor/infographicOps'
import { getElementAtSelection, type ElementSelection, type RawElement } from '@/slide-editor/model'
import { useSlideEditingContext } from '@/slide-editor/useSlideEditing'

/** Infographic state shared by the Infographic inspector section and the floating bar's Edit items button. */
export function useInfographicControls() {
  const ctx = useSlideEditingContext()
  const root = computed<ElementSelection | null>(() => dataRoot(ctx.ui.value, ctx.selection.value, 'infographic'))
  const raw = computed<RawElement | null>(() => (ctx.ui.value && root.value ? getElementAtSelection(ctx.ui.value, root.value) : null))
  const group = computed(() => (raw.value ? infographicGroup(raw.value) : null))
  return { ctx, root, raw, group }
}
