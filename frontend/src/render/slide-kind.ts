import type { Slide } from '@/api/types'
import { hasTemplateV2RenderableUi } from '@/render/legacy/lib/template-v2-json-to-html'

export type SlideKind = 'template' | 'smart' | 'blank' | 'empty'

const BLANK_SLIDE_LAYOUT_ID = '__blank_slide__'
const SMART_HTML_LAYOUT_GROUP = 'smart-html'

/** Port of `isBlankPresentationSlide` (old `_shared/blank-slide.ts`). */
function isBlank(layout: unknown): boolean {
  if (typeof layout !== 'string') return false
  return (
    layout === 'blank' ||
    layout === BLANK_SLIDE_LAYOUT_ID ||
    layout.endsWith(`:${BLANK_SLIDE_LAYOUT_ID}`)
  )
}

/**
 * Pure classification of how a slide is rendered. Blank wins over everything,
 * then a renderable `ui` (unless the slide is explicitly smart-html), then
 * stored HTML.
 */
export function slideKind(slide: Slide): SlideKind {
  if (isBlank(slide.layout)) return 'blank'
  const html = typeof slide.html_content === 'string' ? slide.html_content.trim() : ''
  const explicitSmart = slide.layout_group === SMART_HTML_LAYOUT_GROUP && html !== ''
  if (!explicitSmart && hasTemplateV2RenderableUi(slide.ui)) return 'template'
  if (html !== '') return 'smart'
  return 'empty'
}
