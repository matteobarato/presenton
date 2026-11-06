import { api, unwrap } from './client'
import type { Slide } from './types'

/**
 * AI edit of one template slide. The backend answers with the updated slide
 * and gives it a fresh id, so callers swap it into the cache by the old id.
 */
export function editSlide(id: string, prompt: string): Promise<Slide> {
  return unwrap(api.POST('/api/v1/ppt/slide/edit', { body: { id, prompt } as never })) as Promise<Slide>
}
