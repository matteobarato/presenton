import type { Slide } from '@/api/types'
import type { TtsAudio } from '@/api/tts'

export type NarrationState = 'missing' | 'ready' | 'stale' | 'translated'

const normalise = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()

/** The audio entry for a slide. The backend keys entries by `slide_index` (= `slide.index`), with `slide_id` as a fallback. */
export function audioForSlide(slide: Slide, audios: readonly TtsAudio[] | undefined): TtsAudio | undefined {
  if (!audios) return undefined
  return (
    audios.find((a) => a.slide_index === slide.index) ?? (slide.id ? audios.find((a) => a.slide_id === slide.id) : undefined)
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
