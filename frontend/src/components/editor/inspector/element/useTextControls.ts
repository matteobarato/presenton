import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, Italic, Underline } from 'lucide-vue-next'
import type { Presentation } from '@/api/types'
import { resolvePresentationTheme } from '@/render/legacy/lib/template-theme'
import { localFontOptionsFromUnknown } from '@/render/legacy/components/slide-editor/text/local-fonts'
import { rawFont } from '@/render/legacy/components/slide-editor/text/template-v2-text'
import { asRecord, getElementAtSelection, readArray, updateElementInUi, withHash, type ElementSelection, type RawElement } from '@/slide-editor/model'
import { setCellAlignment, setCellFont, setTableAlignment, setTableFont, tableCellAt, type TableCellRef } from '@/slide-editor/tableOps'
import { themePalette } from '@/slide-editor/themePalette'
import { useEditingActions } from '@/slide-editor/useEditingActions'
import { useSlideEditingContext } from '@/slide-editor/useSlideEditing'

export interface TextControlsProps {
  presentation: Presentation
  /** Edits a table: the cell's text, or the whole table when no cell is selected. */
  target?: { kind: 'table'; root: ElementSelection; cell: TableCellRef | null }
}

const LINE_HEIGHTS = [1, 1.15, 1.5, 2]
export const ALL_ALIGNS = [
  { value: 'left', label: 'Align left', icon: AlignLeft },
  { value: 'center', label: 'Align center', icon: AlignCenter },
  { value: 'right', label: 'Align right', icon: AlignRight },
  { value: 'justify', label: 'Justify', icon: AlignJustify },
] as const
export type Align = (typeof ALL_ALIGNS)[number]['value']
export type Mark = 'bold' | 'italic' | 'underline'
export const MARKS = [
  { mark: 'bold', label: 'Bold', title: 'Bold (Ctrl+B)', icon: Bold },
  { mark: 'italic', label: 'Italic', title: 'Italic (Ctrl+I)', icon: Italic },
  { mark: 'underline', label: 'Underline', title: 'Underline (Ctrl+U)', icon: Underline },
] as const

type FontPatch = Partial<Record<'family' | 'size' | 'color' | 'bold' | 'italic' | 'underline' | 'line_height', string | number | boolean>>

/** Text-list items are a string, a run array, or { font, runs }; patch the font of every run. */
function patchListItem(item: unknown, fontPatch: FontPatch): unknown {
  const patchRun = (run: unknown) => ({ ...(asRecord(run) ?? {}), font: { ...(asRecord(asRecord(run)?.font) ?? {}), ...fontPatch } })
  if (typeof item === 'string' || typeof item === 'number') return [{ text: String(item), font: { ...fontPatch } }]
  if (Array.isArray(item)) return item.map(patchRun)
  const record = asRecord(item)
  if (!record) return item
  const runs = readArray(record.runs)
  return { ...record, font: { ...(asRecord(record.font) ?? {}), ...fontPatch }, ...(runs.length > 0 ? { runs: runs.map(patchRun) } : {}) }
}

/** A table: one cell, or (no cell) the base font and every cell. */
function patchTable(el: RawElement, cell: TableCellRef | null, fontPatch: FontPatch, horizontal?: Align) {
  const align = horizontal === 'left' || horizontal === 'center' || horizontal === 'right' ? horizontal : null
  let next = el
  if (Object.keys(fontPatch).length > 0) next = cell ? setCellFont(next, cell, fontPatch) : setTableFont(next, fontPatch)
  if (align) next = cell ? setCellAlignment(next, cell, align) : setTableAlignment(next, align)
  return next
}

/**
 * The text styling state and actions shared by the Text inspector section and the floating bar's quick
 * controls. With an inline text edit open (`ctx.inlineEditor`) every action drives the Tiptap editor, so it
 * applies to the selected range; otherwise it patches the whole element. `props` is the (reactive) props
 * object of the calling component.
 */
