import { computed, type ComputedRef } from 'vue'
import { getElementAtSelection, updateElementInUi, type ElementSelection, type RawElement } from '@/slide-editor/model'
import { useEditingActions } from '@/slide-editor/useEditingActions'
import type { SlideEditing } from '@/slide-editor/useSlideEditing'

export interface SelectedElement {
  /** The selected element, or the lone element of a selected component. */
  target: ComputedRef<ElementSelection | null>
  element: ComputedRef<RawElement | null>
  /** Commits `fn` applied to the element at `at` (default: the current target). No-op if it is gone. */
  patch: (label: string, fn: (el: RawElement) => RawElement, at?: ElementSelection) => void
  /** The current target, for deferred commits (a colour picker or number field that commits on close). */
  capture: () => ElementSelection | null
}

export function useSelectedElement(ctx: SlideEditing): SelectedElement {
  const actions = useEditingActions(ctx)
  const target = computed<ElementSelection | null>(() => {
    const sel = ctx.selection.value
    if (!sel || sel.kind === 'multi-component') return null
    return sel.kind === 'element' ? sel : { kind: 'element', componentIndex: sel.componentIndex, elementPath: [0] }
  })
  const element = computed<RawElement | null>(() => {
    const ui = ctx.ui.value
    return ui && target.value ? getElementAtSelection(ui, target.value) : null
  })

  // Built on the live ui inside run: an open inline edit commits first, so its text is kept and cannot revert this.
  function patch(label: string, fn: (el: RawElement) => RawElement, at?: ElementSelection) {
    const sel = at ?? target.value
    if (!sel || !ctx.ui.value || !getElementAtSelection(ctx.ui.value, sel)) return
    void actions.run(label, (ui) => (getElementAtSelection(ui, sel) ? { ui: updateElementInUi(ui, sel, fn), selection: ctx.selection.value } : null))
  }

  return { target, element, patch, capture: () => target.value }
}
