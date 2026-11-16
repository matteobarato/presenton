import { describe, expect, it } from 'vitest'
import type { TextRun } from '@/render/legacy/components/slide-editor/types'
import { absoluteBoxForSelection, getElementAtSelection, type ElementSelection, type RawUi } from '@/slide-editor/model'
import {
  blankTableCellAt,
  blankTextAt,
  docTextAlign,
  docToRuns,
  inlineEditUi,
  runsToDoc,
  startCellEdit,
  startInlineEdit,
} from '@/slide-editor/tiptapRuns'
import { uiWithText } from './fixtures'

const sel: ElementSelection = { kind: 'element', componentIndex: 0, elementPath: [0] }

function uiWithList(): RawUi {
  const ui = uiWithText() as Record<string, unknown>
  const component = (ui.components as Record<string, unknown>[])[0]!
  return {
    ...ui,
    components: [
      {
        ...component,
        elements: [
          {
            type: 'text-list',
            marker: 'bullet',
            position: { x: 0, y: 0 },
            size: { width: 400, height: 120 },
            items: [{ text: 'One' }, { text: 'Two' }, { text: 'Three' }],
            font: { family: 'Arial', size: 20, color: '111111' },
          },
        ],
      },
    ],
  } as RawUi
}

describe('runsToDoc / docToRuns', () => {
  it('round-trips styled runs', () => {
    const runs: TextRun[] = [
      { text: 'Hel', font: { bold: true } },
      { text: 'lo', font: { color: '#ff0000' } },
    ]
    expect(docToRuns(runsToDoc(runs, false), false)).toEqual(runs)
  })

  it('round-trips every font field and boundary spaces', () => {
    const runs: TextRun[] = [
      { text: ' a ', font: { family: 'Inter', size: 30, color: '1A2B45', italic: true, underline: true, line_height: 1.5, letter_spacing: 2, opacity: 0.5 } },
      { text: 'b\nc', font: { bold: true } },
    ]
    expect(docToRuns(runsToDoc(runs, false), false)).toEqual(runs)
  })

  it('round-trips a text-list with 3 items', () => {
    const runs: TextRun[] = [{ text: '• One\n• Two\n• Three', font: { size: 20 } }]
    const doc = runsToDoc(runs, true)
    expect(doc.content).toHaveLength(3)
    const back = docToRuns(doc, true)
    expect(back).toEqual(runs)
    expect((back[0] as { text: string }).text.split('\n')).toHaveLength(3)
  })

  it('keeps latex runs', () => {
    const runs: TextRun[] = [{ text: 'x = ' }, { type: 'latex', latex: '\\frac{1}{2}', display_mode: false }]
    expect(docToRuns(runsToDoc(runs, false), false)).toEqual(runs)
  })

  it('an empty doc gives one empty run', () => {
    expect(docToRuns({ type: 'doc', content: [{ type: 'paragraph' }] }, false)).toEqual([{ text: '' }])
    expect(docToRuns({ type: 'doc' }, true)).toEqual([{ text: '' }])
  })

  it('fills fonts from the base font and writes explicit marks off', () => {
    const base = { family: 'Arial', size: 24, color: '#111111', bold: true, italic: false, underline: false, line_height: 1.2, letter_spacing: 0, opacity: 1 }
    const doc = runsToDoc([{ text: 'Hi', font: { bold: false } }], false, { baseFont: base })
    expect(docToRuns(doc, false, { baseFont: base })).toEqual([{ text: 'Hi', font: { ...base, bold: false } }])
  })

  it('carries the paragraph alignment', () => {
    expect(docTextAlign(runsToDoc([{ text: 'a' }], false, { align: 'center' }))).toBe('center')
    expect(docTextAlign(runsToDoc([{ text: 'a' }], false))).toBeNull()
  })
})

describe('blankTextAt', () => {
  it('blanks a text element and keeps its box', () => {
    const ui = uiWithText()
    const blank = blankTextAt(ui, sel)
    const element = getElementAtSelection(blank, sel)!
    expect(element.text).toBe('')
    expect(element.size).toEqual({ width: 400, height: 120 })
    expect(absoluteBoxForSelection(blank, sel)).toEqual(absoluteBoxForSelection(ui, sel))
    expect(getElementAtSelection(ui, sel)!.text).toBe('Hello')
  })

  it('blanks every text-list item and keeps its box', () => {
    const ui = uiWithList()
    const blank = blankTextAt(ui, sel)
    const element = getElementAtSelection(blank, sel)!
    expect((element.items as { text: string }[]).map((i) => i.text)).toEqual(['', '', ''])
    expect(absoluteBoxForSelection(blank, sel)).toEqual(absoluteBoxForSelection(ui, sel))
  })

  it('leaves other elements alone', () => {
    const ui = uiWithText()
    const image: ElementSelection = { kind: 'element', componentIndex: 3, elementPath: [0] }
    expect(blankTextAt(ui, image)).toBe(ui)
  })
})

