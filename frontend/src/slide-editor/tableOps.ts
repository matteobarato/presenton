// Pure table operations over a raw table element. Never mutate the input.
// Row 0 is the header (`columns`); row r > 0 is `rows[r - 1]`.
// Cell fill read/write follows servers/nextjs/components/slide-editor/tables/TableToolbar.tsx
// (`color` as a Fill object, with the legacy `fill` as a read fallback).
import { asRecord, readArray, readNumber, type RawElement } from '@/slide-editor/model'
import { readableTableTextColor } from '@/slide-editor/tableColors'

export type RawRecord = Record<string, unknown>
export type TableCellRef = { row: number; col: number }

const DEFAULT_MIN_ROWS = 2
const DEFAULT_MAX_ROWS = 8
const DEFAULT_MIN_COLS = 1
const DEFAULT_MAX_COLS = 6
const STYLE_KEYS = ['color', 'font', 'alignment', 'borders'] as const

const emptyCell = (): RawRecord => ({ runs: [{ text: '' }] })

/** All rows including the header, each padded to the column count. */
function grid(el: RawElement): RawRecord[][] {
  const header = readArray(el.columns).map((c) => asRecord(c) ?? emptyCell())
  const body = readArray(el.rows).map((r) => readArray(r).map((c) => asRecord(c) ?? emptyCell()))
  const width = Math.max(header.length, ...body.map((r) => r.length), 0)
  return [header, ...body].map((r) => {
    const padded = [...r]
    while (padded.length < width) padded.push(emptyCell())
    return padded
  })
}

function fromGrid(el: RawElement, g: RawRecord[][]): RawElement {
  return { ...el, columns: g[0] ?? [], rows: g.slice(1) }
}

function styleOnlyCell(source: RawRecord | undefined): RawRecord {
  const cell: RawRecord = {}
  for (const key of STYLE_KEYS) {
    if (source && source[key] !== undefined) cell[key] = structuredClone(source[key])
  }
  cell.runs = [{ text: '' }]
  return cell
}

export function tableSize(el: RawElement): { rows: number; cols: number } {
  const g = grid(el)
  const rows = g[0] && g[0].length === 0 && g.length === 1 ? 0 : g.length
  return { rows, cols: g[0]?.length ?? 0 }
}

export function tableLimits(el: RawElement) {
  return {
    minRows: Math.max(DEFAULT_MIN_ROWS, readNumber(el.min_rows) ?? DEFAULT_MIN_ROWS),
    maxRows: Math.min(DEFAULT_MAX_ROWS, readNumber(el.max_rows) ?? DEFAULT_MAX_ROWS),
    minCols: Math.max(DEFAULT_MIN_COLS, readNumber(el.min_columns) ?? DEFAULT_MIN_COLS),
    maxCols: Math.min(DEFAULT_MAX_COLS, readNumber(el.max_columns) ?? DEFAULT_MAX_COLS),
  }
}

export function tableCellAt(el: RawElement, cell: TableCellRef): RawRecord | null {
  return grid(el)[cell.row]?.[cell.col] ?? null
}

export function addRow(el: RawElement, afterRow: number | null): RawElement {
  const g = grid(el)
  const at = afterRow == null ? g.length : Math.max(0, Math.min(g.length - 1, afterRow)) + 1
  const ref = g[afterRow == null ? g.length - 1 : Math.max(0, Math.min(g.length - 1, afterRow))] ?? []
  const width = g[0]?.length ?? 0
  const row = Array.from({ length: width }, (_, c) => styleOnlyCell(ref[c]))
  return fromGrid(el, [...g.slice(0, at), row, ...g.slice(at)])
}

export function addColumn(el: RawElement, afterCol: number | null): RawElement {
  const g = grid(el)
  const width = g[0]?.length ?? 0
  const ref = afterCol == null ? width - 1 : Math.max(0, Math.min(width - 1, afterCol))
  const at = ref + 1
  return fromGrid(
    el,
    g.map((r) => [...r.slice(0, at), styleOnlyCell(r[ref]), ...r.slice(at)]),
  )
}

export function deleteRow(el: RawElement, row: number): RawElement {
  const g = grid(el)
  return fromGrid(el, g.filter((_, i) => i !== row))
}

export function deleteColumn(el: RawElement, col: number): RawElement {
  return fromGrid(el, grid(el).map((r) => r.filter((_, i) => i !== col)))
}

export function moveColumn(el: RawElement, col: number, dir: -1 | 1): RawElement {
  const to = col + dir
  return fromGrid(
    el,
    grid(el).map((r) => {
      if (col < 0 || to < 0 || col >= r.length || to >= r.length) return r
      const next = [...r]
      ;[next[col], next[to]] = [next[to], next[col]]
      return next
    }),
  )
}

export function canAddRow(el: RawElement): boolean {
  return tableSize(el).rows < tableLimits(el).maxRows
}

export function canAddColumn(el: RawElement): boolean {
  return tableSize(el).cols < tableLimits(el).maxCols
}

export function canDeleteRow(el: RawElement, row: number | null): boolean {
  if (row == null || row < 1) return false
  const { rows } = tableSize(el)
  return row < rows && rows > tableLimits(el).minRows
}

export function canDeleteColumn(el: RawElement, col: number | null): boolean {
  if (col == null || col < 0) return false
  const { cols } = tableSize(el)
  return col < cols && cols > tableLimits(el).minCols
}

export function canMoveColumn(el: RawElement, col: number | null, dir: -1 | 1): boolean {
  if (col == null) return false
  const to = col + dir
  return col >= 0 && to >= 0 && col < tableSize(el).cols && to < tableSize(el).cols
}

function updateCell(el: RawElement, ref: TableCellRef, fn: (cell: RawRecord) => RawRecord): RawElement {
  const g = grid(el)
  const cell = g[ref.row]?.[ref.col]
  if (!cell) return el
  return fromGrid(el, g.map((r, ri) => (ri === ref.row ? r.map((c, ci) => (ci === ref.col ? fn(c) : c)) : r)))
}

export function setCellFill(el: RawElement, ref: TableCellRef, color: string | null): RawElement {
  return updateCell(el, ref, (cell) => {
    const next = { ...cell }
    if (color == null) {
      delete next.color
      delete next.fill
      return next
    }
    const existing = asRecord(cell.color) ?? asRecord(cell.fill) ?? {}
    next.color = { ...existing, color }
    delete next.fill
    const font = asRecord(cell.font) ?? {}
    if (!font.color) next.font = { ...font, color: readableTableTextColor(undefined, color) }
    return next
  })
}

export function setCellAlignment(el: RawElement, ref: TableCellRef, a: 'left' | 'center' | 'right'): RawElement {
  return updateCell(el, ref, (cell) => ({ ...cell, alignment: a }))
}

export function setCellFont(el: RawElement, ref: TableCellRef, patch: Record<string, unknown>): RawElement {
  return updateCell(el, ref, (cell) => ({
    ...cell,
    font: { ...asRecord(cell.font), ...patch },
    runs: readArray(cell.runs).map((run) => {
      const r = asRecord(run) ?? {}
      return { ...r, font: { ...asRecord(r.font), ...patch } }
    }),
  }))
}

export function clampCell(el: RawElement, cell: TableCellRef): TableCellRef | null {
  const { rows, cols } = tableSize(el)
  if (rows === 0 || cols === 0) return null
  return {
    row: Math.max(0, Math.min(rows - 1, cell.row)),
    col: Math.max(0, Math.min(cols - 1, cell.col)),
  }
}
