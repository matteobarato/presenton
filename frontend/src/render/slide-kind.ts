import type { Slide } from '@/api/types'

export type SlideKind = 'template' | 'smart' | 'blank' | 'empty'

// Ported from servers/nextjs/app/(presentation-generator)/_shared/blank-slide.ts
const BLANK_SLIDE_LAYOUT_ID = '__blank_slide__'

function isTemplateV2TemplateId(value: unknown): boolean {
  return typeof value === 'string' && value.trim().startsWith('template-v2')
}

function hasTemplateV2SlideUi(slide: Slide): boolean {
  const ui = slide.ui as unknown
  if (!ui || typeof ui !== 'object' || Array.isArray(ui)) return false
  const record = ui as Record<string, unknown>
  return Array.isArray(record.components) || Array.isArray(record.elements)
}

function slideTemplateId(slide: Slide): string {
  const group = typeof slide.layout_group === 'string' ? slide.layout_group.trim() : ''
  const layout = typeof slide.layout === 'string' ? slide.layout.trim() : ''
  const fromLayout = layout.split(':')[0] || ''
  return isTemplateV2TemplateId(group) ? group : group || fromLayout
}

function isTemplateV2Slide(slide: Slide): boolean {
  return isTemplateV2TemplateId(slideTemplateId(slide)) || hasTemplateV2SlideUi(slide)
}

function isBlank(layout: unknown): boolean {
  if (typeof layout !== 'string') return false
  return layout === 'blank' || layout === BLANK_SLIDE_LAYOUT_ID || layout.endsWith(`:${BLANK_SLIDE_LAYOUT_ID}`)
}

/**
 * Pure classification, following the old app's dispatch order: non-empty
 * html_content is smart first, then template-v2 slides, then blank.
 */
export function slideKind(slide: Slide): SlideKind {
  if (typeof slide.html_content === 'string' && slide.html_content.trim() !== '') return 'smart'
  if (isTemplateV2Slide(slide)) return 'template'
  if (isBlank(slide.layout)) return 'blank'
  return 'empty'
}
