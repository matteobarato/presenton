import type { Component } from 'vue'
import type { Presentation, Slide } from '@/api/types'
import type { ToolbarKind } from '@/slide-editor/toolbarKind'
import type { SlideEditing } from '@/slide-editor/useSlideEditing'
import { chartBar } from './bars/chart'
import { genericBar } from './bars/generic'
import { iconBar } from './bars/icon'
import { imageBar } from './bars/image'
import { infographicBar } from './bars/infographic'
import { layoutBar } from './bars/layout'
import { lineBar } from './bars/line'
import { listBar } from './bars/list'
import { multiBar } from './bars/multi'
import { shapeBar } from './bars/shape'
import { tableBar } from './bars/table'
import { textBar } from './bars/text'
import { videoBar } from './bars/video'
import { commonTail } from './tail'

/** Everything a bar item needs to render, decide its state or act. */
export interface BarContext {
  ctx: SlideEditing
  presentation: Presentation
  presentationId: string
  slide: Slide | null
  /** The deck is locked (generating or an AI turn is running): structural edits are off. */
  locked: boolean
}

export type BarItem =
  /** A quick action button in the bar. */
  | {
      type: 'button'
      id: string
      label: string
      title?: string
      icon: Component
      run: (c: BarContext) => void
      active?: (c: BarContext) => boolean
      disabled?: (c: BarContext) => boolean
    }
  /** Any component rendered inline in the bar (a stepper, a colour swatch, a select). */
  | { type: 'custom'; id: string; component: Component; props?: (c: BarContext) => Record<string, unknown> }
  /** A bar button that opens a popover holding `component` (usually an existing inspector Section). */
  | { type: 'panel'; id: string; label: string; icon: Component; component: Component; props?: (c: BarContext) => Record<string, unknown> }

/** One entry per kind; the item lists live in bars/<kind>.ts so kinds never edit the same file. */
export const kindBars: Record<ToolbarKind, BarItem[]> = {
  text: textBar,
  list: listBar,
  image: imageBar,
  icon: iconBar,
  shape: shapeBar,
  line: lineBar,
  video: videoBar,
  table: tableBar,
  chart: chartBar,
  infographic: infographicBar,
  layout: layoutBar,
  multi: multiBar,
  generic: genericBar,
}

/** The kind's items followed by the common tail (Appearance, Arrange, Duplicate, Delete). */
export function barFor(kind: ToolbarKind): BarItem[] {
  return [...kindBars[kind], ...commonTail(kind)]
}
