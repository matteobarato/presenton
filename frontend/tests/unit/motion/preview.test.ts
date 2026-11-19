import { afterEach, describe, expect, it, vi } from 'vitest'
import { gsap } from 'gsap'
import type { AnimationTween } from '@/api/types'
import { MOTION_WINDOW } from '@/motion/effects'
import { createPreview, tweenVars, type MotionPreview } from '@/motion/preview'

const tw = (over: Partial<AnimationTween> = {}): AnimationTween => ({
  target: 'a',
  from_values: { opacity: 0 },
  duration: 0.6,
  delay: 0,
  ease: 'power2.out',
  ...over,
})

function slide(html = '<h1 data-hf-el="a">Title</h1><p data-hf-el="b">Body</p>') {
  const root = document.createElement('div')
  root.innerHTML = html
  document.body.appendChild(root)
  return root
}

const el = (root: ParentNode, id: string) => root.querySelector<HTMLElement>(`[data-hf-el="${id}"]`)!

let previews: MotionPreview[] = []
const make = (...args: Parameters<typeof createPreview>) => {
  const p = createPreview(...args)
  previews.push(p)
  return p
}

afterEach(() => {
  previews.forEach((p) => p.dispose())
  previews = []
  document.body.innerHTML = ''
})

describe('tweenVars', () => {
  it('mirrors the backend _tween_vars mapping', () => {
    expect(tweenVars(tw({ from_values: { opacity: 0, y: 32, scale: 0.86, blur: 12 } }))).toEqual({
      from: { opacity: 0, y: 32, scale: 0.86, filter: 'blur(12px)' },
      to: { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' },
    })
  })
  it('maps x and rotation to their neutrals', () => {
    expect(tweenVars(tw({ from_values: { x: -50, rotation: -8 } }))).toEqual({
      from: { x: -50, rotation: -8 },
      to: { x: 0, rotation: 0 },
    })
  })
  it('drops unknown properties and leaves unset ones out', () => {
    const t = tw({ from_values: { opacity: 0.5, skew: 3 } as AnimationTween['from_values'] })
    expect(tweenVars(t)).toEqual({ from: { opacity: 0.5 }, to: { opacity: 1 } })
  })
  it('formats fractional blur', () => {
    expect(tweenVars(tw({ from_values: { blur: 2.5 } })).from).toEqual({ filter: 'blur(2.5px)' })
  })
})

describe('createPreview', () => {
  it('seeks to the start and end states', () => {
    const root = slide()
    const p = make(root, [tw({ from_values: { opacity: 0, y: 32 } })])
    p.seek(0)
    expect(el(root, 'a').style.opacity).toBe('0')
    expect(el(root, 'a').style.transform).toContain('32px')
    p.seek(MOTION_WINDOW)
    expect(el(root, 'a').style.opacity).toBe('1')
    expect(p.time()).toBeCloseTo(MOTION_WINDOW)
  })

  it('places tweens at their delay', () => {
    const root = slide()
    const p = make(root, [tw({ target: 'b', delay: 1, duration: 0.5 })])
    p.seek(0.9)
    expect(el(root, 'b').style.opacity).toBe('0')
    p.seek(1.5)
    expect(el(root, 'b').style.opacity).toBe('1')
  })

  it('skips tweens whose target element is missing', () => {
    const root = slide()
    expect(() => {
      const p = make(root, [tw({ target: 'ghost' }), tw({ target: 'a' })])
      p.seek(0)
      p.seek(1)
    }).not.toThrow()
    previews[0]!.seek(0)
    expect(el(root, 'a').style.opacity).toBe('0')
  })

  it('applies blur as a filter', () => {
    const root = slide()
    const p = make(root, [tw({ from_values: { blur: 12 } })])
    p.seek(0)
    expect(el(root, 'a').style.filter).toBe('blur(12px)')
  })

  it('restore() clears inline animation styles and keeps pre-existing ones', () => {
    const root = slide('<h1 data-hf-el="a" style="color: red;">Title</h1>')
    const p = make(root, [tw({ from_values: { opacity: 0, y: 32, blur: 4 } })])
    p.seek(0.1)
    p.restore()
    const a = el(root, 'a')
    expect(a.style.opacity).toBe('')
    expect(a.style.transform).toBe('')
    expect(a.style.filter).toBe('')
    expect(a.style.color).toBe('red')
  })

  it('restore() removes the style attribute when the element had none', () => {
    const root = slide()
    const p = make(root, [tw()])
    p.seek(0)
    p.restore()
    expect(el(root, 'a').hasAttribute('style')).toBe(false)
  })

  it('reduced motion keeps only opacity', () => {
    const root = slide()
    const p = make(root, [tw({ from_values: { opacity: 0, y: 32, scale: 0.5, blur: 8 } }), tw({ target: 'b', from_values: { x: -50 } })], {
      reducedMotion: true,
    })
    p.seek(0)
    expect(el(root, 'a').style.opacity).toBe('0')
    expect(el(root, 'a').style.transform).toBe('')
    expect(el(root, 'a').style.filter).toBe('')
    expect(el(root, 'b').getAttribute('style')).toBeNull()
  })

  it('play() runs to the end and calls onEnd', () => {
    const root = slide()
    const onEnd = vi.fn()
    const p = make(root, [tw()])
    p.play({ onEnd })
    expect(gsap.globalTimeline.getChildren(false, false, true).length).toBeGreaterThan(0)
    p.seek(MOTION_WINDOW - 0.01)
    p.play({ onEnd })
    // Force the timeline past its end synchronously.
    gsap.globalTimeline.getChildren(false, false, true).forEach((t) => t.progress(1))
    expect(onEnd).toHaveBeenCalled()
  })

  it('pause() stops playback', () => {
    const root = slide()
    const p = make(root, [tw()])
    p.play()
    p.pause()
    const t = p.time()
    expect(p.time()).toBe(t)
  })

  it('dispose() is idempotent and releases the timeline', () => {
    const root = slide()
    const before = gsap.globalTimeline.getChildren(false, false, true).length
    const p = make(root, [tw()])
    p.seek(0)
    p.dispose()
    expect(() => p.dispose()).not.toThrow()
    expect(() => p.seek(1)).not.toThrow()
    expect(gsap.globalTimeline.getChildren(false, false, true).length).toBe(before)
    expect(el(root, 'a').hasAttribute('style')).toBe(false)
  })
})
