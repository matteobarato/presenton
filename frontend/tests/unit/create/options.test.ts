import { describe, expect, it } from 'vitest'
import { PHOTO_MAX_BYTES, effectiveVideos, validatePortrait } from '@/components/create/options'

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
