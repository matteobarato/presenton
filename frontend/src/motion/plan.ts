import type { AnimationTween } from '@/api/types'
import { EASES, MAX_DURATION, MAX_TWEENS, MIN_DURATION, MOTION_WINDOW, effects, type EffectId } from './effects'

const DEFAULT_EASE = 'power2.out'
const round = (n: number) => Math.round(n * 1000) / 1000

function sameValues(a: AnimationTween['from_values'], b: AnimationTween['from_values']): boolean {
  const ka = Object.keys(a) as (keyof typeof a)[]
  const kb = Object.keys(b)
  return ka.length === kb.length && ka.every((k) => a[k] === b[k])
}

export function tweenEffect(t: AnimationTween | undefined): EffectId {
  if (!t) return 'none'
  const hit = effects.find((e) => e.id !== 'none' && sameValues(t.from_values, e.from))
  return hit ? hit.id : 'custom'
}

export function constrainTween(t: AnimationTween, patch: Partial<AnimationTween>): AnimationTween {
  const m = { ...t, ...patch }
  const duration0 = Number.isFinite(m.duration) ? m.duration : 0.6
  let duration = Math.min(MAX_DURATION, Math.max(MIN_DURATION, duration0))
  let delay = Number.isFinite(m.delay) ? Math.max(0, m.delay) : 0
  delay = Math.min(delay, MOTION_WINDOW - MIN_DURATION)
  duration = Math.min(duration, MOTION_WINDOW - delay)
  return {
    ...m,
    delay: round(delay),
    duration: round(duration),
    ease: EASES.some((e) => e.id === m.ease) ? m.ease : DEFAULT_EASE,
  }
}

export function applyEffect(tweens: AnimationTween[], target: string, effect: EffectId): AnimationTween[] {
  if (effect === 'none') return tweens.filter((t) => t.target !== target)
  if (effect === 'custom') return tweens
  const from = { ...effects.find((e) => e.id === effect)!.from }
  const existing = tweens.find((t) => t.target === target)
  if (!existing) {
    return [...tweens, { target, from_values: from, duration: 0.6, delay: 0, ease: DEFAULT_EASE }]
  }
  return tweens.map((t) => (t.target === target ? { ...t, from_values: from } : t))
}

export type PresetId = 'cinematic' | 'cascade' | 'subtle' | 'clear'

type PresetTarget = { id: string; kind: string; box?: { y: number; x: number } }

export function applyPreset(preset: PresetId, targets: PresetTarget[]): AnimationTween[] {
  if (preset === 'clear') return []
  let list = targets
  if (preset === 'cascade') {
    const boxed = targets.filter((t) => t.box).sort((a, b) => a.box!.y - b.box!.y || a.box!.x - b.box!.x)
    list = [...boxed, ...targets.filter((t) => !t.box)]
  }
  list = list.slice(0, MAX_TWEENS)
  const wanted = preset === 'subtle' ? 0 : preset === 'cinematic' ? 0.15 : 0.12
  // Compress the step so the last tween still fits the motion window.
  const step = list.length > 1 ? Math.min(wanted, (MOTION_WINDOW - MIN_DURATION) / (list.length - 1)) : 0
  const riseFrom = effects.find((e) => e.id === 'rise')!.from
  const fadeFrom = effects.find((e) => e.id === 'fade')!.from
  return list.map((t, i) => {
    const rise = preset === 'cinematic' ? i === 0 : preset === 'cascade'
    const base: AnimationTween = {
      target: t.id,
      from_values: { ...(rise ? riseFrom : fadeFrom) },
      duration: preset === 'subtle' ? 0.4 : 0.6,
      delay: i * step,
      ease: DEFAULT_EASE,
    }
    return constrainTween(base, {})
  })
}
