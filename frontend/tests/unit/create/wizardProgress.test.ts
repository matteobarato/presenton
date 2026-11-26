import { describe, expect, it } from 'vitest'
import {
  WIZARD_STEPS,
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
  it('lists the steps in order with labels', () => {
    // The URL keys are unchanged (`avatar` is Narration), so old links keep working.
    expect(WIZARD_STEPS.map((s) => s.key)).toEqual(['topic', 'presenter', 'outline', 'preview', 'avatar', 'export'])
    expect(WIZARD_STEPS.map((s) => s.label)).toEqual(['Topic', 'Presenter', 'Outline', 'Preview', 'Narration', 'Export'])
  })
})

describe('deckProgress', () => {
  it('fresh deck resumes at outline', () => {
    const p = deckProgress(input({ outlineStreaming: true }))
    expect(p.steps.outline.state).toBe('running')
    expect(p.resume).toBe('outline')
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

  it('missing avatars never lock export: they are counted as missing instead', () => {
    const p = deckProgress(input({
      slideCount: 5,
      narration: { ready: 5, stale: 0 },
      avatar: { placeholderSlides: 3, withVideo: 1, generationAvailable: true },
    }))
    expect(p.steps.export.state).toBe('available')
    expect(p.steps.export.reason).toBeNull()
    expect(p.missing).toEqual({ narration: 0, presenterVideos: 2 })
    expect(p.steps.avatar.state).toBe('available')
    expect(p.resume).toBe('avatar')
  })

  it('missing narration never locks export either', () => {
    const p = deckProgress(input({
      slideCount: 4,
      narration: { ready: 3, stale: 1 },
      avatar: { placeholderSlides: 2, withVideo: 2, generationAvailable: true },
    }))
    expect(p.steps.export.state).toBe('available')
    expect(p.missing).toEqual({ narration: 1, presenterVideos: 0 })
  })

  it('export is locked only while there are no slides or they are streaming', () => {
    expect(deckProgress(input()).steps.export.state).toBe('locked')
    expect(deckProgress(input({ slidesStreaming: true, slideCount: 2 })).steps.export.state).toBe('locked')
    expect(deckProgress(input({ slideCount: 2 })).steps.export.state).toBe('available')
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
    expect(p.voiceOnly).toBe(false)
    expect(p.missing.presenterVideos).toBe(1)
  })

  it('voice-only completes when generation unavailable', () => {
    const p = deckProgress(input({
      slideCount: 4,
      narration: { ready: 4, stale: 0 },
      avatar: { placeholderSlides: 2, withVideo: 0, generationAvailable: false },
    }))
    expect(p.voiceOnly).toBe(true)
    // Voice only: there is no video to wait for.
    expect(p.missing.presenterVideos).toBe(0)
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

  it('no placeholders: narrated means done and export available', () => {
    const p = deckProgress(input({
      slideCount: 3,
      narration: { ready: 3, stale: 0 },
    }))
    expect(p.steps.avatar.state).toBe('done')
    expect(p.steps.export.state).toBe('available')
    expect(p.resume).toBe('export')
  })

  it('narration not done is still the resume step but does not lock export', () => {
    const p = deckProgress(input({ slideCount: 3 }))
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

  it('export is never done and steps carry no badge', () => {
    const p = deckProgress(input({ slideCount: 3, narration: { ready: 3, stale: 0 } }))
    expect(p.steps.export.state).not.toBe('done')
    expect(p.steps.avatar.reason).toBeNull()
    expect(Object.keys(p.steps.avatar)).not.toContain('badge')
  })
})

describe('deckProgress: imported (PowerPoint) deck', () => {
  it('with slides and no narration resumes on preview', () => {
    const p = deckProgress(input({ imported: true, slideCount: 3 }))
    expect(p.steps.preview.state).toBe('done')
    expect(p.resume).toBe('preview')
  })

  it('with one narrated slide resumes on avatar', () => {
    const p = deckProgress(input({ imported: true, slideCount: 3, narration: { ready: 1, stale: 0 } }))
    expect(p.resume).toBe('avatar')
  })

  it('while the pipeline runs resumes on avatar', () => {
    const p = deckProgress(input({ imported: true, slideCount: 3, pipelineRunning: true }))
    expect(p.resume).toBe('avatar')
  })

  it('a non-imported deck is unchanged', () => {
    expect(deckProgress(input({ slideCount: 3 })).resume).toBe('avatar')
    expect(deckProgress(input({ imported: false, slideCount: 3 })).resume).toBe('avatar')
  })
})
