<script setup lang="ts">
// Editor box styling and close handling ported from servers/nextjs/components/slide-editor/text/
// TemplateV2InlineEditor.tsx and TiptapInlineTextEditor.tsx. Changes: Vue component; the edit
// state lives in the slide editing context; Esc commits; transparent background, no border.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useEventListener } from '@vueuse/core'
import { Editor } from '@tiptap/vue-3'
import { absoluteBoxForSelection, absoluteInlineEditBox, withHash } from '@/slide-editor/model'
import { cssFontFamilyStack, inlineTextExtensions, nextListMarkerPrefix, tableCellInsets } from '@/slide-editor/tiptapRuns'
import { cellBox, cellFrame } from '@/slide-editor/tableGeometry'
import { tableSize } from '@/slide-editor/tableOps'
import { selectionFrame } from '@/slide-editor/rotation'
import { useSlideEditingContext } from '@/slide-editor/useSlideEditing'

const ctx = useSlideEditingContext()
// The parent keys this component per edit, so the session is fixed for its lifetime.
const session = ctx.inlineEdit.value!

const host = ref<HTMLElement | null>(null)
let editor: Editor | null = null
let blurTimer: ReturnType<typeof setTimeout> | undefined

const box = computed(() => absoluteInlineEditBox(session.ui, session.selection, session.frame))

// Root line height: the tallest run line, as in the old editor.
const lineHeightPx = computed(() => {
  const { style, runs } = session
  const heights = runs.map((run) => (run.font?.size ?? style.size) * (run.font?.line_height ?? style.lineHeight))
  return Math.max(1, style.size * style.lineHeight, ...heights)
})

const target = session.target
const cell = target.kind === 'cell' ? target : null
const tableGrid = cell ? tableSize(session.element) : null

// Where the renderer draws the element: turned about its centre, and moved with any rotated ancestor.
// A cell turns with its table, about the table's centre.
const frame = computed(() => {
  const f = selectionFrame(session.ui, session.selection)
  return f && cell && tableGrid ? cellFrame(f, tableGrid.rows, tableGrid.cols, cell) : f
})
// The unrotated box the frame is measured against.
const plainBox = computed(() => {
  const plain = absoluteBoxForSelection(session.ui, session.selection)
  return plain && cell && tableGrid ? cellBox(plain, tableGrid.rows, tableGrid.cols, cell) : plain
})
// A cell lays its text out like the rendered cell: inset by border and padding, centred vertically.
const cellInsets = cell ? tableCellInsets(session.element, cell) : null

const boxStyle = computed(() => {
  const b = box.value
  const s = session.style
  const f = frame.value
  const rotation = f?.rotation ?? 0
  const plain = plainBox.value
  // A rotated ancestor moves the element's centre; the editor's own box is laid out unrotated.
  const dx = rotation !== 0 && f && plain ? f.box.x + f.box.width / 2 - (plain.x + plain.width / 2) : 0
  const dy = rotation !== 0 && f && plain ? f.box.y + f.box.height / 2 - (plain.y + plain.height / 2) : 0
  return {
    left: `${(b?.x ?? 0) + dx}px`,
    top: `${(b?.y ?? 0) + dy}px`,
    ...(rotation !== 0 ? { transform: `rotate(${rotation}deg)`, transformOrigin: 'center' } : {}),
    width: `${b?.width ?? 0}px`,
    ...(cellInsets
      ? {
          height: `${b?.height ?? 0}px`,
          padding: `${cellInsets.top}px ${cellInsets.right}px ${cellInsets.bottom}px ${cellInsets.left}px`,
          display: 'flex',
          alignItems: 'center',
          overflow: 'hidden',
          wordBreak: 'break-word' as const,
        }
      : { minHeight: `${b?.height ?? 0}px` }),
    fontFamily: cssFontFamilyStack(s.family),
    fontSize: `${s.size}px`,
    color: withHash(s.color) ?? '#111827',
    fontWeight: s.bold ? 700 : 400,
    fontStyle: s.italic ? 'italic' : 'normal',
    textDecoration: s.underline ? 'underline' : 'none',
    lineHeight: `${lineHeightPx.value}px`,
    letterSpacing: `${s.letterSpacing}px`,
    textAlign: s.horizontal,
    opacity: s.opacity,
  }
})

function close() {
  // Only this editor's edit; a newer one belongs to a newer editor.
  if (editor && ctx.inlineEditor.value === editor) void ctx.closeInlineEdit(true)
}

/** The editor itself, or UI that edits alongside it (the toolbar). */
function insideEditing(target: EventTarget | null) {
  if (!(target instanceof Node)) return false
  if (host.value?.contains(target)) return true
  const el = target instanceof Element ? target : target.parentElement
  return !!el?.closest('[data-inline-edit-ignore="true"]')
}

onMounted(() => {
  const instance: Editor = new Editor({
    element: host.value!,
    extensions: inlineTextExtensions(),
    content: session.doc,
    autofocus: 'end',
    editorProps: {
      attributes: { class: 'inline-text-prosemirror', dir: 'auto' },
      handleKeyDown: (view, event): boolean => {
        if (event.key === 'Escape' || ((event.metaKey || event.ctrlKey) && event.key === 'Enter')) {
          // Handled here: the slide's Esc (deselect) must not see it.
          event.preventDefault()
          event.stopPropagation()
          close()
          return true
        }
        if (event.key === 'Enter' && !event.shiftKey && session.kind === 'text-list') {
          const before = view.state.doc.textBetween(0, view.state.selection.from, '\n', '\n')
          const prefix = nextListMarkerPrefix(before, session.listMarker)
          event.preventDefault()
          const chain = instance.chain().splitBlock()
          return (prefix ? chain.insertContent(prefix) : chain).run()
        }
        return false
      },
    },
    onBlur: ({ event }) => {
      if (insideEditing(event.relatedTarget)) return
      clearTimeout(blurTimer)
      blurTimer = setTimeout(() => {
        if (!insideEditing(document.activeElement)) close()
      }, 0)
    },
  })
  editor = instance
  ctx.inlineEditor.value = instance
})

// A press outside closes the editor before anything else handles it: a press on the slide may not move
// focus (the overlay prevents its default) and could otherwise start a drag under the open editor.
useEventListener(
  document,
  'pointerdown',
  (e: PointerEvent) => {
    if (!insideEditing(e.target)) close()
  },
  { capture: true },
)

onBeforeUnmount(() => {
  clearTimeout(blurTimer)
  close()
  editor?.destroy()
  editor = null
})
</script>

<template>
  <div
    ref="host"
    data-testid="inline-text-editor"
    data-inline-edit-ignore="true"
    :data-inline-edit-cell="cell ? `${cell.row},${cell.col}` : undefined"
    class="inline-text-editor pointer-events-auto absolute box-border cursor-text overflow-visible bg-transparent whitespace-pre-wrap"
    :class="cell && 'inline-text-editor--cell'"
    :style="boxStyle"
  />
</template>

<style scoped>
.inline-text-editor :deep(.inline-text-prosemirror) {
  min-height: 100%;
  outline: none;
  overflow-wrap: break-word;
  unicode-bidi: plaintext;
  caret-color: currentColor;
}
.inline-text-editor--cell :deep(.inline-text-prosemirror) {
  min-height: 0;
  width: 100%;
}
.inline-text-editor :deep(.inline-text-prosemirror p) {
  margin: 0;
  line-height: inherit;
}
</style>
