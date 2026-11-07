import type { Slide } from '@/api/types'

/** Wraps a template layout as a placeholder slide so SlideView can preview it. */
export function layoutToSlide(templateId: string, layout: Record<string, unknown>, index: number): Slide {
  return {
    id: `${templateId}-preview-${index}`,
    content: {},
    ui: layout,
    layout: typeof layout.id === 'string' ? layout.id : `slide-${index}`,
    layout_group: 'template-v2',
  } as unknown as Slide
}
