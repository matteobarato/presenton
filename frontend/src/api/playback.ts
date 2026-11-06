import { api, unwrap } from './client'
import type { components } from './schema'

export type Playback = components['schemas']['PresentationPlaybackResponse']
export type BubbleBox = { x: number; y: number; width: number; height: number }

export const playbackKeys = {
  one: (id: string) => ['playback', id] as const,
}

export function getPlayback(id: string, language?: string): Promise<Playback> {
  return unwrap(
    api.GET('/api/v1/ppt/presentation/{id}/playback', {
      params: { path: { id }, query: language ? { language } : {} },
    }),
  )
}

/** Where the voice bubble sits, in 1280x720 slide units. */
export function updateBubble(id: string, box: BubbleBox): Promise<components['schemas']['PlaybackBubble']> {
  return unwrap(api.PUT('/api/v1/ppt/presentation/{id}/playback/bubble', { params: { path: { id } }, body: box }))
}
