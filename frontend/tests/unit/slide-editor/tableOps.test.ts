import { describe, expect, it } from 'vitest'
import {
  addColumn,
  addRow,
  canAddColumn,
  canAddRow,
  canDeleteColumn,
  canDeleteRow,
  canMoveColumn,
  clampCell,
  deleteColumn,
  deleteRow,
  moveColumn,
  setCellAlignment,
  setCellFill,
  setCellFont,
  setTableAlignment,
  setTableFont,
  tableCellAt,
  tableLimits,
  tableSize,
} from '@/slide-editor/tableOps'
import { readableTableTextColor } from '@/slide-editor/tableColors'
import type { RawElement } from '@/slide-editor/model'

function table(rows: string[][], extra: Record<string, unknown> = {}): RawElement {
  const cell = (text: string) => ({ runs: [{ text }] })
  return {
    type: 'table',
    columns: (rows[0] ?? []).map(cell),
    rows: rows.slice(1).map((r) => r.map(cell)),
    ...extra,
  }
}

const grid = (el: RawElement) =>
  [el.columns, ...el.rows].map((r: { runs: { text: string }[] }[]) => r.map((c) => c.runs[0].text))

function snapshotCheck(op: (t: RawElement) => unknown) {
  const t = table([['a', 'b'], ['c', 'd'], ['e', 'f']])
  const snap = JSON.parse(JSON.stringify(t))
  op(t)
  expect(t).toEqual(snap)
}

