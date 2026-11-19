import { api, unwrap } from './client'
import type { AnimationTween, AsyncTask, SlideAnimation } from './types'

/**
 * Its own root (not under `['presentation', id]`): invalidating the deck must not refetch animations,
 * which renders the composition server-side.
 */
export const animationKeys = {
  one: (id: string) => ['animations', id] as const,
}

export type GenerateAnimationsBody = { slide_indexes?: number[]; force?: boolean }

export function getAnimations(id: string): Promise<{ slides: SlideAnimation[] }> {
  return unwrap(api.GET('/api/v1/ppt/presentation/{id}/animations', { params: { path: { id } } })) as Promise<{
    slides: SlideAnimation[]
  }>
}

export function generateAnimations(
  id: string,
  body: GenerateAnimationsBody = {},
): Promise<{ slides: SlideAnimation[] }> {
  return unwrap(
    api.POST('/api/v1/ppt/presentation/{id}/animations', { params: { path: { id } }, body: body as never }),
  ) as Promise<{ slides: SlideAnimation[] }>
}

export function generateAnimationsAsync(id: string, body: GenerateAnimationsBody = {}): Promise<AsyncTask> {
  return unwrap(
    api.POST('/api/v1/ppt/presentation/{id}/animations/async', { params: { path: { id } }, body: body as never }),
  ) as Promise<AsyncTask>
}

/** What a hand edit was made against; the backend answers 409 when the slide no longer matches. */
export type AnimationEditGuard = { slide_id: string; targets_signature?: string | null }

export function putAnimation(
  id: string,
  slideIndex: number,
  tweens: AnimationTween[],
  guard?: AnimationEditGuard,
): Promise<SlideAnimation> {
  return unwrap(
    api.PUT('/api/v1/ppt/presentation/{id}/animations/{slide_index}', {
      params: { path: { id, slide_index: slideIndex } },
      body: { tweens, ...guard } as never,
    }),
  ) as Promise<SlideAnimation>
}

export async function deleteAnimation(id: string, slideIndex: number): Promise<void> {
  await unwrap(
    api.DELETE('/api/v1/ppt/presentation/{id}/animations/{slide_index}', {
      params: { path: { id, slide_index: slideIndex } },
    }),
  )
}
