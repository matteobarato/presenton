import { describe, expect, it } from 'vitest'
import type { TextRun } from '@/render/legacy/components/slide-editor/types'
import { absoluteBoxForSelection, getElementAtSelection, type ElementSelection, type RawUi } from '@/slide-editor/model'
import { blankTextAt, docTextAlign, docToRuns, runsToDoc } from '@/slide-editor/tiptapRuns'
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
