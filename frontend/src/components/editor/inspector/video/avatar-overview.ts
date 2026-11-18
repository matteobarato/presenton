import type { NarrationState } from '../narration/narration-state'
import type { AvatarChipKind } from './avatar-state'

export type CellTone = 'ok' | 'todo' | 'warn' | 'busy' | 'none'
/** What clicking a cell does: the fix for the thing it reports as missing. */
export type CellAction = 'add-portrait' | 'open-voice' | 'add-placeholder'
export interface OverviewCell {
  tone: CellTone
  text: string
  action?: CellAction
}
export type OverviewRowId = 'portrait' | 'narration' | 'placeholder' | 'video'
export interface OverviewRow {
  id: OverviewRowId
  label: string
  deck: OverviewCell
  /** null when no slide is active. */
  slide: OverviewCell | null
}
export interface OverviewInput {
  hasPortrait: boolean
  totalSlides: number
  /** Slides that carry the avatar placeholder layer. */
  placeholderCount: number
  /** Placeholder slides whose narration is up to date: what a whole-deck run would cover. */
  eligibleCount: number
  /** Placeholder slides that already have a video. */
  videoCount: number
  slide: null | { chip: AvatarChipKind; narration: NarrationState; hasPlaceholder: boolean }
}

const NONE: OverviewCell = { tone: 'none', text: '—' }
const count = (done: number, of: number, action?: CellAction): OverviewCell =>
  of === 0 ? NONE : done >= of ? { tone: 'ok', text: `${done}/${of}` } : { tone: 'todo', text: `${done}/${of}`, ...(action && { action }) }

function narrationCell(state: NarrationState): OverviewCell {
  if (state === 'ready') return { tone: 'ok', text: 'Ready' }
  if (state === 'translated') return { tone: 'ok', text: 'Translated' }
  if (state === 'stale') return { tone: 'warn', text: 'Outdated', action: 'open-voice' }
  return { tone: 'todo', text: 'Missing', action: 'open-voice' }
}

function videoCell(chip: AvatarChipKind): OverviewCell {
  switch (chip) {
    case 'done':
      return { tone: 'ok', text: 'Ready' }
    case 'uploaded':
      return { tone: 'ok', text: 'Uploaded' }
    case 'video_stale':
      return { tone: 'warn', text: 'Outdated' }
    case 'generating':
      return { tone: 'busy', text: 'Generating' }
    case 'failed':
      return { tone: 'warn', text: 'Failed' }
    case 'no_placeholder':
      return NONE
    default:
      return { tone: 'todo', text: 'Missing' }
  }
}

/**
 * The four things an avatar is made from, in the order they are made, each reported for the whole deck
 * and for the active slide, so it is clear which deck-wide setting a slide's avatar depends on.
 */
export function buildOverview(i: OverviewInput): OverviewRow[] {
  const s = i.slide
  return [
    {
      id: 'portrait',
      label: 'Portrait',
      deck: i.hasPortrait ? { tone: 'ok', text: 'Added' } : { tone: 'todo', text: 'Missing', action: 'add-portrait' },
      slide: s && { tone: 'none', text: 'Shared' },
    },
    {
      id: 'narration',
      label: 'Narration',
      deck: count(i.eligibleCount, i.placeholderCount, 'open-voice'),
      slide: s && narrationCell(s.narration),
    },
    {
      id: 'placeholder',
      label: 'Placeholder',
      deck: i.placeholderCount === 0 ? { tone: 'todo', text: 'None' } : { tone: 'ok', text: `${i.placeholderCount}/${i.totalSlides}` },
      slide: s && (s.hasPlaceholder ? { tone: 'ok', text: 'On' } : { tone: 'todo', text: 'Off', action: 'add-placeholder' }),
    },
    {
      id: 'video',
      label: 'Video',
      deck: count(i.videoCount, i.placeholderCount),
      slide: s && videoCell(s.chip),
    },
  ]
}
