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

export type LibraryLayout = 'grid' | 'list'
