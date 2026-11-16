// Ported from servers/nextjs/components/slide-editor/text/TiptapInlineTextEditor.tsx (runs <-> Tiptap
// JSON, boundary-space encoding, list marker prefixes, CSS font stack) and surface/TemplateV2KonvaSlide.tsx
// (openInlineEditor / closeInlineEditor / autoSizeInlineTextFrame). Changes: run styles map onto the
// standard Tiptap marks (bold, italic, underline, textStyle with color/fontFamily/fontSize/lineHeight/
// letterSpacing/opacity) instead of one custom runStyle mark, so toolbar commands such as toggleBold and
// setColor work; a text-list holds one paragraph per item; the LaTeX run node keeps its data but has no
// textarea node view; the commit builds the next ui without React state.
import { Extension, Node as TiptapNode, mergeAttributes, type JSONContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextStyle from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import TextAlign from '@tiptap/extension-text-align'
import type { Font, Marker, TextRun } from '@/render/legacy/components/slide-editor/types'
import {
  fontToSource,
  normalizeRawTextMarkdownElement,
  rawFont,
  rawTextListItemWithText,
  rawTextListRunsForEditor,
  rawTextStyle,
} from '@/render/legacy/components/slide-editor/text/template-v2-text'
import {
  asRecord,
  editorTableCellToRaw,
  elementWithInlineDraft,
  getElementAtSelection,
  isLatexTextRun,
  measureWordWrappedTextRunsHeight,
  mergeAdjacentTextRuns,
  normalizeMarkdownTextInUi,
  readArray,
  rawTableCellForEditor,
  readNumber,
  readString,
  renderedLocalBoxForElementSelection,
  syncComponentHeightToElement,
  textRunsContent,
  updateElementInUi,
  withHash,
  wordWrappedTextRuns,
  type Box,
  type ElementSelection,
  type RawElement,
  type RawUi,
  type TemplateV2TextEditStyle,
} from '@/slide-editor/model'
import { readableTableTextColor } from '@/slide-editor/tableColors'
import { cellBox } from '@/slide-editor/tableGeometry'
import { tableCellAt, tableSize, updateTableCell, type RawRecord, type TableCellRef } from '@/slide-editor/tableOps'

const NON_BREAKING_SPACE = '\u00A0'

export type TextAlignValue = TemplateV2TextEditStyle['horizontal']

export interface RunConvertOptions {
  /** Element font every run inherits; with it, decoded runs carry a full font (marks off → false). */
  baseFont?: Font
  /** Paragraph alignment written into the doc. */
  align?: TextAlignValue
}

/** Font fields stored as textStyle attributes (the rest are marks). */
const STYLE_FIELDS = [
  ['family', 'fontFamily'],
  ['size', 'fontSize'],
  ['color', 'color'],
  ['line_height', 'lineHeight'],
  ['letter_spacing', 'letterSpacing'],
  ['opacity', 'opacity'],
] as const satisfies ReadonlyArray<readonly [keyof Font, string]>

const MARK_FIELDS = [
  ['bold', 'bold'],
  ['italic', 'italic'],
  ['underline', 'underline'],
] as const satisfies ReadonlyArray<readonly [keyof Font, string]>

function encodeBoundarySpacesForEditor(text: string) {
  let start = 0
  while (start < text.length && text[start] === ' ') start += 1
  let end = text.length
  while (end > start && text[end - 1] === ' ') end -= 1
  return NON_BREAKING_SPACE.repeat(start) + text.slice(start, end) + NON_BREAKING_SPACE.repeat(text.length - end)
}

function decodeEditorSpaces(text: string) {
  return text.replace(/\u00A0/g, ' ')
}

function runFont(run: TextRun, baseFont?: Font): Font {
  return { ...(baseFont ?? {}), ...(run.font ?? {}) }
}

function marksForFont(font: Font): JSONContent['marks'] {
  const marks: NonNullable<JSONContent['marks']> = []
  for (const [field, mark] of MARK_FIELDS) if (font[field]) marks.push({ type: mark })
  const attrs: Record<string, unknown> = {}
  for (const [field, attr] of STYLE_FIELDS) if (font[field] != null) attrs[attr] = font[field]
  if (Object.keys(attrs).length > 0) marks.push({ type: 'textStyle', attrs })
  return marks
}

function fontFromMarks(marks: JSONContent['marks'], baseFont?: Font): Font | undefined {
  const font: Font = { ...(baseFont ?? {}) }
  const style = marks?.find((m) => m.type === 'textStyle')?.attrs ?? {}
  for (const [field, attr] of STYLE_FIELDS) {
    const value = style[attr]
    if (value != null) (font as Record<string, unknown>)[field] = value
  }
  for (const [field, mark] of MARK_FIELDS) {
    if (marks?.some((m) => m.type === mark)) font[field] = true
    else if (baseFont) font[field] = false
  }
  return Object.keys(font).length > 0 ? font : undefined
}

/** Text runs → Tiptap doc. Text is one paragraph with hard breaks; a list is one paragraph per item. */
export function runsToDoc(runs: TextRun[], list: boolean, options: RunConvertOptions = {}): JSONContent {
  const { baseFont, align } = options
  const paragraphs: JSONContent[][] = [[]]
  const current = () => paragraphs[paragraphs.length - 1]!

  for (const run of runs) {
    const font = runFont(run, baseFont)
    if (isLatexTextRun(run)) {
      current().push({
        type: 'latexRun',
        attrs: { latex: run.latex, displayMode: run.display_mode ?? false, font: run.font ?? null },
      })
      continue
    }
    const marks = marksForFont(font)
    run.text.split('\n').forEach((part, index) => {
      if (index > 0) {
        if (list) paragraphs.push([])
        else current().push({ type: 'hardBreak' })
      }
      if (part) current().push({ type: 'text', text: encodeBoundarySpacesForEditor(part), ...(marks?.length ? { marks } : {}) })
    })
  }

  return {
    type: 'doc',
    content: paragraphs.map((content) => ({
      type: 'paragraph',
      ...(align ? { attrs: { textAlign: align } } : {}),
      ...(content.length > 0 ? { content } : {}),
    })),
  }
}

/**
 * Tiptap doc → text runs. Paragraph boundaries and hard breaks both become "\n", so either shape
 * decodes; in a list an empty trailing item (Enter at the end) is dropped. An empty doc gives one empty run.
 */
export function docToRuns(doc: JSONContent, list: boolean, options: Pick<RunConvertOptions, 'baseFont'> = {}): TextRun[] {
  const { baseFont } = options
  const runs: TextRun[] = []
  let lastFont = baseFont ? { ...baseFont } : undefined
  let paragraphs = 0

  const append = (text: string, font: Font | undefined) => {
    if (!text) return
    lastFont = font
    runs.push(font ? { text, font } : { text })
  }
  const visit = (node: JSONContent) => {
    if (node.type === 'paragraph') {
      if (paragraphs > 0) append('\n', lastFont)
      paragraphs += 1
      node.content?.forEach(visit)
      return
    }
    if (node.type === 'hardBreak') {
      append('\n', lastFont)
      return
    }
    if (node.type === 'text') {
      append(decodeEditorSpaces(node.text ?? ''), fontFromMarks(node.marks, baseFont))
      return
    }
    if (node.type === 'latexRun') {
      const latex = typeof node.attrs?.latex === 'string' ? node.attrs.latex : ''
      if (!latex) return
      const sourceFont = asRecord(node.attrs?.font) as Font | null
      const font = baseFont || sourceFont ? { ...(baseFont ?? {}), ...(sourceFont ?? {}) } : undefined
      lastFont = font
      runs.push({ type: 'latex', latex, display_mode: node.attrs?.displayMode === true, ...(font ? { font } : {}) })
      return
    }
    node.content?.forEach(visit)
  }
  const blocks = doc.content ?? []
  const last = blocks[blocks.length - 1]
  const trailingEmpty = list && blocks.length > 1 && last?.type === 'paragraph' && !last.content?.length
  ;(trailingEmpty ? blocks.slice(0, -1) : blocks).forEach(visit)
  return runs.length > 0 ? mergeAdjacentTextRuns(runs) : [{ text: '' }]
}

/** The doc's paragraph alignment (first paragraph), or null when none is set. */
export function docTextAlign(doc: JSONContent): TextAlignValue | null {
  const first = doc.content?.find((n) => n.type === 'paragraph')
  const align = readString(first?.attrs?.textAlign)
  return align === 'left' || align === 'center' || align === 'right' || align === 'justify' ? align : null
}

/** The ui with the text of the element at `sel` emptied (geometry kept), for rendering under the editor. */
export function blankTextAt(ui: RawUi, sel: ElementSelection): RawUi {
  const element = getElementAtSelection(ui, sel)
  const type = readString(element?.type)
  if (!element || (type !== 'text' && type !== 'text-list')) return ui
  return updateElementInUi(ui, sel, (el) => {
    if (type === 'text') {
      const runs = readArray(el.runs).map((run) => {
        const record = asRecord(run)
        if (!record) return run
        return readString(record.type) === 'latex' ? { ...record, latex: '' } : { ...record, text: '' }
      })
      return { ...el, text: '', ...(Array.isArray(el.runs) ? { runs } : {}) }
    }
    // The editor shows the list's markers as text, so the rendered markers go too.
    return { ...el, marker: 'none', items: readArray(el.items).map((item) => rawTextListItemWithText(item, '')) }
  })
}

export function cssFontFamilyStack(family: string) {
  const escaped = family.trim().replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n\f]/g, ' ')
  return `"${escaped || 'Arial'}", Helvetica, sans-serif`
}

