import { watch } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import type { SlideEditing } from '@/slide-editor/useSlideEditing'
import { useEditorStore } from '@/stores/editor'

/**
 * Selecting something on the slide (none to some) brings up the Element tab, and opens a closed
 * docked inspector. Below 1051px the inspector is a drawer: only the tab changes. Deselecting
 * never switches tabs. A selection made by a press waits for the release: opening the docked
 * inspector resizes the canvas, which would make a drag in progress drift under the pointer.
 */
export function useElementTabAutoSwitch(ctx: Pick<SlideEditing, 'selection'> & Partial<Pick<SlideEditing, 'gestureActive'>>) {
  const editor = useEditorStore()
  const drawer = useMediaQuery('(max-width: 1050px)')
  let deferred = false

  function reveal() {
    editor.inspectorTab = 'element'
    if (!drawer.value && !editor.inspectorOpen) editor.inspectorOpen = true
  }

  watch(
    () => ctx.selection.value !== null,
    (has, had) => {
      if (!has) deferred = false
      if (!has || had) return
      if (ctx.gestureActive?.value) deferred = true
      else reveal()
    },
  )
  watch(
    () => ctx.gestureActive?.value ?? false,
    (active) => {
      if (active || !deferred) return
      deferred = false
      if (ctx.selection.value !== null) reveal()
    },
  )
}
