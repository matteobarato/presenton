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
}

/** Digits only, no leading zeros, at most MAX_SLIDES; '' means automatic. */
export function clampSlideCount(value: string): string {
  const digits = value.replace(/\D+/g, '').replace(/^0+/, '')
  return digits ? String(Math.min(Number(digits), MAX_SLIDES)) : ''
}