function cssColor(color: unknown) {
  return typeof color === 'string' ? (withHash(color) ?? color) : null
}

// textStyle attributes for the run font fields. Pasted HTML carries no run styling (as before).
const RunFont = Extension.create({
  name: 'runFont',
  addGlobalAttributes() {
    const attr = (name: string, css: (value: unknown) => string | null) => ({
      default: null,
      parseHTML: () => null,
      renderHTML: (attrs: Record<string, unknown>) => {
        const value = attrs[name]
        const style = value == null ? null : css(value)
        return style ? { style } : {}
      },
    })
    return [
      {
        types: ['textStyle'],
        attributes: {
          color: attr('color', (v) => (cssColor(v) ? `color: ${cssColor(v)}` : null)),
          fontFamily: attr('fontFamily', (v) => (typeof v === 'string' ? `font-family: ${cssFontFamilyStack(v)}` : null)),
          fontSize: attr('fontSize', (v) => (typeof v === 'number' ? `font-size: ${v}px` : null)),
          lineHeight: attr('lineHeight', (v) => (typeof v === 'number' ? `line-height: ${v}` : null)),
          letterSpacing: attr('letterSpacing', (v) => (typeof v === 'number' ? `letter-spacing: ${v}px` : null)),
          opacity: attr('opacity', (v) => (typeof v === 'number' ? `opacity: ${v}` : null)),
        },
      },
    ]
  },
})

