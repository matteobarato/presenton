import { useEventListener } from '@vueuse/core'
import { useEditorStore } from '@/stores/editor'
import { useUndoRedo } from './useUndoRedo'

const isEditable = (el: EventTarget | null) => {
  if (!(el instanceof HTMLElement)) return false
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
}

/**
 * Editor keyboard map: Up/Down or PgUp/PgDn select slides, Cmd/Ctrl+Z undo,
 * Shift+Cmd/Ctrl+Z redo, Cmd/Ctrl+K toggles Ask. Delete-in-navigator lives in
 * SlideNavigator. Navigation and undo yield to text fields.
 */
export function useEditorShortcuts() {
  const editor = useEditorStore()
  const { undo, redo } = useUndoRedo()

  useEventListener(window, 'keydown', (e: KeyboardEvent) => {
    if (e.defaultPrevented) return
    const mod = e.metaKey || e.ctrlKey
    const key = e.key.toLowerCase()

    if (mod && key === 'k') {
      e.preventDefault()
      editor.askOpen = !editor.askOpen
      return
    }
    if (isEditable(e.target)) return
    if (mod && key === 'z') {
      if (editor.generating) return
      e.preventDefault()
      void (e.shiftKey ? redo() : undo())
      return
    }
    if (mod || e.altKey) return
    // Arrows belong to an open dialog or drawer.
    if (document.querySelector('[role="dialog"]')) return
    if (e.key === 'ArrowDown' || e.key === 'PageDown') {
      e.preventDefault()
      editor.next()
    } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
      e.preventDefault()
      editor.prev()
    }
  })
}
