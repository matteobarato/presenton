import { gsap } from 'gsap'
import type { AnimationTween } from '@/api/types'
import { MOTION_WINDOW } from './effects'

type Vars = Record<string, number | string>
type Prop = keyof AnimationTween['from_values']

// Mirrors ANIMATION_PROPERTIES neutrals in
// servers/fastapi/utils/llm_calls/generate_slide_animations.py.
const NEUTRAL: Record<Prop, number> = { opacity: 1, x: 0, y: 0, scale: 1, rotation: 0, blur: 0 }

// Mirrors _tween_vars in servers/fastapi/utils/hyperframes_composition.py so the
// editor preview matches the exported video frame for frame.
export function tweenVars(t: AnimationTween): { from: Vars; to: Vars } {
  const from: Vars = {}
  const to: Vars = {}
  for (const [name, value] of Object.entries(t.from_values)) {
    if (!(name in NEUTRAL) || typeof value !== 'number') continue
    if (name === 'blur') {
      from.filter = `blur(${value}px)`
      to.filter = 'blur(0px)'
    } else {
      from[name] = value
      to[name] = NEUTRAL[name as Prop]
    }
  }
  return { from, to }
}

export interface MotionPreview {
  seek(time: number): void
  play(opts?: { loop?: boolean; onEnd?: () => void }): void
  pause(): void
  restore(): void
  time(): number
  dispose(): void
}

// GSAP writes transforms into `transform` and blur into `filter`.
const CLEAR = 'opacity,transform,filter'

export function createPreview(
  root: ParentNode,
  tweens: AnimationTween[],
  opts: { reducedMotion?: boolean } = {},
): MotionPreview {
  // Inline style attributes before GSAP touched them; restore() puts them back.
  const saved = new Map<HTMLElement, string | null>()
  let tl: gsap.core.Timeline | null = gsap.timeline({ paused: true })

  for (const tween of tweens) {
    const t = opts.reducedMotion
      ? { ...tween, from_values: 'opacity' in tween.from_values ? { opacity: tween.from_values.opacity } : {} }
      : tween
    const { from, to } = tweenVars(t)
    if (!Object.keys(from).length) continue
    const els = Array.from(root.querySelectorAll<HTMLElement>(`[data-hf-el="${CSS.escape(t.target)}"]`))
    if (!els.length) continue
    for (const el of els) if (!saved.has(el)) saved.set(el, el.getAttribute('style'))
    tl.fromTo(els, from, { ...to, duration: t.duration, ease: t.ease }, t.delay)
  }
  // Hold to the end of the motion window, like the export pads to the slide length.
  tl.set({}, {}, MOTION_WINDOW)

  function restore() {
    if (tl) {
      tl.kill()
      tl = null
    }
    if (!saved.size) return
    const els = [...saved.keys()]
    gsap.set(els, { clearProps: CLEAR })
    for (const [el, style] of saved) {
      if (style === null) el.removeAttribute('style')
      else el.setAttribute('style', style)
    }
    saved.clear()
  }

  return {
    seek(time) {
      tl?.pause().time(time)
    },
    play({ loop = false, onEnd } = {}) {
      if (!tl) return
      tl.repeat(loop ? -1 : 0)
      tl.eventCallback('onComplete', onEnd ?? null)
      if (!loop && tl.time() >= tl.duration()) tl.time(0)
      tl.play()
    },
    pause() {
      tl?.pause()
    },
    time() {
      return tl ? tl.time() : 0
    },
    restore,
    dispose: restore,
  }
}
