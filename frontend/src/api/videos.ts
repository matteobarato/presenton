import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { api, requestJson, unwrap } from './client'
import { ApiError } from './errors'
import type { components } from './schema'
import { audioSrc } from './tts'
import type { AsyncTask } from './types'

export type SlideVideo = components['schemas']['SlideVideoResponse']
export type SlideVideos = components['schemas']['SlideVideosResponse']
export type Portrait = components['schemas']['PortraitResponse']
export type AvatarPreview = components['schemas']['AvatarGenerationPreview']
export type AvatarGenerationBody = components['schemas']['SlideAvatarGenerationRequest']

/** One slide's entry in a generation task's `data.slides` (or in the preview). */
export interface AvatarSlidePlan {
  slide_index: number
  slide_id: string
  state: 'queued' | 'generating' | 'done' | 'failed' | 'skipped'
  reason?: string | null
  /** The provider's message when `state` is `failed`. */
  message?: string | null
}

export const videoKeys = {
  all: (id: string) => ['videos', id] as const,
  generation: (id: string) => ['videos', id, 'generation'] as const,
  preview: (id: string, language: string) => ['videos', id, 'preview', language] as const,
}

const base = (id: string) => `/api/v1/ppt/presentation/${encodeURIComponent(id)}/videos`

export function getVideos(id: string): Promise<SlideVideos> {
  return unwrap(api.GET('/api/v1/ppt/presentation/{id}/videos', { params: { path: { id } } }))
}

export function getPortrait(id: string): Promise<Portrait> {
  return unwrap(api.GET('/api/v1/ppt/presentation/{id}/videos/portrait', { params: { path: { id } } }))
}

export function uploadPortrait(id: string, file: File): Promise<Portrait> {
  const form = new FormData()
  form.append('file', file)
  return requestJson<Portrait>(`${base(id)}/portrait`, { method: 'PUT', body: form })
}

export async function deletePortrait(id: string): Promise<void> {
  await unwrap(api.DELETE('/api/v1/ppt/presentation/{id}/videos/portrait', { params: { path: { id } } }))
}

export function uploadSlideVideo(id: string, index: number, file: File): Promise<SlideVideo> {
  const form = new FormData()
  form.append('file', file)
  return requestJson<SlideVideo>(`${base(id)}/${index}`, { method: 'PUT', body: form })
}

export async function deleteSlideVideo(id: string, index: number): Promise<void> {
  await unwrap(
    api.DELETE('/api/v1/ppt/presentation/{id}/videos/{slide_index}', { params: { path: { id, slide_index: index } } }),
  )
}

/** Adds the avatar placeholder layer to the slide's `ui`: refetch the presentation afterwards. */
export function addPlaceholder(id: string, index: number): Promise<components['schemas']['PlaceholderResponse']> {
  return unwrap(
    api.POST('/api/v1/ppt/presentation/{id}/videos/{slide_index}/placeholder', {
      params: { path: { id, slide_index: index } },
      body: {} as never,
    }),
  )
}

/** Also deletes the slide's video on the server. */
export async function removePlaceholder(id: string, index: number): Promise<void> {
  await unwrap(
    api.DELETE('/api/v1/ppt/presentation/{id}/videos/{slide_index}/placeholder', {
      params: { path: { id, slide_index: index } },
    }),
  )
}

export function startAvatarGeneration(id: string, body: Partial<AvatarGenerationBody> = {}): Promise<AsyncTask> {
  return unwrap(
    api.POST('/api/v1/ppt/presentation/{id}/videos/generate', { params: { path: { id } }, body: body as never }),
  )
}

/** The deck's latest generation task (so a reloaded editor can resume), or null when there never was one. */
export async function getAvatarGeneration(id: string): Promise<AsyncTask | null> {
  try {
    return await unwrap(api.GET('/api/v1/ppt/presentation/{id}/videos/generate', { params: { path: { id } } }))
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null
    throw e
  }
}

export function avatarPreviewUrl(id: string, language?: string): string {
  return `${base(id)}/generate/preview${language ? `?language=${encodeURIComponent(language)}` : ''}`
}

/** What a generation would do now, slide by slide. */
export function getAvatarPreview(id: string, language?: string): Promise<AvatarPreview> {
  return unwrap(
    api.GET('/api/v1/ppt/presentation/{id}/videos/generate/preview', {
      params: { path: { id }, query: language ? { language } : {} },
    }),
  )
}

export function slidePlans(task: Pick<AsyncTask, 'data'> | null | undefined): AvatarSlidePlan[] {
  const slides = (task?.data as { slides?: unknown } | null | undefined)?.slides
  return Array.isArray(slides) ? (slides as AvatarSlidePlan[]) : []
}

/** A slide's video (by slide index) and its playable same-origin src, from the deck's shared videos query. */
export function useSlideVideo(presentationId: MaybeRefOrGetter<string>, slideIndex: MaybeRefOrGetter<number | null | undefined>) {
  const query = useQuery({
    queryKey: () => videoKeys.all(toValue(presentationId)),
    queryFn: () => getVideos(toValue(presentationId)),
  })
  const video = computed(() => {
    const index = toValue(slideIndex)
    return index == null ? undefined : (query.data.value?.videos ?? []).find((v) => v.slide_index === index)
  })
  const src = computed(() => (video.value?.url ? audioSrc({ url: video.value.url }) : null))
  return { video, src, isPending: query.isPending }
}