// A 3x2 table: header row a|b, body c|d, e|f. 400x300, so cells are 200x100.
function uiWithTable(): RawUi {
  return {
    components: [
      {
        id: 'c-table',
        position: { x: 100, y: 100 },
        elements: [
          {
            type: 'table',
            position: { x: 20, y: 10 },
            size: { width: 400, height: 300 },
            font: { family: 'Inter', size: 20, color: '222222' },
            columns: [{ runs: [{ text: 'a' }] }, { runs: [{ text: 'b' }], alignment: 'center' }],
            rows: [
              [{ runs: [{ text: 'c' }] }, { runs: [{ text: 'd' }] }],
              [{ runs: [{ text: 'e' }] }, { runs: [{ text: 'f' }] }],
            ],
          },
        ],
      },
    ],
  } as unknown as RawUi
}
const tableSel: ElementSelection = { kind: 'element', componentIndex: 0, elementPath: [0] }
const helloDoc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }] }
const cellTexts = (ui: RawUi) => {
  const table = getElementAtSelection(ui, tableSel)!
  const text = (c: unknown) => ((c as { runs: { text: string }[] }).runs ?? []).map((r) => r.text).join('')
  return [(table.columns as unknown[]).map(text), ...(table.rows as unknown[][]).map((r) => r.map(text))]
}

describe('startInlineEdit target', () => {
  it('an element session targets the element', () => {
    expect(startInlineEdit(uiWithText(), sel, 's1')!.target).toEqual({ kind: 'element' })
  })
})

describe('startCellEdit', () => {
  it('opens on a header cell: bold, cell target, cell box frame, cell alignment', () => {
    const s = startCellEdit(uiWithTable(), tableSel, { row: 0, col: 1 }, 's1')!
    expect(s.target).toEqual({ kind: 'cell', row: 0, col: 1 })
    expect(s.kind).toBe('text')
    expect(s.style.bold).toBe(true)
    expect(s.style.family).toBe('Inter')
    expect(s.style.size).toBe(20)
    expect(s.style.horizontal).toBe('center')
    expect(s.frame).toEqual({ x: 220, y: 10, width: 200, height: 100 })
  })

  it('a header cell that sets bold false is not bold; a body cell is not bold', () => {
    const ui = uiWithTable()
    const table = getElementAtSelection(ui, tableSel)! as { columns: Record<string, unknown>[] }
    table.columns[0]!.font = { bold: false }
    expect(startCellEdit(ui, tableSel, { row: 0, col: 0 }, 's1')!.style.bold).toBe(false)
    expect(startCellEdit(ui, tableSel, { row: 1, col: 0 }, 's1')!.style.bold).toBe(false)
  })

  it('is null for a cell outside the table or a non-table element', () => {
    expect(startCellEdit(uiWithTable(), tableSel, { row: 5, col: 0 }, 's1')).toBeNull()
    expect(startCellEdit(uiWithText(), sel, { row: 0, col: 0 }, 's1')).toBeNull()
  })
})

describe('inlineEditUi for a cell', () => {
  it('writes the doc into that cell only and keeps the table size', () => {
    const ui = uiWithTable()
    const s = startCellEdit(ui, tableSel, { row: 0, col: 1 }, 's1')!
    const next = inlineEditUi(s, helloDoc)!
    expect(next).not.toBeNull()
    const table = getElementAtSelection(next, tableSel)!
    expect((table.columns as { runs: { text: string }[] }[])[1]!.runs[0]!.text).toBe('Hello')
    expect(cellTexts(next)).toEqual([['a', 'Hello'], ['c', 'd'], ['e', 'f']])
    expect(table.size).toEqual({ width: 400, height: 300 })
    expect(table.position).toEqual({ x: 20, y: 10 })
  })

  it('writes a changed alignment into the cell', () => {
    const s = startCellEdit(uiWithTable(), tableSel, { row: 1, col: 0 }, 's1')!
    const doc = runsToDoc(s.runs, false, { baseFont: s.baseFont, align: 'right' })
    const next = inlineEditUi(s, doc)!
    expect((getElementAtSelection(next, tableSel)!.rows as Record<string, unknown>[][])[0]![0]!.alignment).toBe('right')
  })

  it('an unchanged doc gives null', () => {
    const s = startCellEdit(uiWithTable(), tableSel, { row: 0, col: 1 }, 's1')!
    expect(inlineEditUi(s, s.doc)).toBeNull()
  })
})

describe('blankTableCellAt', () => {
  it('empties only that cell', () => {
    const ui = uiWithTable()
    const blank = blankTableCellAt(ui, tableSel, { row: 2, col: 1 })
    expect(cellTexts(blank)).toEqual([['a', 'b'], ['c', 'd'], ['e', '']])
    expect(cellTexts(ui)).toEqual([['a', 'b'], ['c', 'd'], ['e', 'f']])
  })
})
