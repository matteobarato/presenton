import { requestJson } from './client'

export type GenerationMode = 'template' | 'smart' | 'both'

/** Payload of `servers/nextjs/app/api/runtime-config/route.ts`. */
export interface RuntimeProviderConfig {
  configured: boolean
  /** Provider settings; credential fields are redacted to "__configured__". */
  config: Record<string, unknown>
}

export interface RuntimeConfig extends RuntimeProviderConfig {
  generationMode: GenerationMode
}

/**
 * `PRESENTATION_GENERATION_MODE` is `standard | smart | both` on the Next.js
 * side; the new UI calls "standard" mode "template". Unknown/missing -> both.
 */
export function normalizeGenerationMode(value: unknown): GenerationMode {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (v === 'standard' || v === 'template') return 'template'
  if (v === 'smart') return 'smart'
  return 'both'
}

export async function getRuntimeConfig(): Promise<RuntimeConfig> {
  const raw = await requestJson<Partial<RuntimeProviderConfig> & Record<string, unknown>>('/api/runtime-config')
  const config = raw.config && typeof raw.config === 'object' ? raw.config : {}
  return {
    configured: Boolean(raw.configured),
    config,
    generationMode: normalizeGenerationMode(config.PRESENTATION_GENERATION_MODE ?? raw.PRESENTATION_GENERATION_MODE),
  }
}

/** Built-in template scan from `servers/nextjs/app/api/templates/route.ts`. */
export interface BuiltinTemplateRoute {
  templateName: string
  templateID: string
  files: string[]
  settings: {
    description?: string
    ordered?: boolean
    default?: boolean
    icon_type?: string
    icon_weight?: string
    [key: string]: unknown
  } | null
}

export function getTemplatesRoute(): Promise<unknown> {
  return requestJson<unknown>('/api/templates')
}

export async function canChangeKeys(): Promise<boolean> {
  const r = await requestJson<{ canChange?: boolean }>('/api/can-change-keys')
  return Boolean(r.canChange)
}

export async function hasRequiredKey(): Promise<boolean> {
  const r = await requestJson<{ hasKey?: boolean }>('/api/has-required-key')
  return Boolean(r.hasKey)
}
