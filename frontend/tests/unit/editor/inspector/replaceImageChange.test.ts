import { describe, expect, it } from 'vitest'
import { replaceImageElement } from '@/components/editor/inspector/element/useImageControls'

describe('replaceImageElement', () => {
  it('clears tint and color when the source of a tinted decorative image is replaced', () => {
    const out = replaceImageElement({ type: 'image', data: 'a.svg', tint: true, color: '#ff0000', is_icon: false }, 'photo.jpg')
    expect(out.data).toBe('photo.jpg')
    expect('tint' in out).toBe(false)
    expect('color' in out).toBe(false)
    expect(out.is_icon).toBe(false)
    expect(out.focus_x).toBe(50)
  })
  it('keeps the color of an icon', () => {
    const out = replaceImageElement({ type: 'image', data: 'i.svg', is_icon: true, color: '#00ff00' }, 'j.svg')
    expect(out.color).toBe('#00ff00')
    expect(out.is_icon).toBe(true)
  })
  it('leaves a normal image otherwise untouched', () => {
    const out = replaceImageElement({ type: 'image', data: 'a.jpg', fit: 'cover' }, 'b.jpg')
    expect(out).toMatchObject({ data: 'b.jpg', fit: 'cover', focus_x: 50, focus_y: 50, crop_scale: null })
  })
})
