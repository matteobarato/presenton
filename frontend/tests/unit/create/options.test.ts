import { describe, expect, it } from 'vitest'
import { PHOTO_MAX_BYTES, clampMediaCount, effectiveVideos, validatePortrait } from '@/components/create/options'
import { importPresenterNote, presenterNote } from '@/components/create/setupSummary'

const file = (type: string, size: number) => {
  const f = new File(['x'], 'p', { type })
  Object.defineProperty(f, 'size', { value: size })
  return f
}

describe('effectiveVideos', () => {
  it('forces none without a photo', () => {
    expect(effectiveVideos('', false)).toBe('0')
    expect(effectiveVideos('3', false)).toBe('0')
  })
  it('keeps the choice with a photo', () => {
    expect(effectiveVideos('3', true)).toBe('3')
    expect(effectiveVideos('', true)).toBe('')
  })
})

describe('validatePortrait', () => {
  it('accepts jpeg/png/webp up to 10 MB', () => {
    expect(validatePortrait(file('image/png', 1_000_000))).toBeNull()
    expect(validatePortrait(file('image/webp', PHOTO_MAX_BYTES))).toBeNull()
  })
  it('rejects other types and oversize files', () => {
    expect(validatePortrait(file('image/gif', 10))).toMatch(/JPEG, PNG or WebP/)
    expect(validatePortrait(file('image/jpeg', PHOTO_MAX_BYTES + 1))).toMatch(/10 MB/)
  })
})

describe('clampMediaCount cap', () => {
  it('caps at max, defaulting to MAX_SLIDES', () => {
    expect(clampMediaCount('9', 4)).toBe('4')
    expect(clampMediaCount('9')).toBe('9')
  })
})

describe('importPresenterNote', () => {
  it('speaks about the imported deck', () => {
    expect(importPresenterNote(false, '3', 12)).toBeNull()
    expect(importPresenterNote(true, '3', 12)).toContain('3 of 12')
    expect(importPresenterNote(true, '20', 12)).toContain('12 of 12')
    expect(importPresenterNote(true, '', 12)).toContain('First and last slide')
    expect(importPresenterNote(true, '0', 12)).toBe(presenterNote(true, '0'))
  })
})
