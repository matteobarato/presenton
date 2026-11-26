import { api, unwrap } from './client'
import type { components } from './schema'
import type { Presentation } from './types'

/** Starting a presentation from an uploaded PowerPoint: the deck keeps its own design. */

export type ImportPresentationBody = components['schemas']['ImportPresentationRequest']

export function importPresentation(body: ImportPresentationBody): Promise<Presentation> {
  return unwrap(api.POST('/api/v1/ppt/presentation/import', { body }))
}
