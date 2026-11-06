import { api, unwrap } from './client'
import type { components } from './schema'

export type CreateBody = components['schemas']['Body_create_presentation_api_v1_ppt_presentation_create_post']
export type GenerationDefaults = components['schemas']['GenerationTokenDefaults']

/** `POST generation/defaults`: token limits for a provider/model pair. */
export function getGenerationDefaults(provider: string, model = ''): Promise<GenerationDefaults> {
  return unwrap(api.POST('/api/v1/ppt/generation/defaults', { body: { provider, model } }))
}

export async function createPresentation(body: CreateBody): Promise<{ id: string }> {
  const created = await unwrap(api.POST('/api/v1/ppt/presentation/create', { body }))
  return { id: String(created.id) }
}
