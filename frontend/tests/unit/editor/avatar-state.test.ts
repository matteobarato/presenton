import { describe, expect, it } from 'vitest'
import type { SlideVideo } from '@/api/videos'
import { chipFor, otherAvatarLanguage } from '@/components/editor/inspector/video/avatar-state'

const video = (language: string | null, source: 'heygen' | 'upload' = 'heygen') =>
  ({ language, source, stale: false }) as unknown as SlideVideo

describe('otherAvatarLanguage', () => {
  it('is the avatar language when it differs from the narration played', () => {
    expect(otherAvatarLanguage(video('en'), 'it')).toBe('en')
  })
  it('is null when they match, or either is unset (the avatar then plays)', () => {
    expect(otherAvatarLanguage(video('en'), 'en')).toBeNull()
    expect(otherAvatarLanguage(video(null), 'it')).toBeNull()
    expect(otherAvatarLanguage(video('en'), '')).toBeNull()
    expect(otherAvatarLanguage(undefined, 'it')).toBeNull()
  })
})

describe('chipFor: language', () => {
  const base = { hasPlaceholder: true, narration: 'ready' as never }
  it('flags an avatar recorded for another language, generated or uploaded', () => {
    expect(chipFor({ ...base, video: video('en'), language: 'it' })).toBe('other_language')
    expect(chipFor({ ...base, video: video('en', 'upload'), language: 'it' })).toBe('other_language')
  })
  it('keeps the usual chip when the language matches', () => {
    expect(chipFor({ ...base, video: video('it'), language: 'it' })).toBe('done')
    expect(chipFor({ ...base, video: video('en', 'upload'), language: 'en' })).toBe('uploaded')
  })
})
