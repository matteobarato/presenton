import {
  absoluteBoxForSelection,
  getElementAtSelection,
  ROOT_ELEMENTS_COMPONENT_INDEX,
  type Box,
  type ComponentSelection,
  type ElementSelection,
  type Point,
  type RawUi,
} from '@/slide-editor/model'
import { rotatedBox } from '@/slide-editor/model/template-v2-group'

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

/** `box` is the unrotated size placed so its centre is the on-screen centre; `rotation` is in degrees. */
export type Frame = { box: Box; rotation: number }

type Rec = Record<string, unknown>

const isRec = (v: unknown): v is Rec => !!v && typeof v === 'object' && !Array.isArray(v)
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

const centreOf = (box: Box): Point => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 })

/** Rotates `p` about `center` by `deg` degrees clockwise on screen (y grows downward). */
export function rotatePoint(p: Point, center: Point, deg: number): Point {
  if (deg === 0) return { x: p.x, y: p.y }
  const rad = (deg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const dx = p.x - center.x
  const dy = p.y - center.y
  return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos }
}

type Transform = { rotation: number; flipH: boolean; flipV: boolean }

/** Reads an element or component the way `transformStyle` does in the renderer. */
function transformOf(item: unknown): Transform {
  if (!isRec(item)) return { rotation: 0, flipH: false, flipV: false }
  return {
    rotation: num(item.rotation),
    flipH: (item.flip_h ?? item.flipH) === true,
    flipV: (item.flip_v ?? item.flipV) === true,
  }
}

const isIdentity = (t: Transform) => t.rotation === 0 && !t.flipH && !t.flipV

/**
 * Where the renderer draws the selection. `transformStyle` emits
 * `rotate(r) scaleX(-1) scaleY(-1)` with `transform-origin: center`, so a point p of the item
 * lands at C + R(r)·S·(p - C): the flips apply first, then the rotation, about the item's own
 * box centre C. Every group/container, and the component, transforms its content that way, so
 * we walk from the element outward: map the running centre through each ancestor, and fold the
 * angle in as `r + a`, or `r - a` under an odd ancestor flip (S·R(a)·S⁻¹ = R(-a) for one flip).
 */
export function selectionFrame(
  ui: RawUi,
  sel: ComponentSelection | ElementSelection,
): Frame | null {
  const box = absoluteBoxForSelection(ui, sel)
  if (!box) return null
  let rotation = 0
  const ancestors: { box: Box; transform: Transform }[] = []
  if (sel.kind === 'component') {
    rotation = transformOf((ui.components as unknown[] | undefined)?.[sel.componentIndex]).rotation
  } else {
    rotation = transformOf(getElementAtSelection(ui, sel)).rotation
    for (let depth = sel.elementPath.length - 1; depth >= 1; depth -= 1) {
      const prefix: ElementSelection = { ...sel, elementPath: sel.elementPath.slice(0, depth) }
      const ancestorBox = absoluteBoxForSelection(ui, prefix)
      if (ancestorBox) {
        ancestors.push({ box: ancestorBox, transform: transformOf(getElementAtSelection(ui, prefix)) })
      }
    }
    if (sel.componentIndex !== ROOT_ELEMENTS_COMPONENT_INDEX) {
      const componentBox = absoluteBoxForSelection(ui, {
        kind: 'component',
        componentIndex: sel.componentIndex,
      })
      if (componentBox) {
        ancestors.push({
          box: componentBox,
          transform: transformOf((ui.components as unknown[] | undefined)?.[sel.componentIndex]),
        })
      }
    }
  }

  if (ancestors.every((a) => isIdentity(a.transform))) return { box, rotation }

  let centre = centreOf(box)
  for (const { box: ancestorBox, transform } of ancestors) {
    const origin = centreOf(ancestorBox)
    const local = {
      x: (centre.x - origin.x) * (transform.flipH ? -1 : 1),
      y: (centre.y - origin.y) * (transform.flipV ? -1 : 1),
    }
    centre = rotatePoint({ x: origin.x + local.x, y: origin.y + local.y }, origin, transform.rotation)
    rotation = transform.rotation + (transform.flipH !== transform.flipV ? -rotation : rotation)
  }
  return {
    box: { x: centre.x - box.width / 2, y: centre.y - box.height / 2, width: box.width, height: box.height },
    rotation,
  }
}

/** Whether `p` lies inside the (possibly rotated) frame, edges included. */
export function pointInFrame(frame: Frame, p: Point): boolean {
  const { box } = frame
  const q = rotatePoint(p, centreOf(box), -frame.rotation)
  return q.x >= box.x && q.x <= box.x + box.width && q.y >= box.y && q.y <= box.y + box.height
}

/** The axis-aligned box that bounds the frame. */
export function aabb(frame: Frame): Box {
  return rotatedBox(frame.box, frame.rotation)
}

/**
 * The translation that keeps the handle opposite `handle` fixed on screen after a resize.
 * `resizedBox` leaves that opposite point where it was in the unrotated box, so only the centre
 * moves: its screen position is c + R(a - c), hence shift = (c - c') - R(c - c').
 */
export function rotatedResizeShift(source: Box, next: Box, _handle: Handle, rotation: number): Point {
  const c = centreOf(source)
  const n = centreOf(next)
  const d = { x: c.x - n.x, y: c.y - n.y }
  const r = rotatePoint(d, { x: 0, y: 0 }, rotation)
  return { x: d.x - r.x, y: d.y - r.y }
}
