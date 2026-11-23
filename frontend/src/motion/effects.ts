import type { AnimationTween } from '@/api/types'
import { i18n } from '@/i18n'

// Mirrors servers/fastapi/utils/llm_calls/generate_slide_animations.py
export const MOTION_WINDOW = 2.5
export const MIN_DURATION = 0.2
export const MAX_DURATION = 1.2
export const MAX_TWEENS = 24

// Same order as the backend ANIMATION_EASES: power1..power4, expo, sine, circ, back.
export const EASES: { id: string; label: string }[] = [
  { id: 'power1.out', get label() { return i18n.global.t('slideEditor.motion.ease.smooth') } },
  { id: 'power2.out', get label() { return i18n.global.t('slideEditor.motion.ease.soft') } },
  { id: 'power3.out', get label() { return i18n.global.t('slideEditor.motion.ease.strong') } },
  { id: 'power4.out', get label() { return i18n.global.t('slideEditor.motion.ease.sharp') } },
  { id: 'expo.out', get label() { return i18n.global.t('slideEditor.motion.ease.expo') } },
  { id: 'sine.out', get label() { return i18n.global.t('slideEditor.motion.ease.sine') } },
  { id: 'circ.out', get label() { return i18n.global.t('slideEditor.motion.ease.circ') } },
  { id: 'back.out(1.4)', get label() { return i18n.global.t('slideEditor.motion.ease.overshoot') } },
]

export type EffectId = 'none' | 'fade' | 'rise' | 'slide' | 'zoom' | 'turn' | 'blur' | 'custom'

export const effects: {
  id: Exclude<EffectId, 'custom'>
  name: string
  detail: string
  from: AnimationTween['from_values']
}[] = [
  {
    id: 'none',
    get name() { return i18n.global.t('slideEditor.motion.effect.none.name') },
    get detail() { return i18n.global.t('slideEditor.motion.effect.none.detail') },
    from: {},
  },
  {
    id: 'fade',
    get name() { return i18n.global.t('slideEditor.motion.effect.fade.name') },
    get detail() { return i18n.global.t('slideEditor.motion.effect.fade.detail') },
    from: { opacity: 0 },
  },
  {
    id: 'rise',
    get name() { return i18n.global.t('slideEditor.motion.effect.rise.name') },
    get detail() { return i18n.global.t('slideEditor.motion.effect.rise.detail') },
    from: { opacity: 0, y: 32 },
  },
  {
    id: 'slide',
    get name() { return i18n.global.t('slideEditor.motion.effect.slide.name') },
    get detail() { return i18n.global.t('slideEditor.motion.effect.slide.detail') },
    from: { opacity: 0, x: -50 },
  },
  {
    id: 'zoom',
    get name() { return i18n.global.t('slideEditor.motion.effect.zoom.name') },
    get detail() { return i18n.global.t('slideEditor.motion.effect.zoom.detail') },
    from: { opacity: 0, scale: 0.86 },
  },
  {
    id: 'turn',
    get name() { return i18n.global.t('slideEditor.motion.effect.turn.name') },
    get detail() { return i18n.global.t('slideEditor.motion.effect.turn.detail') },
    from: { opacity: 0, rotation: -8, scale: 0.92 },
  },
  {
    id: 'blur',
    get name() { return i18n.global.t('slideEditor.motion.effect.blur.name') },
    get detail() { return i18n.global.t('slideEditor.motion.effect.blur.detail') },
    from: { opacity: 0, blur: 12 },
  },
]
