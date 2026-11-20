import { describe, expect, it } from 'vitest'
import {
  AVATAR_BADGE,
  WIZARD_STEPS,
  avatarHint,
  deckProgress,
  type DeckProgressInput,
} from '@/components/create/wizard/progress'

function input(over: Partial<DeckProgressInput> = {}): DeckProgressInput {
  return {
    slideCount: 0,
    outlineStreaming: false,
    slidesStreaming: false,
    narration: { ready: 0, stale: 0 },
    avatar: { placeholderSlides: 0, withVideo: 0, generationAvailable: true },
    pipelineRunning: false,
    ...over,
  }
}

describe('WIZARD_STEPS', () => {
  it('lists the seven steps in order with labels', () => {
    expect(WIZARD_STEPS.map((s) => s.key)).toEqual([
      'topic', 'look', 'details', 'outline', 'preview', 'avatar', 'export',
    ])
    expect(WIZARD_STEPS.map((s) => s.label)).toEqual([
      'Topic', 'Look', 'Details', 'Outline', 'Preview', 'Avatar', 'Export',
    ])
  })
})

describe('deckProgress', () => {
  it('fresh deck resumes at outline', () => {
    const p = deckProgress(input({ outlineStreaming: true }))
    expect(p.steps.outline.state).toBe('running')
    expect(p.resume).toBe('outline')
    expect(p.avatarRequirement).toBe('undecided')
  })

  it('outline is available when idle with no slides', () => {
    const p = deckProgress(input())
    expect(p.steps.outline.state).toBe('available')
    expect(p.steps.preview.state).toBe('locked')
    expect(p.steps.preview.reason).toBe('Generate slides from the outline first')
    expect(p.steps.outline.reason).toBeNull()
  })

  it('outline is done once slides exist or are streaming', () => {
    expect(deckProgress(input({ slideCount: 2 })).steps.outline.state).toBe('done')
    expect(deckProgress(input({ slidesStreaming: true })).steps.outline.state).toBe('done')
  })

  it('slides streaming: preview running, avatar locked', () => {
    const p = deckProgress(input({ slidesStreaming: true }))
    expect(p.steps.preview.state).toBe('running')
    expect(p.steps.avatar.state).toBe('locked')
    expect(p.steps.avatar.reason).toBe('Slides must finish generating first')
  })

  it('partial slides while streaming keep avatar and export locked', () => {
    const p = deckProgress(input({ slidesStreaming: true, slideCount: 3 }))
    expect(p.steps.preview.state).toBe('running')
    expect(p.steps.avatar.state).toBe('locked')
    expect(p.steps.export.state).toBe('locked')
  })

  it('preview is done when slides exist', () => {
    const p = deckProgress(input({ slideCount: 4 }))
    expect(p.steps.preview.state).toBe('done')
    expect(p.steps.avatar.state).toBe('available')
  })

  it('required avatars lock export with a count', () => {
    const p = deckProgress(input({
      slideCount: 5,
      narration: { ready: 5, stale: 0 },
      avatar: { placeholderSlides: 3, withVideo: 1, generationAvailable: true },
    }))
    expect(p.avatarRequirement).toBe('required')
    expect(p.steps.export.state).toBe('locked')
    expect(p.steps.export.reason).toBe('2 slides still need their avatar')
    expect(p.resume).toBe('avatar')
  })

  it('uses the singular when one slide still needs its avatar', () => {
    const p = deckProgress(input({
      slideCount: 5,
      narration: { ready: 5, stale: 0 },
      avatar: { placeholderSlides: 3, withVideo: 2, generationAvailable: true },
    }))
    expect(p.steps.export.reason).toBe('1 slide still needs its avatar')
  })

  it('asks to narrate when avatars are complete but narration is not', () => {
    const p = deckProgress(input({
      slideCount: 4,
      narration: { ready: 3, stale: 1 },
      avatar: { placeholderSlides: 2, withVideo: 2, generationAvailable: true },
    }))
    expect(p.steps.export.state).toBe('locked')
    expect(p.steps.export.reason).toBe('Narrate every slide first')
  })

  it('outline stays running while regenerating over existing slides', () => {
    const p = deckProgress(input({ slideCount: 3, outlineStreaming: true }))
    expect(p.steps.outline.state).toBe('running')
  })

  it('undefined generationAvailable counts as available', () => {
    const p = deckProgress(input({
      slideCount: 2,
      avatar: { placeholderSlides: 1, withVideo: 0, generationAvailable: undefined },
    }))
    expect(p.avatarRequirement).toBe('required')
    expect(p.voiceOnly).toBe(false)
  })

  it('voice-only completes when generation unavailable', () => {
    const p = deckProgress(input({
      slideCount: 4,
      narration: { ready: 4, stale: 0 },
      avatar: { placeholderSlides: 2, withVideo: 0, generationAvailable: false },
    }))
    expect(p.voiceOnly).toBe(true)
    expect(p.avatarRequirement).toBe('optional')
    expect(p.steps.avatar.state).toBe('done')
    expect(p.steps.export.state).toBe('available')
  })

  it('stale narration reopens avatar', () => {
    const p = deckProgress(input({
      slideCount: 8,
      narration: { ready: 7, stale: 1 },
    }))
    expect(p.steps.avatar.state).toBe('available')
    expect(p.resume).toBe('avatar')
  })

  it('no placeholders: optional and export available', () => {
    const p = deckProgress(input({
      slideCount: 3,
      narration: { ready: 3, stale: 0 },
    }))
    expect(p.avatarRequirement).toBe('optional')
    expect(p.steps.avatar.state).toBe('done')
    expect(p.steps.export.state).toBe('available')
    expect(p.resume).toBe('export')
  })

  it('optional avatar not done is still the resume step but does not lock export', () => {
    const p = deckProgress(input({ slideCount: 3 }))
    expect(p.avatarRequirement).toBe('optional')
    expect(p.steps.avatar.state).toBe('available')
    expect(p.steps.export.state).toBe('available')
    expect(p.resume).toBe('avatar')
  })

  it('pipeline running marks avatar running', () => {
    const p = deckProgress(input({ slideCount: 3, pipelineRunning: true }))
    expect(p.steps.avatar.state).toBe('running')
  })

  it('locked wins over running for avatar', () => {
    const p = deckProgress(input({ slidesStreaming: true, pipelineRunning: true }))
    expect(p.steps.avatar.state).toBe('locked')
  })

  it('badge is only set on avatar; export is never done', () => {
    const p = deckProgress(input({
      slideCount: 3,
      narration: { ready: 3, stale: 0 },
    }))
    expect(p.steps.avatar.badge).toBe(AVATAR_BADGE.optional)
    expect(p.steps.outline.badge).toBeNull()
    expect(p.steps.preview.badge).toBeNull()
    expect(p.steps.export.badge).toBeNull()
    expect(p.steps.export.state).not.toBe('done')
    expect(p.steps.avatar.reason).toBeNull()
  })
})

describe('avatarHint', () => {
  it('maps the videos option', () => {
    expect(avatarHint('')).toBe('undecided')
    expect(avatarHint('0')).toBe('optional')
    expect(avatarHint('3')).toBe('required')
  })

  it('has badge copy for each requirement', () => {
    expect(AVATAR_BADGE).toEqual({
      required: 'Required',
      optional: 'Optional',
      undecided: 'Decided after Preview',
    })
  })
})
