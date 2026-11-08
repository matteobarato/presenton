import type { Box, Point } from '@/slide-editor/model'
import { rotatePoint, type Frame } from '@/slide-editor/rotation'
import type { TableCellRef } from '@/slide-editor/tableOps'

const centreOf = (box: Box): Point => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 })

/** The unrotated box of one cell when `box` is split evenly into `rows` x `cols`. */
export function cellBox(box: Box, rows: number, cols: number, cell: TableCellRef): Box {
  const width = box.width / cols
  const height = box.height / rows
  return { x: box.x + cell.col * width, y: box.y + cell.row * height, width, height }
}

/** The cell under on-screen point `p` of a (possibly rotated) table frame, or null outside it. */
export function cellAtPoint(frame: Frame, rows: number, cols: number, p: Point): TableCellRef | null {
  const { box } = frame
  if (rows < 1 || cols < 1 || box.width <= 0 || box.height <= 0) return null
  const q = rotatePoint(p, centreOf(box), -frame.rotation)
  const fx = (q.x - box.x) / box.width
  const fy = (q.y - box.y) / box.height
  if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return null
  return {
    row: Math.min(rows - 1, Math.floor(fy * rows)),
    col: Math.min(cols - 1, Math.floor(fx * cols)),
  }
}

/** The cell as a frame: its box centre carried about the table centre, with the table's rotation. */
export function cellFrame(frame: Frame, rows: number, cols: number, cell: TableCellRef): Frame {
  const local = cellBox(frame.box, rows, cols, cell)
  const c = rotatePoint(centreOf(local), centreOf(frame.box), frame.rotation)
  return {
    box: { x: c.x - local.width / 2, y: c.y - local.height / 2, width: local.width, height: local.height },
    rotation: frame.rotation,
  }
}
