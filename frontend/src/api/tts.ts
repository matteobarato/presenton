import { useQuery } from '@tanstack/vue-query'
import type { Ref } from 'vue'
import { api, unwrap } from './client'
import type { components } from './schema'
import type { AsyncTask } from './types'

/** GET .../speaker-notes/tts: every stored reading of a deck for one language, in slide order. */
export type TtsStatus = components['schemas']['SpeakerNoteAudiosResponse']
/**
 * One slide's narration. Note the spec names: `url` (audio file), `duration_seconds`,
 * `text` (the note it was recorded from). There is no stale flag here: staleness is
 * derived by comparing `text` with the slide's current speaker note.
 */
export type TtsAudio = components['schemas']['SpeakerNoteAudioResponse']
export type TtsLanguage = components['schemas']['SupportedTTSLanguageResponse']

export const ttsKeys = {
  status: (id: string, lang: string) => ['tts', id, lang] as const,
}

export function listTtsLanguages(): Promise<TtsLanguage[]> {
  return unwrap(api.GET('/api/v1/ppt/presentation/speaker-notes/tts/languages'))
}

export function getTtsStatus(id: string, language: string): Promise<TtsStatus> {
  return unwrap(
    api.GET('/api/v1/ppt/presentation/{id}/speaker-notes/tts', {
      params: { path: { id }, query: { language } },
    }),
  )
}

export function generateTtsAsync(
  id: string,
  body: { language: string; slide_indexes?: number[]; regenerate?: boolean; voice?: string },
): Promise<AsyncTask> {
  return unwrap(
    api.POST('/api/v1/ppt/presentation/{id}/speaker-notes/tts/async', {
      params: { path: { id } },
      body: body as never,
    }),
  )
}

export async function deleteTts(id: string, language?: string): Promise<void> {
  await unwrap(
    api.DELETE('/api/v1/ppt/presentation/{id}/speaker-notes/tts', {
      params: { path: { id }, query: language ? { language } : {} },
    }),
  )
}

/** Same-origin path of the per-slide narration endpoint (metadata incl. the file `url`). */
export function slideAudioUrl(id: string, index: number, language: string): string {
  return `/api/v1/ppt/presentation/${encodeURIComponent(id)}/speaker-notes/tts/${index}?language=${encodeURIComponent(language)}`
}

/** Make the (possibly absolute) `url` of a stored reading same-origin so it plays through the proxy. */
export function audioSrc(audio: Pick<TtsAudio, 'url'>): string {
  try {
    const u = new URL(audio.url, window.location.origin)
    return u.origin === window.location.origin ? audio.url : u.pathname + u.search
  } catch {
    return audio.url
  }
}

export function useTts(id: Ref<string>, language: Ref<string>) {
  return useQuery({
    queryKey: () => ttsKeys.status(id.value, language.value),
    queryFn: () => getTtsStatus(id.value, language.value),
    enabled: () => Boolean(id.value && language.value),
  })
}
