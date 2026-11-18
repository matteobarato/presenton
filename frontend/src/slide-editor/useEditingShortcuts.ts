import { toValue, type MaybeRefOrGetter } from 'vue'
import { useEventListener } from '@vueuse/core'
import { getElementAtSelection, type ElementSelection, type RawUi, type Selection } from '@/slide-editor/model'
import { dataRoot } from '@/slide-editor/dataRoot'
import { sameSelection } from '@/slide-editor/layerTree'
import { toolbarKind } from '@/slide-editor/toolbarKind'
import { CLIPBOARD_MIME, CLIPBOARD_PREFIX, nextPasteOffset, useClipboard } from '@/slide-editor/useClipboard'
import {
  deleteSelection,
  duplicateSelection,
  groupSelection,
  isLayoutManagedElement,
  nudge,
  pasteFromPayload,
  reorderSelection,
  ungroupSelection,
  type LayerAction,
  type OpResult,
} from '@/slide-editor/ops'
import { useEditingActions } from '@/slide-editor/useEditingActions'
import { useEditorStore } from '@/stores/editor'
import type { SlideEditing } from '@/slide-editor/useSlideEditing'

function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  if (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return true
  return !!el.closest('[contenteditable]:not([contenteditable="false"])')
}

// Ctrl+] / Ctrl+[ move a layer up / down; with Shift, to the front / back. By code: Shift changes the key.
const LAYER_KEYS: Record<string, [LayerAction, LayerAction, string, string]> = {
  BracketRight: ['bring-forward', 'bring-to-front', 'Bring forward', 'Bring to front'],
  BracketLeft: ['send-backward', 'send-to-back', 'Send backward', 'Send to back'],
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
  const editor = useEditorStore()

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
    const owned = mod ? !e.altKey && (k === 'd' || k === 'g' || e.code in LAYER_KEYS) : e.key === 'Delete' || e.key === 'Backspace'
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
      } else if (e.code in LAYER_KEYS) {
        const [step, end, stepLabel, endLabel] = LAYER_KEYS[e.code]!
        const r = reorderSelection(ui, sel, e.shiftKey ? end : step)
        if (!r) return
        e.preventDefault()
        void apply(r, e.shiftKey ? endLabel : stepLabel)
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
      // A picked cell of the selected table edits in place.
      const cell = ctx.tableCell.value
      const table = dataRoot(ui, sel, 'table')
      if (cell && table && sameSelection(table, cell.root)) {
        e.preventDefault()
        ctx.requestCellEdit(cell.root, { row: cell.row, col: cell.col })
        return
      }
      // A text or list element, or a component whose lone element is text or a list (as the Text section edits it).
      const target: ElementSelection | null =
        sel?.kind === 'element'
          ? sel
          : sel?.kind === 'component' && ['text', 'list'].includes(toolbarKind(ui, sel))
            ? { kind: 'element', componentIndex: sel.componentIndex, elementPath: [0] }
            : null
      const type = target ? getElementAtSelection(ui, target)?.type : null
      if (!target || (type !== 'text' && type !== 'text-list')) return
      e.preventDefault()
      ctx.requestInlineEdit(target)
    } else if (e.key === 'Escape') {
      // The floating bar's Esc just closed a panel: this one is spent.
      if (!sel || editor.panelEscapeGuard) return
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
