import type { CreateBody } from '@/api/generation'

export const MAX_SLIDES = 50

export interface CreateOptions {
  slides: string
  language: string
  tone: CreateBody['tone']
  verbosity: CreateBody['verbosity']
  instructions: string
  includeTitleSlide: boolean
  includeTableOfContents: boolean
  webSearch: boolean
  /** Plan every slide's entrance motion once the deck is generated (handed to the editor, see `animateFlagKey`). */
  animate: boolean
}

/**
 * The create endpoint has no `animate`: the choice travels to the editor as a one-shot session flag on the
 * new deck, which the editor consumes when generation finishes.
 */
export const animateFlagKey = (presentationId: string) => `presenton.animate.${presentationId}`

/** Digits only, no leading zeros, at most MAX_SLIDES; '' means automatic. */
export function clampSlideCount(value: string): string {
  const digits = value.replace(/\D+/g, '').replace(/^0+/, '')
  return digits ? String(Math.min(Number(digits), MAX_SLIDES)) : ''
}
