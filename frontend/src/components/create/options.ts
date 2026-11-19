import type { CreateBody } from '@/api/generation'

export const MAX_SLIDES = 50

export interface CreateOptions {
  slides: string
  /** Slides that show an image: '' automatic, '0' none, otherwise the count. */
  images: string
  /** Slides with a presenter (avatar) video slot: '' automatic, '0' none, otherwise the count. */
  videos: string
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

export const SLIDE_PRESETS: { value: string; label: string }[] = [
  { value: '', label: 'Auto' },
  { value: '5', label: '5' },
  { value: '8', label: '8' },
  { value: '12', label: '12' },
  { value: '20', label: '20' },
]

export const IMAGE_PRESETS: { value: string; label: string }[] = [
  { value: '', label: 'Auto' },
  { value: '0', label: 'None' },
  { value: '3', label: '3' },
  { value: '5', label: '5' },
  { value: '8', label: '8' },
]

export const VIDEO_PRESETS: { value: string; label: string }[] = [
  { value: '', label: 'Auto' },
  { value: '0', label: 'None' },
  { value: '1', label: '1' },
  { value: '3', label: '3' },
  { value: '5', label: '5' },
]

export const TONES: { value: CreateBody['tone']; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'casual', label: 'Casual' },
  { value: 'professional', label: 'Professional' },
  { value: 'funny', label: 'Funny' },
  { value: 'educational', label: 'Educational' },
  { value: 'sales_pitch', label: 'Sales pitch' },
]

export const VERBOSITIES: { value: CreateBody['verbosity']; label: string; hint: string; lines: number }[] = [
  { value: 'concise', label: 'Concise', hint: 'Short points, room to talk', lines: 2 },
  { value: 'standard', label: 'Standard', hint: 'Balanced text and visuals', lines: 3 },
  { value: 'text-heavy', label: 'Text-heavy', hint: 'Reads well without a speaker', lines: 4 },
]

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

/** Digits only, at most MAX_SLIDES; '0' means none and '' means automatic. */
export function clampMediaCount(value: string): string {
  const digits = value.replace(/\D+/g, '')
  return digits ? String(Math.min(Number(digits), MAX_SLIDES)) : ''
}

/** The `n_images` / `n_videos` the create endpoint takes: null for automatic. */
export function mediaCountForRequest(count: string): number | null {
  return count === '' ? null : Number(count)
}