const LatexRun = TiptapNode.create({
  name: 'latexRun',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    return { latex: { default: '' }, displayMode: { default: false }, font: { default: null } }
  },
  parseHTML() {
    return [{ tag: 'span[data-slide-latex-run]', getAttrs: (el) => ({ latex: (el as HTMLElement).dataset.latex ?? '' }) }]
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, { 'data-slide-latex-run': 'true', 'data-latex': node.attrs.latex, contenteditable: 'false' }),
      node.attrs.latex,
    ]
  },
  renderText({ node }) {
    return node.attrs.latex
  },
})

/** Tiptap extensions for the inline text editor. Only what the run model can store is enabled. */
export function inlineTextExtensions() {
  return [
    StarterKit.configure({
      heading: false,
      bulletList: false,
      orderedList: false,
      listItem: false,
      blockquote: false,
      codeBlock: false,
      horizontalRule: false,
      code: false,
      strike: false,
    }),
    Underline,
    TextStyle,
    // RunFont owns the textStyle `color` attribute (stored colours may lack '#'); Color adds setColor/unsetColor.
    Color.configure({ types: [] }),
    TextAlign.configure({ types: ['paragraph'] }),
    RunFont,
    LatexRun,
  ]
}

/** The marker prefix a new list line starts with ("• " or "N. "). */
export function nextListMarkerPrefix(textBeforeCursor: string, marker: Marker | null) {
  if (!marker || marker === 'none') return ''
  if (marker === 'bullet') return '• '
  const previousItems = textBeforeCursor.split('\n').filter((line) => line.trim().length > 0).length
  return `${previousItems + 1}. `
}

