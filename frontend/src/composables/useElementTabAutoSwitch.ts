import { watch } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import type { SlideEditing } from '@/slide-editor/useSlideEditing'
import { useEditorStore } from '@/stores/editor'

/**
 * Selecting something on the slide (none to some) brings up the Element tab, and opens a closed
 * docked inspector. Below 1051px the inspector is a drawer: only the tab changes. Deselecting
 * never switches tabs.
 */
export function useElementTabAutoSwitch(ctx: Pick<SlideEditing, 'selection'>) {
  const editor = useEditorStore()
  const drawer = useMediaQuery('(max-width: 1050px)')
  watch(
    () => ctx.selection.value !== null,
    (has, had) => {
      if (!has || had) return
      editor.inspectorTab = 'element'
      if (!drawer.value && !editor.inspectorOpen) editor.inspectorOpen = true
    },
  )
}
