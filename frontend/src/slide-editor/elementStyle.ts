// Pure style readers/writers for vector shapes, lines, icons, lists and appearance.
// Every setter returns a new element and keeps unknown fields.
// Curve and corner-radius rules ported from
// servers/nextjs/components/slide-editor/shapes/ShapeToolbar.tsx.
import { readNumber, readString, withHash, type RawElement } from '@/slide-editor/model'

type Rec = Record<string, unknown>

export const DEFAULT_FILL = { color: '#FFFFFF', opacity: 1 }
export const DEFAULT_STROKE = { color: '#1A1A1A', opacity: 1, width: 1.5 }
export const DEFAULT_SHADOW = { color: '#000000', blur: 10, opacity: 0.18, offset_x: 6, offset_y: 6 }

export type DashStyle = 'solid' | 'dashed' | 'dotted'
export type Shadow = typeof DEFAULT_SHADOW
export type IconWeight = 'bold' | 'duotone' | 'fill' | 'light' | 'regular' | 'thin'
export type VectorMarker = 'none' | 'arrow' | 'stealth' | 'triangle' | 'circle' | 'square' | 'diamond'

export type ShapeStyle = {
  fill: { color: string; opacity: number }
  fillEnabled: boolean
  stroke: { color: string; opacity: number; width: number; dash: number[] | null }
  strokeEnabled: boolean
  dash: DashStyle
  radius: number
  maxRadius: number
  canRoundCorners: boolean
  curve: 'none' | 'smooth'
}

export type Appearance = {
  opacity: number
  flipH: boolean
  flipV: boolean
  shadow: Shadow
  shadowEnabled: boolean
}

export const VECTOR_MARKERS: { label: string; value: VectorMarker }[] = [
  { label: 'None', value: 'none' },
  { label: 'Arrow', value: 'arrow' },
  { label: 'Stealth arrow', value: 'stealth' },
  { label: 'Filled arrow', value: 'triangle' },
  { label: 'Circle', value: 'circle' },
  { label: 'Square', value: 'square' },
  { label: 'Diamond', value: 'diamond' },
]

function rec(value: unknown): Rec | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Rec) : null
}

function points(el: RawElement): Rec[] {
  return Array.isArray(el.points) ? (el.points as unknown[]).map((p) => rec(p) ?? {}) : []
}

function pointBounds(el: RawElement) {
  const pts = points(el)
  const xs = pts.map((p) => readNumber(p.x) ?? 0)
  const ys = pts.map((p) => readNumber(p.y) ?? 0)
  if (!pts.length) return { w: 0, h: 0 }
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
}

export function isOpenVector(el: RawElement): boolean {
  return el.type === 'vector' && el.shape !== 'ellipse' && el.closed === false
}

function readStroke(el: RawElement) {
  const s = rec(el.stroke)
  return {
    color: withHash(readString(s?.color)) ?? DEFAULT_STROKE.color,
    opacity: readNumber(s?.opacity) ?? DEFAULT_STROKE.opacity,
    width: readNumber(s?.width) ?? DEFAULT_STROKE.width,
  }
}

function readDash(el: RawElement): number[] | null {
  const dash = rec(el.stroke)?.dash
  if (!Array.isArray(dash)) return null
  const nums = dash.filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
  return nums.length ? nums : null
}

function dashStyleOf(dash: number[] | null, width: number): DashStyle {
  if (!dash) return 'solid'
  return dash[0] / (width || 1) <= 1.5 ? 'dotted' : 'dashed'
}

function averageRadius(value: unknown) {
  if (!Array.isArray(value)) return 0
  const radii = value.filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
  return radii.length ? radii.reduce((a, b) => a + b, 0) / radii.length : 0
}

function canRound(el: RawElement) {
  return el.type === 'vector' && el.shape !== 'ellipse' && el.closed !== false && points(el).length === 4
}

function maxRadiusOf(el: RawElement) {
  const { w, h } = pointBounds(el)
  return Math.max(1, Math.min(128, w / 2, h / 2))
}

export function readShapeStyle(el: RawElement): ShapeStyle {
  const fill = rec(el.fill)
  const stroke = readStroke(el)
  const dash = readDash(el)
  const maxRadius = maxRadiusOf(el)
  return {
    fill: {
      color: withHash(readString(fill?.color)) ?? DEFAULT_FILL.color,
      opacity: readNumber(fill?.opacity) ?? DEFAULT_FILL.opacity,
    },
    fillEnabled: fill != null,
    stroke: { ...stroke, dash },
    strokeEnabled: rec(el.stroke) != null && stroke.width > 0,
    dash: dashStyleOf(dash, stroke.width),
    radius: Math.min(maxRadius, averageRadius(el.corner_radii)),
    maxRadius,
    canRoundCorners: canRound(el),
    curve: rec(el.curve)?.type === 'smooth' ? 'smooth' : 'none',
  }
}

