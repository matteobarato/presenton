import type { Ref } from 'vue'
import { useEventListener } from '@vueuse/core'
import { useEditorStore } from '@/stores/editor'

/**
 * While a bar popover is open, Escape closes it and leaves the selection alone. The popover's own Escape
 * handling runs after the slide's shortcut listener, so a capture listener raises the editor's guard first
 * (the shortcut handler skips the deselect while it is up) and drops it once the key has been handled.
 */
export function usePopoverEscapeGuard(open: Ref<boolean>) {
  const editor = useEditorStore()
  useEventListener(
    () => (open.value ? window : undefined),
    'keydown',
    (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      editor.panelEscapeGuard = true
      setTimeout(() => (editor.panelEscapeGuard = false), 0)
    },
    { capture: true },
  )
}