/** Everything the inline editor needs, captured when it opens. */
export interface InlineEditSession {
  slideId: string
  /** Deck the edit was opened on; its commit goes there. */
  deckId?: string
  selection: ElementSelection
  /** The element being edited (markdown already rendered into runs). */
  element: RawElement
  /** The ui the edit applies to. */
  ui: RawUi
  kind: 'text' | 'text-list'
  runs: TextRun[]
  style: TemplateV2TextEditStyle
  baseFont: Font
  /** Element-local frame, auto-sized to the text. */
  frame: Box | null
  listMarker: Marker | null
  doc: JSONContent
  /** Runs signature at open, to skip a commit when nothing changed. */
  baseline: string
  /** What the edit writes to: the element itself, or one cell of the table at `selection`. */
  target: InlineEditTarget
}

export type InlineEditTarget = { kind: 'element' } | { kind: 'cell'; row: number; col: number }

function autoSizeInlineTextFrame(frame: Box | null, runs: TextRun[], style: TemplateV2TextEditStyle): Box | null {
  if (!frame) return frame
  return { ...frame, height: Math.max(1, measureWordWrappedTextRunsHeight(runs, frame.width, style)) }
}

const runsSignature = (runs: TextRun[]) => JSON.stringify(runs)

/** Opens an inline edit for a text or text-list element, or null for anything else. */
export function startInlineEdit(ui: RawUi, selection: ElementSelection, slideId: string): InlineEditSession | null {
  const raw = getElementAtSelection(ui, selection)
  const type = readString(raw?.type)
  if (!raw || (type !== 'text' && type !== 'text-list')) return null
  const kind = type
  let element: RawElement = raw
  let runs: TextRun[]
  let listMarker: Marker | null = null
  if (kind === 'text') {
    const normalized = normalizeRawTextMarkdownElement(raw)
    element = normalized.element
    runs = wordWrappedTextRuns(normalized.runs)
  } else {
    runs = wordWrappedTextRuns(rawTextListRunsForEditor(raw))
    const marker = readString(raw.marker)
    listMarker = marker === 'number' || marker === 'none' ? marker : 'bullet'
  }
  const style = rawTextStyle(element)
  const baseFont: Font = { ...fontToSource(rawFont(element)), color: style.color }
  const list = kind === 'text-list'
  const doc = runsToDoc(runs, list, { baseFont, align: style.horizontal })
  return {
    slideId,
    selection,
    element,
    ui,
    kind,
    runs,
    style,
    baseFont,
    frame: autoSizeInlineTextFrame(renderedLocalBoxForElementSelection(ui, selection), runs, style),
    listMarker,
    doc,
    baseline: runsSignature(docToRuns(doc, list, { baseFont })),
    target: { kind: 'element' },
  }
}

