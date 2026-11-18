import type { AnimationTween } from '@/api/types'

// Mirrors servers/fastapi/utils/llm_calls/generate_slide_animations.py
export const MOTION_WINDOW = 2.5
export const MIN_DURATION = 0.2
export const MAX_DURATION = 1.2
export const MAX_TWEENS = 24

// Same order as the backend ANIMATION_EASES: power1..power4, expo, sine, circ, back.
export const EASES: { id: string; label: string }[] = [
  { id: 'power1.out', label: 'Smooth' },
  { id: 'power2.out', label: 'Soft' },
  { id: 'power3.out', label: 'Strong' },
  { id: 'power4.out', label: 'Sharp' },
  { id: 'expo.out', label: 'Expo' },
  { id: 'sine.out', label: 'Sine' },
  { id: 'circ.out', label: 'Circ' },
  { id: 'back.out(1.4)', label: 'Overshoot' },
]

export type EffectId = 'none' | 'fade' | 'rise' | 'slide' | 'zoom' | 'turn' | 'blur' | 'custom'

export const effects: {
  id: Exclude<EffectId, 'custom'>
  name: string
  detail: string
  from: AnimationTween['from_values']
}[] = [
  { id: 'none', name: 'None', detail: 'Stays still', from: {} },
  { id: 'fade', name: 'Fade', detail: 'Fades in', from: { opacity: 0 } },
  { id: 'rise', name: 'Rise', detail: 'Floats up while fading in', from: { opacity: 0, y: 32 } },
  { id: 'slide', name: 'Slide', detail: 'Slides in from the left', from: { opacity: 0, x: -50 } },
  { id: 'zoom', name: 'Zoom', detail: 'Grows into place', from: { opacity: 0, scale: 0.86 } },
  { id: 'turn', name: 'Turn', detail: 'Straightens up', from: { opacity: 0, rotation: -8, scale: 0.92 } },
  { id: 'blur', name: 'Blur', detail: 'Comes into focus', from: { opacity: 0, blur: 12 } },
]
