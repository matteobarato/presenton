import { api, unwrap } from './client'
import type { components } from './schema'

export type ThemeRecord = components['schemas']['ThemeResponse']
export type ThemeCreateBody = components['schemas']['ThemeRequest']
export type ThemeUpdateBody = components['schemas']['ThemeUpdateRequest']
export type GeneratedThemeColors = components['schemas']['ThemeData']
export type GenerateThemeHints = components['schemas']['GenerateThemeRequestV3']

export const themeKeys = {
  all: ['themes'] as const,
}

export function listThemes(): Promise<ThemeRecord[]> {
  return unwrap(api.GET('/api/v1/ppt/themes/all'))
}

/** Built-in themes the backend knows about (currently an empty list). */
export function getDefaultTheme(): Promise<Record<string, unknown>[]> {
  return unwrap(api.GET('/api/v1/ppt/themes/default'))
}

export function createTheme(body: ThemeCreateBody): Promise<ThemeRecord> {
  return unwrap(api.POST('/api/v1/ppt/themes/create', { body }))
}

export function updateTheme(id: string, body: ThemeUpdateBody): Promise<ThemeRecord> {
  return unwrap(
    api.PATCH('/api/v1/ppt/themes/update/{theme_id}', { params: { path: { theme_id: id } }, body }),
  )
}

export async function deleteTheme(id: string): Promise<void> {
  await unwrap(api.DELETE('/api/v1/ppt/themes/delete/{theme_id}', { params: { path: { theme_id: id } } }))
}

/**
 * Derives a full palette from seed colours. The endpoint takes colour hints
 * (hex), not free text, so the "prompt" is a set of seed colours.
 */
export function generateTheme(hints: GenerateThemeHints): Promise<GeneratedThemeColors> {
  return unwrap(api.POST('/api/v1/ppt/theme/generate', { body: hints }))
}