/** The ui with the editor's doc committed into the edited element, or null when nothing changed. */
export function inlineEditUi(session: InlineEditSession, doc: JSONContent): RawUi | null {
  if (session.target.kind === 'cell') return cellEditUi(session, session.target, doc)
  const list = session.kind === 'text-list'
  const runs = docToRuns(doc, list, { baseFont: session.baseFont })
  const align = docTextAlign(doc) ?? 'left'
  const alignChanged = align !== session.style.horizontal
  if (runsSignature(runs) === session.baseline && !alignChanged) return null
  const wrapped = wordWrappedTextRuns(runs)
  const frame = autoSizeInlineTextFrame(session.frame, wrapped, session.style)
  const next = updateElementInUi(session.ui, session.selection, () => {
    const edited = elementWithInlineDraft(session.element, session.kind, textRunsContent(wrapped), session.style, frame, wrapped)
    return alignChanged ? { ...edited, alignment: { ...(asRecord(edited.alignment) ?? {}), horizontal: align } } : edited
  })
  return normalizeMarkdownTextInUi(syncComponentHeightToElement(next, session.selection))
}

// ---- Table cells ----
// The cell font, alignment and padding follow renderTable / tableCellStyle / cellText in
// render/legacy/lib/template-v2-json-to-html.ts, so the editor sits exactly over the rendered cell.
// Ported in spirit from servers/nextjs/components/slide-editor/tables/TableInlineEditor.tsx.

const TABLE_BASE_FONT = { family: 'Arial', size: 18, color: '#111827', line_height: 1.15 }
const CELL_PADDING = { top: 4, right: 6, bottom: 4, left: 6 }

function tableFontRecord(table: RawElement): RawRecord {
  return { ...TABLE_BASE_FONT, ...(asRecord(table.font) ?? {}) }
}

function cellFirstRunFont(cell: RawRecord): RawRecord {
  return asRecord(asRecord(readArray(cell.runs)[0])?.font) ?? {}
}

/** Header cells render bold unless the cell, its first run or its text sets `bold` itself. */
function cellHasExplicitBold(cell: RawRecord): boolean {
  const has = (font: unknown) => Object.prototype.hasOwnProperty.call(asRecord(font) ?? {}, 'bold')
  return has(cell.font) || has(cellFirstRunFont(cell)) || has(asRecord(cell.text)?.font)
}

function cellAlignment(cell: RawRecord): TextAlignValue {
  const value =
    readString(cell.alignment) ??
    readString(asRecord(cell.alignment)?.horizontal) ??
    readString(asRecord(asRecord(cell.text)?.alignment)?.horizontal)
  return value === 'center' || value === 'right' || value === 'justify' ? value : 'left'
}

function cellFill(cell: RawRecord): string | null {
  return readString(asRecord(cell.color ?? cell.fill)?.color) ?? null
}

/** The rendered cell's border widths plus its padding: where its text box starts inside the cell. */
export function tableCellInsets(table: RawElement, ref: TableCellRef) {
  const cell = tableCellAt(table, ref) ?? {}
  const borders = asRecord(cell.borders)
  const width = (stroke: unknown, fallback: number) => Math.max(0, readNumber(asRecord(stroke)?.width) ?? fallback)
  const uniform = width(cell.stroke, 1)
  const side = (name: 'top' | 'right' | 'bottom' | 'left') => (borders ? width(borders[name], 0) : uniform)
  return {
    top: CELL_PADDING.top + side('top'),
    right: CELL_PADDING.right + side('right'),
    bottom: CELL_PADDING.bottom + side('bottom'),
    left: CELL_PADDING.left + side('left'),
  }
}

