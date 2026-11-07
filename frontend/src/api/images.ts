import { api, requestJson, unwrap } from './client'

/** An image stored by the backend (uploaded or generated). `path` is what a slide stores. */
export type ImageAsset = { id: string; path: string }

export const imageKeys = {
  uploaded: ['images', 'uploaded'] as const,
  generated: ['images', 'generated'] as const,
}

/** `POST images/upload` (multipart, field `file`), the same way `files.ts` uploads. */
export function uploadImage(file: File): Promise<ImageAsset> {
  const body = new FormData()
  body.append('file', file)
  return requestJson<ImageAsset>('/api/v1/ppt/images/upload', { method: 'POST', body })
}

export function listUploadedImages(): Promise<ImageAsset[]> {
  return unwrap(api.GET('/api/v1/ppt/images/uploaded')) as Promise<ImageAsset[]>
}

export function listGeneratedImages(): Promise<ImageAsset[]> {
  return unwrap(api.GET('/api/v1/ppt/images/generated')) as Promise<ImageAsset[]>
}

/** `GET images/generate?prompt=` resolves to the generated image's URL/path. */
export function generateImage(prompt: string, signal?: AbortSignal): Promise<string> {
  return unwrap(api.GET('/api/v1/ppt/images/generate', { params: { query: { prompt } }, signal })) as Promise<string>
}

/** `GET images/search?query=` resolves to stock image URLs. */
export function searchStockImages(query: string, signal?: AbortSignal): Promise<string[]> {
  return unwrap(api.GET('/api/v1/ppt/images/search', { params: { query: { query } }, signal }))
}