export function setFill(el: RawElement, fill: { color: string; opacity: number } | null): RawElement {
  return { ...el, fill: fill ? { ...rec(el.fill), ...fill } : null }
}

function applyDash(stroke: Rec, style: DashStyle, width: number): Rec {
  const rest = { ...stroke }
  delete rest.dash
  delete rest.line_cap
  if (style === 'dashed') return { ...rest, dash: [width * 3, width * 2] }
  if (style === 'dotted') return { ...rest, dash: [width, width * 1.5], line_cap: 'round' }
  return { ...rest, dash: null }
}

export function setStroke(
  el: RawElement,
  stroke: Partial<{ color: string; opacity: number; width: number }> | null,
): RawElement {
  if (!stroke) return { ...el, stroke: null }
  const current = readStroke(el)
  const style = dashStyleOf(readDash(el), current.width)
  const existing = rec(el.stroke) ?? {}
  let next: Rec = { ...existing, ...current, ...stroke }
  if (stroke.width != null && style !== 'solid') next = applyDash(next, style, stroke.width)
  return { ...el, stroke: next }
}

export function setDash(el: RawElement, d: DashStyle): RawElement {
  const current = readStroke(el)
  const next = applyDash({ ...(rec(el.stroke) ?? {}), ...current }, d, current.width)
  return { ...el, stroke: next }
}

export function setCornerRadius(el: RawElement, r: number): RawElement {
  const v = Math.max(0, Math.min(maxRadiusOf(el), r))
  return { ...el, corner_radii: [v, v, v, v] }
}

export function setCurve(el: RawElement, m: 'none' | 'smooth'): RawElement {
  if (m === 'none') return { ...el, curve: null }
  const c = rec(el.curve)
  return {
    ...el,
    curve: {
      ...c,
      type: 'smooth',
      tension: Math.max(0, Math.min(1, readNumber(c?.tension) ?? 0.4)),
      segments: Math.max(1, Math.min(96, Math.round(readNumber(c?.segments) ?? 16))),
    },
  }
}

export function readMarkers(el: RawElement): { start: VectorMarker; end: VectorMarker } {
  return {
    start: (readString(el.start_marker) as VectorMarker | null) ?? 'none',
    end: (readString(el.end_marker) as VectorMarker | null) ?? 'none',
  }
}

export function setMarkers(el: RawElement, start: VectorMarker, end: VectorMarker): RawElement {
  return { ...el, start_marker: start, end_marker: end }
}

export function swapMarkers(el: RawElement): RawElement {
  const { start, end } = readMarkers(el)
  return setMarkers(el, end, start)
}

export function readAppearance(el: RawElement): Appearance {
  const shadow = rec(el.shadow)
  return {
    opacity: readNumber(el.opacity) ?? 1,
    flipH: el.flip_h === true,
    flipV: el.flip_v === true,
    shadow: { ...DEFAULT_SHADOW, ...shadow, color: withHash(readString(shadow?.color)) ?? DEFAULT_SHADOW.color },
    shadowEnabled: shadow != null,
  }
}

export function setOpacity(el: RawElement, v: number): RawElement {
  return { ...el, opacity: Math.max(0, Math.min(1, v)) }
}

export function setFlip(el: RawElement, axis: 'h' | 'v'): RawElement {
  const key = axis === 'h' ? 'flip_h' : 'flip_v'
  return { ...el, [key]: el[key] !== true }
}

export function setShadow(el: RawElement, shadow: Shadow | null): RawElement {
  return { ...el, shadow: shadow ? { ...rec(el.shadow), ...shadow } : null }
}

/** Normalises degrees to (-180, 180], rounded to 0.1. */
export function normalizeRotation(deg: number): number {
  let r = deg % 360
  if (r <= -180) r += 360
  else if (r > 180) r -= 360
  const rounded = Math.round(r * 10) / 10
  return rounded === 0 ? 0 : rounded
}

export function readListMarker(el: RawElement): 'bullet' | 'number' | 'none' {
  const m = el.marker
  return m === 'number' || m === 'none' ? m : 'bullet'
}

export function setListMarker(el: RawElement, m: 'bullet' | 'number' | 'none'): RawElement {
  return { ...el, marker: m }
}

export function setIconColor(el: RawElement, color: string): RawElement {
  return { ...el, color }
}

export function setIcon(el: RawElement, url: string, weight: IconWeight): RawElement {
  return { ...el, data: url, icon_type: weight }
}