export function useTextControls(props: TextControlsProps) {
  const ctx = useSlideEditingContext()
  const actions = useEditingActions(ctx)

  /** The text element edited: the selected element, or the lone text element of a selected component. */
  const target = computed<ElementSelection | null>(() => {
    if (props.target) return props.target.root
    const sel = ctx.selection.value
    if (!sel || sel.kind === 'multi-component') return null
    return sel.kind === 'element' ? sel : { kind: 'element', componentIndex: sel.componentIndex, elementPath: [0] }
  })
  const element = computed<RawElement | null>(() => {
    const ui = ctx.ui.value
    return ui && target.value ? getElementAtSelection(ui, target.value) : null
  })

  // The Tiptap editor's state is not reactive; bump a counter on every transaction.
  const tick = ref(0)
  const editor = computed(() => ctx.inlineEditor?.value ?? null)
  let detach: (() => void) | null = null
  watch(
    editor,
    (instance) => {
      detach?.()
      detach = null
      if (!instance) return
      const bump = () => (tick.value += 1)
      instance.on('transaction', bump)
      detach = () => instance.off('transaction', bump)
    },
    { immediate: true },
  )
  onBeforeUnmount(() => detach?.())

  /** The text element: for a table cell, the cell's font laid over the table's base font. */
  const textSource = computed<RawElement | null>(() => {
    const el = element.value
    const cell = props.target?.cell
    if (!el || !cell) return el
    const own = tableCellAt(el, cell)
    return { ...el, font: { ...asRecord(el.font), ...asRecord(own?.font) }, alignment: { horizontal: own?.alignment } }
  })
  const font = computed(() => (textSource.value ? rawFont(textSource.value) : null))
  const textStyleAttrs = computed(() => {
    void tick.value
    return (editor.value?.getAttributes('textStyle') ?? {}) as Record<string, unknown>
  })
  const alignment = computed<Align>(() => {
    void tick.value
    const value = editor.value?.getAttributes('paragraph').textAlign ?? asRecord(textSource.value?.alignment)?.horizontal
    return value === 'center' || value === 'right' || value === 'justify' ? value : 'left'
  })
  const family = computed(() => (textStyleAttrs.value.fontFamily as string | undefined) ?? font.value?.family ?? '')
  const size = computed(() => (textStyleAttrs.value.fontSize as number | undefined) ?? font.value?.size ?? 18)
  const color = computed(() => {
    const c = withHash((textStyleAttrs.value.color as string | undefined) ?? font.value?.color ?? '')
    return c && /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : '#111827'
  })
  const lineHeight = computed(() => (textStyleAttrs.value.lineHeight as number | undefined) ?? font.value?.lineHeight ?? 1.15)
  function isOn(mark: Mark) {
    void tick.value
    return editor.value ? editor.value.isActive(mark) : !!font.value?.[mark]
  }

  const theme = computed(() => resolvePresentationTheme(props.presentation))
  const families = computed(() => {
    const list = new Set<string>()
    if (family.value) list.add(family.value)
    for (const option of localFontOptionsFromUnknown((props.presentation as { fonts?: unknown }).fonts)) list.add(option.family)
    const themeFont = theme.value.fonts?.textFont?.name
    if (themeFont) list.add(themeFont)
    return [...list]
  })
  const palette = computed(() => themePalette(props.presentation))
  const lineHeights = computed(() => (LINE_HEIGHTS.includes(lineHeight.value) ? LINE_HEIGHTS : [lineHeight.value, ...LINE_HEIGHTS]))
  // Table cells have no justify.
  const aligns = computed(() => (props.target ? ALL_ALIGNS.filter((a) => a.value !== 'justify') : ALL_ALIGNS))

  /** No inline editor: patch the element font and every run, plus the alignment, in one commit. */
  function patchElement(fontPatch: FontPatch, horizontal?: Align) {
    const sel = target.value
    if (!ctx.ui.value || !sel) return
    const table = props.target
    // Built on the live ui (see useEditingActions.run); only reached with no Tiptap editor to drive.
    void actions.run('Text style', (ui) => {
      if (!getElementAtSelection(ui, sel)) return null
      const next = updateElementInUi(ui, sel, (el) => {
        if (table) return patchTable(el, table.cell, fontPatch, horizontal)
        const runs = readArray(el.runs)
        const items = readArray(el.items)
        return {
          ...el,
          font: { ...(asRecord(el.font) ?? {}), ...fontPatch },
          ...(horizontal ? { alignment: { ...(asRecord(el.alignment) ?? {}), horizontal } } : {}),
          ...(el.type === 'text-list' && items.length > 0 ? { items: items.map((item) => patchListItem(item, fontPatch)) } : {}),
          ...(runs.length > 0
            ? { runs: runs.map((run) => ({ ...(asRecord(run) ?? {}), font: { ...(asRecord(asRecord(run)?.font) ?? {}), ...fontPatch } })) }
            : {}),
        }
      })
      return { ui: next, selection: ctx.selection.value }
    })
  }

  function setFamily(value: string) {
    if (!value) return
    if (editor.value) editor.value.chain().focus().setMark('textStyle', { fontFamily: value }).run()
    else patchElement({ family: value })
  }
  /** Sets the size from a typed value (clamped 8-200); false when it is not a valid number. */
  function setSize(raw: string | number): boolean {
    const n = typeof raw === 'number' ? raw : raw.trim() === '' ? NaN : Number(raw)
    if (!Number.isFinite(n) || n <= 0) return false
    const fontSize = Math.min(200, Math.max(8, Math.round(n)))
    if (editor.value) editor.value.chain().focus().setMark('textStyle', { fontSize }).run()
    else patchElement({ size: fontSize })
    return true
  }
  function toggle(mark: Mark) {
    const e = editor.value
    if (!e) return patchElement({ [mark]: !font.value?.[mark] })
    const chain = e.chain().focus()
    if (mark === 'bold') chain.toggleBold().run()
    else if (mark === 'italic') chain.toggleItalic().run()
    else chain.toggleUnderline().run()
  }
  function setColor(value: string) {
    if (!/^#[0-9a-f]{6}$/i.test(value)) return
    if (editor.value) editor.value.chain().focus().setColor(value).run()
    else patchElement({ color: value })
  }
  function setAlign(value: Align) {
    if (editor.value) editor.value.chain().focus().setTextAlign(value).run()
    else patchElement({}, value)
  }
  function setLineHeight(n: number) {
    if (!Number.isFinite(n)) return
    if (editor.value) editor.value.chain().focus().setMark('textStyle', { lineHeight: n }).run()
    else patchElement({ line_height: n })
  }

  return { element, family, size, color, lineHeight, alignment, isOn, families, palette, lineHeights, aligns, setFamily, setSize, toggle, setColor, setAlign, setLineHeight }
}
