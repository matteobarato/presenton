import { api, unwrap } from './client'
import type { Presentation } from './types'

export function generateSpeakerNotes(
  id: string,
  body: { slide_indexes?: number[]; regenerate?: boolean; verbosity?: 'low' | 'medium' | 'high' | 'very-high' } = {},
): Promise<Presentation> {
  return unwrap(
    api.POST('/api/v1/ppt/presentation/{id}/speaker-notes', {
      params: { path: { id } },
      body: body as never,
    }),
  )
}

export function updateSpeakerNotes(
  id: string,
  notes: { slide_index: number; speaker_note: string }[],
): Promise<Presentation> {
  if (notes.length === 0) return Promise.reject(new Error('updateSpeakerNotes needs at least one note'))
  return unwrap(api.PUT('/api/v1/ppt/presentation/{id}/speaker-notes', { params: { path: { id } }, body: { notes } }))
}