describe('tableOps', () => {
  it('tableSize counts the header row', () => {
    expect(tableSize(table([['a', 'b'], ['c', 'd'], ['e', 'f']]))).toEqual({ rows: 3, cols: 2 })
  })

  it('tableLimits', () => {
    expect(tableLimits(table([['a']]))).toEqual({ minRows: 2, maxRows: 8, minCols: 1, maxCols: 6 })
    expect(tableLimits(table([['a']], { min_rows: 3, max_rows: 5, max_columns: 4 }))).toEqual({
      minRows: 3, maxRows: 5, minCols: 1, maxCols: 4,
    })
    expect(tableLimits(table([['a']], { max_rows: 12 })).maxRows).toBe(8)
  })

  it('tableCellAt', () => {
    const t = table([['a', 'b'], ['c', 'd']])
    expect(tableCellAt(t, { row: 0, col: 1 })?.runs).toEqual([{ text: 'b' }])
    expect(tableCellAt(t, { row: 1, col: 0 })?.runs).toEqual([{ text: 'c' }])
    expect(tableCellAt(t, { row: 5, col: 0 })).toBeNull()
  })

  it('addRow copies style from the reference row', () => {
    const t = table([['a', 'b'], ['c', 'd'], ['e', 'f']])
    t.rows[0][0] = { ...t.rows[0][0], color: { color: '#111111' }, font: { size: 12 }, alignment: 'right', borders: { top: { color: '#000', width: 1 } } }
    const out = addRow(t, 1)
    expect(out.rows).toHaveLength(3)
    const added = out.rows[1][0]
    expect(added).toEqual({
      color: { color: '#111111' }, font: { size: 12 }, alignment: 'right',
      borders: { top: { color: '#000', width: 1 } }, runs: [{ text: '' }],
    })
    expect(grid(out)).toEqual([['a', 'b'], ['c', 'd'], ['', ''], ['e', 'f']])
  })

  it('addRow after the header copies the first body row style, not the header', () => {
    const t = table([['a', 'b'], ['c', 'd']])
    t.columns[0] = { ...t.columns[0], color: { color: '#000000' }, font: { color: '#FFFFFF', bold: true } }
    t.rows[0][0] = { ...t.rows[0][0], color: { color: '#EEEEEE' } }
    const out = addRow(t, 0)
    expect(grid(out)).toEqual([['a', 'b'], ['', ''], ['c', 'd']])
    expect(out.rows[0][0]).toEqual({ color: { color: '#EEEEEE' }, runs: [{ text: '' }] })
    // A header-only table gives a blank row.
    const lone = addRow(table([['a', 'b']]), 0)
    expect(lone.rows[0]).toEqual([{ runs: [{ text: '' }] }, { runs: [{ text: '' }] }])
  })

  it('addRow(null) appends', () => {
    const out = addRow(table([['a'], ['c']]), null)
    expect(grid(out)).toEqual([['a'], ['c'], ['']])
  })

  it('addColumn inserts after col and copies style per row', () => {
    const t = table([['a', 'b'], ['c', 'd']])
    t.rows[0][0] = { ...t.rows[0][0], alignment: 'center' }
    const out = addColumn(t, 0)
    expect(grid(out)).toEqual([['a', '', 'b'], ['c', '', 'd']])
    expect(out.rows[0][1].alignment).toBe('center')
  })

  it('addColumn(null) appends', () => {
    expect(grid(addColumn(table([['a'], ['c']]), null))).toEqual([['a', ''], ['c', '']])
  })

  it('can* guards', () => {
    const big = table(Array.from({ length: 8 }, () => ['a', 'b']))
    expect(canAddRow(big)).toBe(false)
    expect(canAddRow(table([['a'], ['b']]))).toBe(true)
    expect(canAddColumn(table(Array.from({ length: 2 }, () => ['a', 'b', 'c', 'd', 'e', 'f'])))).toBe(false)
    const t = table([['a', 'b'], ['c', 'd'], ['e', 'f']])
    expect(canDeleteRow(t, 0)).toBe(false)
    expect(canDeleteRow(t, null)).toBe(false)
    expect(canDeleteRow(t, 1)).toBe(true)
    expect(canDeleteRow(table([['a'], ['b']]), 1)).toBe(false)
    expect(canDeleteColumn(table([['a'], ['b'], ['c']]), 0)).toBe(false)
    expect(canDeleteColumn(t, 1)).toBe(true)
    expect(canDeleteColumn(t, null)).toBe(false)
    expect(canMoveColumn(t, 0, -1)).toBe(false)
    expect(canMoveColumn(t, 1, 1)).toBe(false)
    expect(canMoveColumn(t, 0, 1)).toBe(true)
    expect(canMoveColumn(t, null, 1)).toBe(false)
  })

  it('deleteRow / deleteColumn', () => {
    const t = table([['a', 'b'], ['c', 'd'], ['e', 'f']])
    expect(grid(deleteRow(t, 1))).toEqual([['a', 'b'], ['e', 'f']])
    expect(grid(deleteColumn(t, 0))).toEqual([['b'], ['d'], ['f']])
  })

  it('moveColumn swaps in header and rows', () => {
    const t = table([['a', 'b'], ['c', 'd']])
    expect(grid(moveColumn(t, 0, 1))).toEqual([['b', 'a'], ['d', 'c']])
  })

  it('pads short rows before ops', () => {
    const t = table([['a', 'b'], ['c', 'd']])
    t.rows[0] = [t.rows[0][0]]
    expect(grid(addRow(t, null))).toEqual([['a', 'b'], ['c', ''], ['', '']])
  })

  it('setCellFill on a body cell sets the colour and writes no font colour', () => {
    const t = table([['a', 'b'], ['c', 'd']])
    const out = setCellFill(t, { row: 1, col: 0 }, '#112233')
    expect(out.rows[0][0].color).toEqual({ color: '#112233' })
    expect(out.rows[0][0].font).toBeUndefined()
    expect(out.rows[0][1].color).toBeUndefined()
    const cleared = setCellFill(out, { row: 1, col: 0 }, null)
    expect(cleared.rows[0][0].color).toBeUndefined()
    expect(cleared.rows[0][0].font).toBeUndefined()
  })

  it('setCellFill keeps existing font colour and preserves fill opacity', () => {
    const t = table([['a']])
    t.columns[0] = { ...t.columns[0], font: { color: '#ABCDEF' }, color: { color: '#000000', opacity: 0.5 } }
    const out = setCellFill(t, { row: 0, col: 0 }, '#112233')
    expect(out.columns[0].font.color).toBe('#ABCDEF')
    expect(out.columns[0].color).toEqual({ color: '#112233', opacity: 0.5 })
    // None keeps a colour the user chose.
    expect(setCellFill(out, { row: 0, col: 0 }, null).columns[0].font.color).toBe('#ABCDEF')
  })

  it('setCellFill on an uncoloured header writes a readable colour, follows refills, and removes it on None', () => {
    const t = table([['a', 'b'], ['c', 'd']])
    const dark = setCellFill(t, { row: 0, col: 0 }, '#112233')
    expect(dark.columns[0].font.color).toBe(readableTableTextColor(undefined, '#112233'))
    expect(dark.columns[0].font.color).toBe('#FFFFFF')
    expect(dark.columns[1].font).toBeUndefined()
    // A light refill replaces the auto colour (the default text colour already reads, so none is written).
    const light = setCellFill(dark, { row: 0, col: 0 }, '#FFFFEE')
    expect(light.columns[0].font).toBeUndefined()
    const none = setCellFill(dark, { row: 0, col: 0 }, null)
    expect(none.columns[0].color).toBeUndefined()
    expect(none.columns[0].font).toBeUndefined()
  })

  it('setCellFill on a header whose runs or table font set a colour writes none', () => {
    const t = table([['a', 'b'], ['c', 'd']])
    t.columns[0] = { runs: [{ text: 'a', font: { color: '#FF0000' } }] }
    expect(setCellFill(t, { row: 0, col: 0 }, '#112233').columns[0].font).toBeUndefined()
    const light = table([['a'], ['b']], { font: { color: '#FFFFFF' } })
    expect(setCellFill(light, { row: 0, col: 0 }, '#112233').columns[0].font).toBeUndefined()
  })

  it('setCellFill(null) removes color and fill', () => {
    const t = table([['a', 'b']])
    t.columns[0] = { ...t.columns[0], color: { color: '#000' }, fill: { color: '#111' } }
    const out = setCellFill(t, { row: 0, col: 0 }, null)
    expect('color' in out.columns[0]).toBe(false)
    expect('fill' in out.columns[0]).toBe(false)
  })

  it('setCellAlignment touches one cell', () => {
    const out = setCellAlignment(table([['a', 'b'], ['c', 'd']]), { row: 1, col: 1 }, 'center')
    expect(out.rows[0][1].alignment).toBe('center')
    expect(out.rows[0][0].alignment).toBeUndefined()
    expect(out.columns[1].alignment).toBeUndefined()
  })

  it('setCellFont merges into cell and runs', () => {
    const out = setCellFont(table([['a', 'b']]), { row: 0, col: 1 }, { bold: true })
    expect(out.columns[1].font.bold).toBe(true)
    expect(out.columns[1].runs[0].font.bold).toBe(true)
    expect(out.columns[0].font).toBeUndefined()
  })

  it('clampCell', () => {
    expect(clampCell(table([['a', 'b'], ['c', 'd']]), { row: 5, col: 3 })).toEqual({ row: 1, col: 1 })
    expect(clampCell(table([['a', 'b'], ['c', 'd']]), { row: -1, col: 0 })).toEqual({ row: 0, col: 0 })
    expect(clampCell({ type: 'table', columns: [], rows: [] }, { row: 0, col: 0 })).toBeNull()
  })

  it('setTableFont patches the base font, every cell font and every run', () => {
    const t = table([['a', 'b'], ['c', 'd']], { font: { size: 12 } })
    const out = setTableFont(t, { bold: true })
    expect(out.font).toEqual({ size: 12, bold: true })
    for (const c of [...out.columns, ...out.rows[0]]) {
      expect(c.font).toEqual({ bold: true })
      expect(c.runs[0].font).toEqual({ bold: true })
    }
    snapshotCheck((x) => setTableFont(x, { bold: true }))
  })

  it('setTableAlignment aligns every cell', () => {
    const out = setTableAlignment(table([['a', 'b'], ['c', 'd']]), 'right')
    expect([...out.columns, ...out.rows[0]].map((c) => c.alignment)).toEqual(['right', 'right', 'right', 'right'])
  })

  it('never mutates the input', () => {
    snapshotCheck((t) => addRow(t, 1))
    snapshotCheck((t) => addColumn(t, 0))
    snapshotCheck((t) => deleteRow(t, 1))
    snapshotCheck((t) => deleteColumn(t, 0))
    snapshotCheck((t) => moveColumn(t, 0, 1))
    snapshotCheck((t) => setCellFill(t, { row: 1, col: 0 }, '#112233'))
    snapshotCheck((t) => setCellAlignment(t, { row: 1, col: 0 }, 'right'))
    snapshotCheck((t) => setCellFont(t, { row: 1, col: 0 }, { bold: true }))
  })
})
