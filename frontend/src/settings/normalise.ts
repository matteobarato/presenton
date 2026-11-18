// Ported from servers/nextjs/utils/storeHelpers.ts
import type { ProviderConfig } from './types'

export function isProvided(value: unknown): boolean {
  return value !== '' && value !== null && value !== undefined
}

function parseOptionalBool(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value !== 'string') {
    return undefined
  }

  const normalised = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalised)) {
    return true
  }
  if (['0', 'false', 'no', 'off'].includes(normalised)) {
    return false
  }
  return undefined
}

export function normaliseConfig(config: ProviderConfig): ProviderConfig {
  const out: Record<string, unknown> = { ...config }

  for (const key of [
    'DISABLE_IMAGE_GENERATION',
    'WEB_GROUNDING',
    'OPENROUTER_ALLOW_FALLBACKS',
    'OPENROUTER_REQUIRE_PARAMETERS',
    'OPENROUTER_ZDR',
  ]) {
    const parsed = parseOptionalBool(out[key])
    if (parsed !== undefined) out[key] = parsed
  }

  const maxTokens = out.LLM_MAX_OUTPUT_TOKENS
  if (typeof maxTokens === 'string' && maxTokens.trim()) {
    const parsed = Number(maxTokens)
    if (Number.isInteger(parsed)) out.LLM_MAX_OUTPUT_TOKENS = parsed
  }

  const hasManualTokenLimit = isProvided(out.LLM_MAX_OUTPUT_TOKENS)
  if (out.LLM_GENERATION_PROFILE !== 'model_max' || hasManualTokenLimit) {
    // Profiles are no longer user-facing. Keep only the internal model-max
    // marker used by the checkbox and remove any legacy preset selection.
    out.LLM_GENERATION_PROFILE = ''
  }
  // Reasoning budget is no longer exposed in the UI. Sending an empty value
  // removes any previously saved budget instead of leaving a hidden override.
  out.LLM_REASONING_BUDGET_TOKENS = ''
  if (out.LLM_REASONING_EFFORT === 'none') {
    out.LLM_REASONING_EFFORT = ''
  }
  const providerOrder = out.OPENROUTER_PROVIDER_ORDER
  if (typeof providerOrder === 'string') {
    out.OPENROUTER_PROVIDER_ORDER = providerOrder
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  }

  return out as ProviderConfig
}
