import { requestJson } from './client'

/** Accepted attachment types and limits (mirrors the old SupportingDoc). */
export const MAX_FILES = 8
export const ALLOWED_EXTENSIONS = [
  '.pdf', '.txt', '.doc', '.docx', '.docm', '.odt', '.rtf',
  '.ppt', '.pptx', '.pptm', '.odp', '.xls', '.xlsx', '.xlsm',
  '.ods', '.csv', '.tsv', '.jpg', '.jpeg', '.png', '.gif',
  '.bmp', '.tiff', '.webp',
] as const

/** `POST files/upload` (multipart, field `files`). Resolves to the stored file references. */
export function uploadFiles(files: File[]): Promise<unknown[]> {
  const body = new FormData()
  for (const file of files) body.append('files', file)
  return requestJson<unknown[]>('/api/v1/ppt/files/upload', { method: 'POST', body })
}

/** `POST files/decompose`; resolves to the extracted document paths. */
export async function decomposeFiles(documents: unknown[], language: string): Promise<string[]> {
  const response = await requestJson<unknown>('/api/v1/ppt/files/decompose', {
    method: 'POST',
    body: JSON.stringify({ file_paths: documents, language: language || null }),
  })
  return getDocumentPaths(response)
}

function getDocumentPaths(files: unknown): string[] {
  if (!Array.isArray(files)) return []
  return files
    .flat()
    .map((file) => (file && typeof file === 'object' && 'file_path' in file ? (file as { file_path?: unknown }).file_path : null))
    .filter((path): path is string => typeof path === 'string')
}
