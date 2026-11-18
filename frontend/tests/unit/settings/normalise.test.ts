import { describe, expect, it } from 'vitest'
import { migrateLegacyAzure, normaliseConfig } from '@/settings/normalise'
import type { ProviderConfig } from '@/settings/types'

const loose = (patch: Record<string, unknown>) => patch as ProviderConfig

describe('normaliseConfig', () => {
  describe.each(['DISABLE_IMAGE_GENERATION', 'WEB_GROUNDING', 'OPENROUTER_ALLOW_FALLBACKS'])(
    'boolean field %s',
    (key) => {
      it.each(['true', '1', 'yes', 'on', ' TRUE '])('%j becomes true', (raw) => {
        expect(normaliseConfig(loose({ [key]: raw }))[key]).toBe(true)
      })
      it.each(['false', '0', 'no', 'off', ' Off '])('%j becomes false', (raw) => {
        expect(normaliseConfig(loose({ [key]: raw }))[key]).toBe(false)
      })
      it('leaves a garbage string as is', () => {
        expect(normaliseConfig(loose({ [key]: 'maybe' }))[key]).toBe('maybe')
      })
      it('leaves a real boolean as is', () => {
        expect(normaliseConfig(loose({ [key]: true }))[key]).toBe(true)
        expect(normaliseConfig(loose({ [key]: false }))[key]).toBe(false)
      })
    },
  )

  it('also parses the other OpenRouter booleans', () => {
    const out = normaliseConfig(
      loose({ OPENROUTER_REQUIRE_PARAMETERS: 'yes', OPENROUTER_ZDR: 'no' }),
    )
    expect(out.OPENROUTER_REQUIRE_PARAMETERS).toBe(true)
    expect(out.OPENROUTER_ZDR).toBe(false)
  })

  it('does not add boolean keys that were absent', () => {
    expect('WEB_GROUNDING' in normaliseConfig({})).toBe(false)
  })

  describe('LLM_MAX_OUTPUT_TOKENS', () => {
    it('parses an integer string to a number', () => {
      expect(normaliseConfig(loose({ LLM_MAX_OUTPUT_TOKENS: '4096' })).LLM_MAX_OUTPUT_TOKENS).toBe(4096)
    })
    it('leaves a non-numeric string as is', () => {
      expect(normaliseConfig(loose({ LLM_MAX_OUTPUT_TOKENS: 'abc' })).LLM_MAX_OUTPUT_TOKENS).toBe('abc')
    })
    it('leaves a fractional string as is', () => {
      expect(normaliseConfig(loose({ LLM_MAX_OUTPUT_TOKENS: '1.5' })).LLM_MAX_OUTPUT_TOKENS).toBe('1.5')
    })
    it('leaves a blank string as is', () => {
      expect(normaliseConfig(loose({ LLM_MAX_OUTPUT_TOKENS: '  ' })).LLM_MAX_OUTPUT_TOKENS).toBe('  ')
    })
  })

  describe('LLM_GENERATION_PROFILE', () => {
    it('keeps model_max when there is no manual token limit', () => {
      expect(normaliseConfig({ LLM_GENERATION_PROFILE: 'model_max' }).LLM_GENERATION_PROFILE).toBe('model_max')
    })
    it('clears model_max when a manual limit is set', () => {
      const out = normaliseConfig({ LLM_GENERATION_PROFILE: 'model_max', LLM_MAX_OUTPUT_TOKENS: 2048 })
      expect(out.LLM_GENERATION_PROFILE).toBe('')
    })
    it('clears model_max when the manual limit is a numeric string', () => {
      const out = normaliseConfig(loose({ LLM_GENERATION_PROFILE: 'model_max', LLM_MAX_OUTPUT_TOKENS: '2048' }))
      expect(out.LLM_GENERATION_PROFILE).toBe('')
    })
    it.each(['fast', 'balanced', 'deep'] as const)('clears the legacy preset %s', (profile) => {
      expect(normaliseConfig({ LLM_GENERATION_PROFILE: profile }).LLM_GENERATION_PROFILE).toBe('')
    })
    it('sets an empty profile when none was present', () => {
      expect(normaliseConfig({}).LLM_GENERATION_PROFILE).toBe('')
    })
  })

  it('always empties LLM_REASONING_BUDGET_TOKENS', () => {
    expect(normaliseConfig({}).LLM_REASONING_BUDGET_TOKENS).toBe('')
    expect(normaliseConfig({ LLM_REASONING_BUDGET_TOKENS: 1024 }).LLM_REASONING_BUDGET_TOKENS).toBe('')
  })

  it('maps LLM_REASONING_EFFORT none to an empty string and keeps other values', () => {
    expect(normaliseConfig({ LLM_REASONING_EFFORT: 'none' }).LLM_REASONING_EFFORT).toBe('')
    expect(normaliseConfig({ LLM_REASONING_EFFORT: 'high' }).LLM_REASONING_EFFORT).toBe('high')
  })

  it('splits a comma separated OPENROUTER_PROVIDER_ORDER string', () => {
    const out = normaliseConfig(loose({ OPENROUTER_PROVIDER_ORDER: 'a, b,,c' }))
    expect(out.OPENROUTER_PROVIDER_ORDER).toEqual(['a', 'b', 'c'])
  })

  it('leaves an OPENROUTER_PROVIDER_ORDER array as is', () => {
    const out = normaliseConfig({ OPENROUTER_PROVIDER_ORDER: ['x', 'y'] })
    expect(out.OPENROUTER_PROVIDER_ORDER).toEqual(['x', 'y'])
  })

  it('returns a copy and does not mutate the input', () => {
    const input = loose({
      WEB_GROUNDING: 'true',
      LLM_MAX_OUTPUT_TOKENS: '10',
      LLM_REASONING_EFFORT: 'none',
      OPENROUTER_PROVIDER_ORDER: 'a,b',
    })
    const snapshot = structuredClone(input)
    const out = normaliseConfig(input)
    expect(out).not.toBe(input)
    expect(input).toEqual(snapshot)
  })
})

