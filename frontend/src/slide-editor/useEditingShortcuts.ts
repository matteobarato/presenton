import { toValue, type MaybeRefOrGetter } from 'vue'
import { useEventListener } from '@vueuse/core'
import { getElementAtSelection, type ElementSelection, type RawUi, type Selection } from '@/slide-editor/model'
import { toolbarKind } from '@/slide-editor/toolbarKind'
import { CLIPBOARD_MIME, CLIPBOARD_PREFIX, nextPasteOffset, useClipboard } from '@/slide-editor/useClipboard'
import {
  deleteSelection,
  duplicateSelection,
  groupSelection,
  isLayoutManagedElement,
  nudge,
  pasteFromPayload,
  ungroupSelection,
  type OpResult,
} from '@/slide-editor/ops'
import { useEditingActions } from '@/slide-editor/useEditingActions'
import type { SlideEditing } from '@/slide-editor/useSlideEditing'

function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  if (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return true
  return !!el.closest('[contenteditable]:not([contenteditable="false"])')
}

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}

/**
 * Keyboard editing for the current slide: delete, duplicate, copy/paste, group/ungroup, nudge,
 * Enter-to-edit and Esc. `active` gates the listeners so only the current slide's canvas handles keys.
 * Undo/redo stay with useEditorShortcuts.
 */
export function useEditingShortcuts(ctx: SlideEditing, active: MaybeRefOrGetter<boolean> = true) {
  const clipboard = useClipboard()

  function usable(target: EventTarget | null): boolean {
    return toValue(active) && ctx.enabled.value && !ctx.inlineEdit.value && !isEditableTarget(target)
  }

  const actions = useEditingActions(ctx)
  const apply = (result: OpResult, label: string) => actions.run(label, result)

  useEventListener(window, 'keydown', (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.isComposing || !usable(e.target)) return
    if (document.querySelector('[role="dialog"]')) return
    const ui = ctx.ui.value as RawUi | null
    const sel: Selection = ctx.selection.value
    if (!ui) return
    const mod = e.metaKey || e.ctrlKey
    // Keys this handler owns are swallowed (not queued) while a conflicting commit is in flight,
    // so they never reach the browser or slide navigation. Copy mutates nothing and always runs.
    const k = e.key.toLowerCase()
    const owned = mod ? !e.altKey && (k === 'd' || k === 'g') : e.key === 'Delete' || e.key === 'Backspace'
    if ((owned && actions.busy()) || (!mod && e.key in ARROWS && actions.structuralBusy())) {
      e.preventDefault()
      return
    }
    const key = e.key.toLowerCase()

    if (mod && !e.altKey) {
      if (key === 'd' && !e.shiftKey) {
        const r = sel ? duplicateSelection(ui, sel) : null
        if (!r) return
        e.preventDefault()
        void apply(r, 'Duplicate')
      } else if (key === 'c' && !e.shiftKey) {
        // Highlighted page text (notes, chat, a label) is what the user means to copy.
        if (!sel || window.getSelection()?.isCollapsed === false) return
        e.preventDefault()
        void clipboard.copy(ui, sel)
      } else if (key === 'g') {
        const r = e.shiftKey ? ungroupSelection(ui, sel) : groupSelection(ui, sel)
        if (!r) return
        e.preventDefault()
        void apply(r, e.shiftKey ? 'Ungroup' : 'Group')
      }
      return
    }
    if (mod || e.altKey) return

    if (e.key === 'Delete' || e.key === 'Backspace') {
      const r = deleteSelection(ui, sel)
      if (!r) return
      e.preventDefault()
      void apply(r, 'Delete')
    } else if (e.key in ARROWS) {
      if (!sel) return
      const step = e.shiftKey ? 10 : 1
      const [dx, dy] = ARROWS[e.key]!
      const r = nudge(ui, sel, dx * step, dy * step)
      // Arrows stay with a movable selection even at the slide edge; layout-managed elements do nothing.
      if (!r && sel.kind === 'element' && isLayoutManagedElement(ui, sel)) return
      e.preventDefault()
      void apply(r, 'Nudge')
    } else if (e.key === 'Enter') {
      // A text element, or a component whose lone element is text (as the Text section edits it).
      const target: ElementSelection | null =
        sel?.kind === 'element'
          ? sel
          : sel?.kind === 'component' && toolbarKind(ui, sel) === 'text'
            ? { kind: 'element', componentIndex: sel.componentIndex, elementPath: [0] }
            : null
      const type = target ? getElementAtSelection(ui, target)?.type : null
      if (!target || (type !== 'text' && type !== 'text-list')) return
      e.preventDefault()
      ctx.requestInlineEdit(target)
    } else if (e.key === 'Escape') {
      if (!sel) return
      e.preventDefault()
      ctx.select(null)
    }
  })

  useEventListener(window, 'paste', (e: ClipboardEvent) => {
    if (!usable(e.target)) return
    const data = e.clipboardData
    if (data && (data.getData(CLIPBOARD_MIME) || data.getData('text/plain').startsWith(CLIPBOARD_PREFIX))) {
      e.preventDefault()
    }
    void clipboard.readPayload(e).then((payload) => {
      const ui = ctx.ui.value as RawUi | null
      if (!payload || !ui || !usable(e.target)) return
      return apply(pasteFromPayload(ui, payload, nextPasteOffset()), 'Paste')
    })
  })
}