/** Opens an inline edit on one cell of the table at `root`, or null when there is no such cell. */
export function startCellEdit(ui: RawUi, root: ElementSelection, ref: TableCellRef, slideId: string): InlineEditSession | null {
  const table = getElementAtSelection(ui, root)
  if (!table || readString(table.type) !== 'table') return null
  const raw = tableCellAt(table, ref)
  const localBox = renderedLocalBoxForElementSelection(ui, root)
  if (!raw || !localBox) return null
  const { rows, cols } = tableSize(table)
  const header = ref.row === 0
  const forceBold = header && !cellHasExplicitBold(raw)

  const editorCell = rawTableCellForEditor(raw)
  const sourceRuns = (readArray(editorCell.runs) as TextRun[]).map((run) => {
    const { font, ...rest } = run as TextRun & { font?: Font }
    return (font ? { ...rest, font } : rest) as TextRun
  })
  const storedText = typeof raw.text === 'string' ? raw.text : textRunsContent(sourceRuns)
  const runs = wordWrappedTextRuns(
    normalizeRawTextMarkdownElement({ type: 'text', text: storedText, runs: sourceRuns }).runs,
  )

  // Runs inherit the table font under the cell font; the box shows the cell as rendered (first run included).
  const inherited = { ...tableFontRecord(table), ...(asRecord(raw.font) ?? {}) }
  const shown = { ...inherited, ...cellFirstRunFont(raw) }
  const fill = cellFill(raw)
  const color = (font: RawRecord) =>
    header ? (withHash(readString(font.color)) ?? '#111827') : readableTableTextColor(readString(font.color), fill)
  const base = rawFont({ font: inherited })
  const baseFont: Font = { ...fontToSource(base), color: color(inherited), ...(forceBold ? { bold: true } : {}) }
  const shownFont = rawFont({ font: shown })
  const align = cellAlignment(raw)
  const style: TemplateV2TextEditStyle = {
    ...shownFont,
    color: color(shown),
    bold: forceBold || shownFont.bold,
    horizontal: align,
    vertical: 'middle',
  }
  const doc = runsToDoc(runs, false, { baseFont, align })
  return {
    slideId,
    selection: root,
    element: table,
    ui,
    kind: 'text',
    runs,
    style,
    baseFont,
    frame: cellBox(localBox, rows, cols, ref),
    listMarker: null,
    doc,
    baseline: runsSignature(docToRuns(doc, false, { baseFont })),
    target: { kind: 'cell', row: ref.row, col: ref.col },
  }
}

function cellEditUi(session: InlineEditSession, ref: TableCellRef, doc: JSONContent): RawUi | null {
  const runs = docToRuns(doc, false, { baseFont: session.baseFont })
  const align = docTextAlign(doc) ?? 'left'
  const alignChanged = align !== session.style.horizontal
  if (runsSignature(runs) === session.baseline && !alignChanged) return null
  const wrapped = wordWrappedTextRuns(runs)
  // Only the cell changes: no auto-size, the table frame stays.
  return updateElementInUi(session.ui, session.selection, (table) =>
    updateTableCell(table, ref, (cell) => {
      const next: RawRecord = editorTableCellToRaw({ ...rawTableCellForEditor(cell), runs: wrapped }, cell)
      // The renderer reads a stored string `text` over the runs' own text, so it follows them.
      if (typeof cell.text === 'string') next.text = textRunsContent(wrapped)
      if (alignChanged) next.alignment = align
      return next
    }),
  )
}

/** The ui with one table cell's text emptied (its fill and borders kept), for rendering under the editor. */
export function blankTableCellAt(ui: RawUi, root: ElementSelection, ref: TableCellRef): RawUi {
  const table = getElementAtSelection(ui, root)
  if (!table || readString(table.type) !== 'table' || !tableCellAt(table, ref)) return ui
  return updateElementInUi(ui, root, (el) =>
    updateTableCell(el, ref, (cell) => {
      const runs = readArray(cell.runs).map((run) => {
        const record = asRecord(run) ?? {}
        return readString(record.type) === 'latex' ? { ...record, latex: '' } : { ...record, text: '' }
      })
      return { ...cell, runs: runs.length > 0 ? runs : [{ text: '' }], ...('text' in cell ? { text: '' } : {}) }
    }),
  )
}
