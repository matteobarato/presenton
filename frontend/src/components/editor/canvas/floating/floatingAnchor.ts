export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface AnchorInput {
  /** Selection AABB in canvas-viewport px (already scaled). */
  target: Rect
  viewport: { width: number; height: number }
  bar: { width: number; height: number }
  /** Gap between bar and target when above (default 10). */
  gapAbove?: number
  /** Gap when below; must clear the rotate handle (24px stem + 6px handle radius + 8px air; default 44). */
  gapBelow?: number
  /** Viewport inset the bar is kept within (default 8). */
  margin?: number
}

export interface AnchorResult {
  x: number
  y: number
  placement: 'above' | 'below' | 'pinned'
}

/** Clamps into [min, max]; when the range is empty (the bar is larger than the viewport) the minimum wins. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max))
}

/** Top-left of the bar in viewport px: above the target if it fits, else below it, else pinned to the top edge. */
export function floatingAnchor(input: AnchorInput): AnchorResult {
  const { target, viewport, bar, gapAbove = 10, gapBelow = 44, margin = 8 } = input
  const maxX = viewport.width - bar.width - margin
  const maxY = viewport.height - bar.height - margin
  const x = clamp(target.x + target.width / 2 - bar.width / 2, margin, maxX)

  const above = target.y - gapAbove - bar.height
  if (above >= margin) return { x, y: clamp(above, margin, maxY), placement: 'above' }

  const below = target.y + target.height + gapBelow
  if (below <= maxY) return { x, y: clamp(below, margin, maxY), placement: 'below' }

  return { x, y: margin, placement: 'pinned' }
}
