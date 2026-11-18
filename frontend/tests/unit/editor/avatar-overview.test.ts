import { describe, expect, it } from 'vitest'
import type { AvatarChipKind } from '@/components/editor/inspector/video/avatar-state'
import { buildOverview, type OverviewInput } from '@/components/editor/inspector/video/avatar-overview'

const base: OverviewInput = {
  hasPortrait: true,
  totalSlides: 5,
  placeholderCount: 2,
  eligibleCount: 1,
  videoCount: 0,
  slide: { chip: 'ready', narration: 'ready', hasPlaceholder: true },
}
const row = (input: Partial<OverviewInput>, id: string) => buildOverview({ ...base, ...input }).find((r) => r.id === id)!

describe('buildOverview', () => {
  it('lists the four requirements in the order avatars are made', () => {
    expect(buildOverview(base).map((r) => r.id)).toEqual(['portrait', 'narration', 'placeholder', 'video'])
  })

  it('portrait: shared by every slide, with a fix when missing', () => {
    expect(row({}, 'portrait').deck).toEqual({ tone: 'ok', text: 'Added' })
    expect(row({ hasPortrait: false }, 'portrait').deck).toEqual({ tone: 'todo', text: 'Missing', action: 'add-portrait' })
    expect(row({}, 'portrait').slide?.tone).toBe('none')
  })

  it('narration: deck counts up-to-date placeholder slides, slide shows its own state', () => {
    expect(row({}, 'narration').deck).toEqual({ tone: 'todo', text: '1/2', action: 'open-voice' })
    expect(row({ eligibleCount: 2 }, 'narration').deck).toEqual({ tone: 'ok', text: '2/2' })
    expect(row({ placeholderCount: 0, eligibleCount: 0 }, 'narration').deck.tone).toBe('none')
    expect(row({}, 'narration').slide).toEqual({ tone: 'ok', text: 'Ready' })
    expect(row({ slide: { ...base.slide!, narration: 'stale' } }, 'narration').slide).toEqual({ tone: 'warn', text: 'Outdated', action: 'open-voice' })
    expect(row({ slide: { ...base.slide!, narration: 'missing' } }, 'narration').slide).toEqual({ tone: 'todo', text: 'Missing', action: 'open-voice' })
    expect(row({ slide: { ...base.slide!, narration: 'translated' } }, 'narration').slide).toEqual({ tone: 'ok', text: 'Translated' })
  })

  it('on-slide avatar: deck count and a one-click fix on a slide without one', () => {
    expect(row({}, 'placeholder').deck).toEqual({ tone: 'ok', text: '2/5' })
    expect(row({ placeholderCount: 0 }, 'placeholder').deck).toEqual({ tone: 'todo', text: 'None' })
    expect(row({}, 'placeholder').slide).toEqual({ tone: 'ok', text: 'On' })
    expect(row({ slide: { ...base.slide!, hasPlaceholder: false } }, 'placeholder').slide).toEqual({ tone: 'todo', text: 'Off', action: 'add-placeholder' })
  })

  it('video: deck counts slides with a video, slide follows the chip', () => {
    expect(row({ videoCount: 1 }, 'video').deck).toEqual({ tone: 'todo', text: '1/2' })
    expect(row({ videoCount: 2 }, 'video').deck).toEqual({ tone: 'ok', text: '2/2' })
    expect(row({ placeholderCount: 0, eligibleCount: 0 }, 'video').deck.tone).toBe('none')
    const slide = (chip: AvatarChipKind) => row({ slide: { ...base.slide!, chip } }, 'video').slide
    expect(slide('done')).toEqual({ tone: 'ok', text: 'Ready' })
    expect(slide('uploaded')).toEqual({ tone: 'ok', text: 'Uploaded' })
    expect(slide('video_stale')).toEqual({ tone: 'warn', text: 'Outdated' })
    expect(slide('generating')).toEqual({ tone: 'busy', text: 'Generating' })
    expect(slide('failed')).toEqual({ tone: 'warn', text: 'Failed' })
    expect(slide('ready')).toEqual({ tone: 'todo', text: 'Missing' })
    expect(slide('no_placeholder')).toEqual({ tone: 'none', text: '—' })
  })

  it('has no slide column without an active slide', () => {
    expect(buildOverview({ ...base, slide: null }).every((r) => r.slide === null)).toBe(true)
  })
})
