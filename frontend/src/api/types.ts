import type { components } from './schema'

export type Slide = components['schemas']['SlideModel-Output']
export type Presentation = components['schemas']['PresentationWithSlides']
export type AsyncTask = components['schemas']['AsyncTaskModel']

export type AnimationTween = {
  target: string
  from_values: Partial<Record<'opacity' | 'x' | 'y' | 'scale' | 'rotation' | 'blur', number>>
  duration: number
  delay: number
  ease: string
}
export type AnimationStatus = 'fresh' | 'stale_content' | 'stale_layout' | 'missing' | 'unsupported'
export type SlideAnimation = {
  slide_id: string
  index: number
  status: AnimationStatus
  source: 'llm' | 'fallback' | 'user' | null
  reset_from_user: boolean
  tweens: AnimationTween[]
  targets: { id: string; kind: string; text: string }[]
  /** Signature of `targets` as the slide is now; sent back with a PUT (null when unsupported). */
  targets_signature?: string | null
}
