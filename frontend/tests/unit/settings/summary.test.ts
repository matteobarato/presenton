import { describe, expect, it } from 'vitest'
import {
  imageSummary,
  isSecretKey,
  sectionSubtitle,
  textSummary,
  webSearchSummary,
} from '@/settings/summary'

describe('textSummary', () => {
  it('shows label and model', () => {
    expect(textSummary({ LLM: 'openai', OPENAI_MODEL: 'gpt-4.1' })).toBe('OpenAI (gpt-4.1)')
  })
  it('shows the label alone without a model', () => {
    expect(textSummary({ LLM: 'openai' })).toBe('OpenAI')
  })
  it('handles no provider', () => {
    expect(textSummary({})).toBe('No text provider')
  })
  it('falls back to the raw value for unknown providers', () => {
    expect(textSummary({ LLM: 'mystery' })).toBe('mystery')
  })
  it('uses CODEX_MODEL for ChatGPT sign-in', () => {
    expect(textSummary({ LLM: 'codex', CODEX_MODEL: 'gpt-5.4' })).toBe('ChatGPT (gpt-5.4)')
  })
  it('shows Presenton without a model', () => {
    expect(textSummary({ LLM: 'presenton' })).toBe('Presenton')
  })
})

describe('imageSummary', () => {
  it('is cloud for presenton', () => {
    expect(imageSummary({ LLM: 'presenton', IMAGE_PROVIDER: 'pexels' })).toBe('Cloud images')
  })
  it('reports disabled generation', () => {
    expect(imageSummary({ LLM: 'openai', DISABLE_IMAGE_GENERATION: true })).toBe('Image generation disabled')
  })
  it('shows the provider label', () => {
    expect(imageSummary({ LLM: 'openai', IMAGE_PROVIDER: 'pexels' })).toBe('Pexels')
  })
  it('falls back to the raw provider value', () => {
    expect(imageSummary({ LLM: 'openai', IMAGE_PROVIDER: 'zzz' })).toBe('zzz')
  })
  it('handles no provider', () => {
    expect(imageSummary({ LLM: 'openai' })).toBe('No image provider')
  })
})

describe('webSearchSummary', () => {
  it('is cloud for presenton', () => {
    expect(webSearchSummary({ LLM: 'presenton' })).toBe('Cloud web search')
  })
  it('shows the provider when grounding is on', () => {
    expect(webSearchSummary({ LLM: 'openai', WEB_GROUNDING: true, WEB_SEARCH_PROVIDER: 'Tavily' })).toBe('Web: Tavily')
  })
  it('says no provider when grounding is on without one', () => {
    expect(webSearchSummary({ LLM: 'openai', WEB_GROUNDING: true })).toBe('Web: No provider')
  })
  it('is disabled otherwise', () => {
    expect(webSearchSummary({ LLM: 'openai' })).toBe('Web search disabled')
  })
})

describe('sectionSubtitle', () => {
  const config = { LLM: 'openai', OPENAI_API_KEY: 'sk-test-fake', OPENAI_MODEL: 'gpt-4.1' }
  it('maps each section', () => {
    expect(sectionSubtitle('text', config)).toBe('OpenAI (gpt-4.1)')
    expect(sectionSubtitle('images', config)).toBe('No image provider')
    expect(sectionSubtitle('web-search', config)).toBe('Web search disabled')
    expect(sectionSubtitle('account', config)).toBe('')
  })
  it('never contains secrets', () => {
    for (const s of ['text', 'images', 'web-search', 'account'] as const) {
      expect(sectionSubtitle(s, config)).not.toContain('sk-test-fake')
    }
  })
})

describe('isSecretKey', () => {
  it('flags credential names', () => {
    expect(isSecretKey('OPENAI_API_KEY')).toBe(true)
    expect(isSecretKey('BEDROCK_AWS_SECRET_ACCESS_KEY')).toBe(true)
    expect(isSecretKey('CODEX_ACCESS_TOKEN')).toBe(true)
    expect(isSecretKey('SOME_PASSWORD')).toBe(true)
  })
  it('leaves other names alone', () => {
    expect(isSecretKey('OPENAI_MODEL')).toBe(false)
    expect(isSecretKey('LLM')).toBe(false)
  })
})