describe('migrateLegacyAzure', () => {
  it('uses the deployment as the model when no model is set, and blanks the legacy fields', () => {
    const out = migrateLegacyAzure(loose({ AZURE_OPENAI_DEPLOYMENT: 'dep', AZURE_OPENAI_BASE_URL: 'https://legacy.test' }))
    expect(out.AZURE_OPENAI_MODEL).toBe('dep')
    expect(out.AZURE_OPENAI_DEPLOYMENT).toBe('')
    expect(out.AZURE_OPENAI_BASE_URL).toBe('')
  })

  it('treats a blank model as unset', () => {
    expect(migrateLegacyAzure(loose({ AZURE_OPENAI_DEPLOYMENT: 'dep', AZURE_OPENAI_MODEL: '  ' })).AZURE_OPENAI_MODEL).toBe('dep')
  })

  it('keeps an existing model', () => {
    const out = migrateLegacyAzure(loose({ AZURE_OPENAI_DEPLOYMENT: 'dep', AZURE_OPENAI_MODEL: 'gpt-x' }))
    expect(out.AZURE_OPENAI_MODEL).toBe('gpt-x')
    expect(out.AZURE_OPENAI_DEPLOYMENT).toBe('')
  })

  it('blanks a lone legacy base URL without touching the model', () => {
    const out = migrateLegacyAzure(loose({ AZURE_OPENAI_BASE_URL: 'https://legacy.test', AZURE_OPENAI_MODEL: 'gpt-x' }))
    expect(out).toEqual({ AZURE_OPENAI_BASE_URL: '', AZURE_OPENAI_MODEL: 'gpt-x' })
  })

  it('leaves configs without legacy values untouched', () => {
    const config = loose({ LLM: 'azure', AZURE_OPENAI_MODEL: 'gpt-x', AZURE_OPENAI_DEPLOYMENT: '' })
    expect(migrateLegacyAzure(config)).toEqual(config)
  })

  it('does not mutate its input', () => {
    const config = loose({ AZURE_OPENAI_DEPLOYMENT: 'dep', AZURE_OPENAI_BASE_URL: 'https://legacy.test' })
    const snapshot = JSON.parse(JSON.stringify(config))
    migrateLegacyAzure(config)
    expect(config).toEqual(snapshot)
  })
})
