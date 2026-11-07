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
  elementWithInlineDraft,
  getElementAtSelection,
  isLatexTextRun,
  measureWordWrappedTextRunsHeight,
  mergeAdjacentTextRuns,
  normalizeMarkdownTextInUi,
  readArray,
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
}

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
  }
}

/** The ui with the editor's doc committed into the edited element, or null when nothing changed. */
export function inlineEditUi(session: InlineEditSession, doc: JSONContent): RawUi | null {
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
