import type { Presentation } from '@/api/types'
import { resolvePresentationTheme } from '@/render/legacy/lib/template-theme'
import { withHash } from '@/slide-editor/model'

/** The presentation theme's colours as unique lower-case #hex swatches. */
export function themePalette(presentation: Presentation): string[] {
  const t = resolvePresentationTheme(presentation) as unknown as Record<string, string>
  const keys = ['primary', 'background', 'card', 'stroke', 'primary_text', 'background_text', ...Array.from({ length: 10 }, (_, i) => `graph_${i}`)]
  return [...new Set(keys.map((k) => withHash(t[k])?.toLowerCase()).filter((c): c is string => !!c))]
}
