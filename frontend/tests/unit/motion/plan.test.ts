import { describe, expect, it } from 'vitest'
import type { AnimationTween } from '@/api/types'
import { EASES, MAX_TWEENS, MOTION_WINDOW, effects } from '@/motion/effects'
import { applyEffect, applyPreset, constrainTween, tweenEffect } from '@/motion/plan'

const tw = (over: Partial<AnimationTween> = {}): AnimationTween => ({
  target: 'a',
  from_values: { opacity: 0 },
  duration: 0.6,
  delay: 0,
  ease: 'power2.out',
  ...over,
})

describe('tweenEffect', () => {
  it('is none for undefined', () => expect(tweenEffect(undefined)).toBe('none'))
  it.each(effects.map((e) => e.id).filter((id) => id !== 'none'))('recognises %s', (id) => {
    const e = effects.find((x) => x.id === id)!
    expect(tweenEffect(tw({ from_values: { ...e.from } }))).toBe(id)
  })
  it('is custom for unmatched values', () =>
    expect(tweenEffect(tw({ from_values: { opacity: 0, y: 30 } }))).toBe('custom'))
})

describe('applyEffect', () => {
  it('none removes the tween', () => {
    const out = applyEffect([tw(), tw({ target: 'b' })], 'a', 'none')
    expect(out.map((t) => t.target)).toEqual(['b'])
  })
  it('adds a tween with defaults', () => {
    const out = applyEffect([], 'z', 'rise')
    expect(out).toEqual([
      { target: 'z', from_values: { opacity: 0, y: 32 }, duration: 0.6, delay: 0, ease: 'power2.out' },
    ])
  })
  it('replaces from_values and keeps timing', () => {
    const out = applyEffect([tw({ delay: 0.3 })], 'a', 'zoom')
    expect(out[0].delay).toBe(0.3)
    expect(tweenEffect(out[0])).toBe('zoom')
  })
})

describe('constrainTween', () => {
  it('keeps end within window and duration >= min', () => {
    const t = constrainTween(tw(), { delay: 2.4, duration: 1.2 })
    expect(t.delay + t.duration).toBeLessThanOrEqual(MOTION_WINDOW)
    expect(t.duration).toBeGreaterThanOrEqual(0.2)
  })
  it('clamps duration', () => {
    expect(constrainTween(tw(), { duration: 0 }).duration).toBe(0.2)
    expect(constrainTween(tw(), { duration: 99 }).duration).toBe(1.2)
  })
  it('clamps negative delay and unknown ease', () => {
    const t = constrainTween(tw(), { delay: -1, ease: 'bogus' })
    expect(t.delay).toBe(0)
    expect(t.ease).toBe('power2.out')
  })
  it('default ease is in EASES', () => expect(EASES.map((e) => e.id)).toContain('power2.out'))
})

describe('applyPreset', () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ id: `e${i}`, kind: 'text', box: { y: 30 - i, x: 0 } }))
  it('clear returns []', () => expect(applyPreset('clear', many)).toEqual([]))
  it.each(['cinematic', 'cascade', 'subtle'] as const)('%s respects limits', (p) => {
    const out = applyPreset(p, many)
    expect(out.length).toBeLessThanOrEqual(MAX_TWEENS)
    for (const t of out) {
      expect(t.delay + t.duration).toBeLessThanOrEqual(MOTION_WINDOW)
      expect(constrainTween(t, {})).toEqual(t)
    }
  })
  it('cascade staggers in reading order', () => {
    const out = applyPreset('cascade', [
      { id: 'b', kind: 'text', box: { y: 200, x: 0 } },
      { id: 'a', kind: 'text', box: { y: 100, x: 50 } },
      { id: 'c', kind: 'text', box: { y: 100, x: 400 } },
    ])
    expect(out.map((t) => t.target)).toEqual(['a', 'c', 'b'])
    expect(out.map((t) => t.delay)).toEqual([0, 0.12, 0.24])
  })
  it('subtle is fade only at 0.4s', () => {
    const out = applyPreset('subtle', [{ id: 'a', kind: 'text' }])
    expect(out[0].from_values).toEqual({ opacity: 0 })
    expect(out[0].duration).toBe(0.4)
  })
  it('cinematic rises first then fades, 0.15 steps', () => {
    const out = applyPreset('cinematic', [
      { id: 'a', kind: 'text' },
      { id: 'b', kind: 'text' },
    ])
    expect(tweenEffect(out[0])).toBe('rise')
    expect(tweenEffect(out[1])).toBe('fade')
    expect(out[1].delay).toBe(0.15)
  })
})
