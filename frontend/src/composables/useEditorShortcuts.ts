import { useEventListener } from '@vueuse/core'
import { useRoute } from 'vue-router'
import { presentationKeys } from '@/api/presentations'
import { queryClient } from '@/api/query'
import type { Presentation } from '@/api/types'
import { slideKind } from '@/render/slide-kind'
import { useEditorStore } from '@/stores/editor'
import { useUndoRedo } from './useUndoRedo'

// closest() as well as isContentEditable: a key can target a node inside the editable root
// (the inline Tiptap editor), and jsdom has no isContentEditable.
const isEditable = (el: EventTarget | null) => {
  if (!(el instanceof HTMLElement)) return false
  if (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return true
  return !!el.closest('[contenteditable]:not([contenteditable="false"])')
}

/**
 * Editor keyboard map: Up/Down or PgUp/PgDn select slides, Cmd/Ctrl+Z undo,
 * Shift+Cmd/Ctrl+Z redo, Cmd/Ctrl+K toggles the Ask AI panel,
 * Cmd/Ctrl+Enter opens the add-slide picker. Delete-in-navigator lives in
 * SlideNavigator. Navigation and undo yield to text fields.
 */
export function useEditorShortcuts() {
  const editor = useEditorStore()
  const { undo, redo } = useUndoRedo()
  const route = useRoute()

  /** Mirrors the toolbar: Ask is off for smart slides and while the deck is generating. */
  function askBlocked() {
    if (editor.generating) return true
    const deck = queryClient.getQueryData<Presentation>(presentationKeys.one(String(route.params.id ?? '')))
    const slide = deck?.slides.find((x) => x.id === editor.activeSlideId)
    return slide ? slideKind(slide) === 'smart' : false
  }

  useEventListener(window, 'keydown', (e: KeyboardEvent) => {
    if (e.defaultPrevented) return
    const mod = e.metaKey || e.ctrlKey
    const key = e.key.toLowerCase()

    if (mod && key === 'k') {
      e.preventDefault()
      if (!editor.chatOpen && askBlocked()) return
      editor.toggleAsk()
      return
    }
    if (isEditable(e.target)) return
    if (mod && e.key === 'Enter') {
      if (editor.locked) return
      e.preventDefault()
      editor.addSlideRequested++
      return
    }
    if (mod && key === 'z') {
      if (editor.locked) return
      e.preventDefault()
      void (e.shiftKey ? redo() : undo())
      return
    }
    if (mod || e.altKey) return
    // Arrows belong to a selected on-slide element (nudge) ...
    if (editor.slideSelectionActive) return
    // ... or to an open dialog or drawer.
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
