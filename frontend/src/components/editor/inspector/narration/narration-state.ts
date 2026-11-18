import type { Slide } from '@/api/types'
import type { TtsAudio } from '@/api/tts'

export type NarrationState = 'missing' | 'ready' | 'stale' | 'translated'

const normalise = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()

/**
 * The audio entry for a slide: by `slide_id` first, since a cached `slide_index` goes stale when a
 * slide is added, removed or moved; by index only for an entry without an id.
 */
export function audioForSlide(slide: Slide, audios: readonly TtsAudio[] | undefined): TtsAudio | undefined {
  if (!audios) return undefined
  return (
    (slide.id ? audios.find((a) => a.slide_id === slide.id) : undefined) ??
    audios.find((a) => !a.slide_id && a.slide_index === slide.index)
  )
}

/**
 * missing: no recording. stale: the recorded text differs from the current note.
 * translated: the recording holds a translation, which can't be compared with the note, so freshness is unknown.
 */
export function narrationState(
  slide: Pick<Slide, 'speaker_note'>,
  audio: (Pick<TtsAudio, 'text'> & { translated?: boolean }) | null | undefined,
): NarrationState {
  if (!audio) return 'missing'
  if (audio.translated) return 'translated'
  return normalise(audio.text) === normalise(slide.speaker_note) ? 'ready' : 'stale'
}
