import { useQuery } from '@tanstack/vue-query'
import { toValue, type MaybeRefOrGetter, type Ref } from 'vue'
import { api, unwrap } from './client'
import type { Presentation, Slide } from './types'

export const presentationKeys = {
  all: ['presentations'] as const,
  one: (id: string) => ['presentation', id] as const,
}

export type PresentationSummary = Presentation

export function listPresentations(): Promise<PresentationSummary[]> {
  return unwrap(api.GET('/api/v1/ppt/presentation/all'))
}

export function getPresentation(id: string): Promise<Presentation> {
  return unwrap(api.GET('/api/v1/ppt/presentation/{id}', { params: { path: { id } } }))
}

export function duplicatePresentation(id: string): Promise<Presentation> {
  return unwrap(api.POST('/api/v1/ppt/presentation/{id}/duplicate', { params: { path: { id } } }))
}

export async function deletePresentation(id: string): Promise<void> {
  await unwrap(api.DELETE('/api/v1/ppt/presentation/{id}', { params: { path: { id } } }))
}

export function updatePresentation(body: {
  id: string
  title?: string
  slides?: Slide[]
  theme?: unknown
  n_slides?: number
}): Promise<Presentation> {
  return unwrap(
    api.PATCH('/api/v1/ppt/presentation/update', {
      // The generated input types are stricter than the editor's working types.
      body: body as never,
    }),
  )
}

export interface UsePresentationOptions {
  refetchOnWindowFocus?: MaybeRefOrGetter<boolean>
  refetchOnReconnect?: MaybeRefOrGetter<boolean>
}

export function usePresentation(id: Ref<string>, opts: UsePresentationOptions = {}) {
  return useQuery({
    ...(opts.refetchOnWindowFocus !== undefined && { refetchOnWindowFocus: () => toValue(opts.refetchOnWindowFocus!) }),
    ...(opts.refetchOnReconnect !== undefined && { refetchOnReconnect: () => toValue(opts.refetchOnReconnect!) }),
    queryKey: () => presentationKeys.one(id.value),
    queryFn: () => getPresentation(id.value),
    enabled: () => Boolean(id.value),
  })
}
