import type { PresentationSummary } from '@/api/presentations'
import { relativeTime } from '@/lib/relativeTime'

export function deckTitle(p: PresentationSummary): string {
  return p.title?.trim() || 'Untitled presentation'
}

export function coverSlide(p: PresentationSummary) {
  return [...p.slides].sort((a, b) => a.index - b.index)[0]
}

export function deckMeta(p: PresentationSummary): string {
  const n = p.slides.length
  return `${n} ${n === 1 ? 'slide' : 'slides'} · ${relativeTime(p.updated_at)}`
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
