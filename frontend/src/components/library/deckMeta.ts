import type { PresentationSummary } from '@/api/presentations'
import { i18n } from '@/i18n'
import { relativeTime } from '@/lib/relativeTime'

export function deckTitle(p: PresentationSummary): string {
  return p.title?.trim() || i18n.global.t('library.untitled')
}

export function coverSlide(p: PresentationSummary) {
  return [...p.slides].sort((a, b) => a.index - b.index)[0]
}

/** The list endpoint ships only the cover slide, so the deck's size comes from `slide_count`. */
export function deckSlideCount(p: PresentationSummary): number {
  return p.slide_count ?? p.slides.length
}

export function deckMeta(p: PresentationSummary): string {
  const n = deckSlideCount(p)
  return `${i18n.global.t('library.slideCount', { count: n }, n)} · ${relativeTime(p.updated_at)}`
}

/**
 * Where a click on a deck lands: the wizard's Preview step, the simple path. A deck with no slides yet has no
 * Preview to show, so it opens the wizard on its resume step instead. The editor is the deck's Edit action.
 */
export function deckOpenPath(p: PresentationSummary): string {
  return p.slides.length > 0 ? `/p/${p.id}/create/preview` : `/p/${p.id}/create`
}

export function deckEditPath(p: PresentationSummary): string {
  return `/p/${p.id}`
}

export type LibraryLayout = 'grid' | 'list'
