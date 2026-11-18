import { describe, expect, it } from 'vitest'
import {
  CLASSIC_SETTINGS_URL,
  DEFAULT_OLLAMA_URL,
  IMAGE_PROVIDERS,
  LOCALHOST_OLLAMA_URL,
  SIGN_IN_PROVIDERS,
  TEXT_PROVIDERS,
  WEB_SEARCH_PROVIDERS,
  canDiscover,
  resolveDiscoveryUrl,
  textProvider,
} from '@/settings/providers'
import { OAUTH_MANAGED_FIELDS, SETTINGS_SECTIONS } from '@/settings/types'

type Expected = [
  value: string,
  keyField: string | undefined,
  modelField: string,
  urlField: string | undefined,
  discovery: string,
  preferredModel: string | undefined,
]

const EXPECTED: Expected[] = [
  ['openai', 'OPENAI_API_KEY', 'OPENAI_MODEL', undefined, 'openai-compatible', 'gpt-4.1'],
  ['deepseek', 'DEEPSEEK_API_KEY', 'DEEPSEEK_MODEL', 'DEEPSEEK_BASE_URL', 'openai-compatible', 'deepseek-chat'],
  ['google', 'GOOGLE_API_KEY', 'GOOGLE_MODEL', undefined, 'google', 'models/gemini-2.5-flash'],
  ['vertex', 'VERTEX_API_KEY', 'VERTEX_MODEL', undefined, 'manual', undefined],
  ['azure', 'AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_MODEL', undefined, 'manual', undefined],
  ['bedrock', 'BEDROCK_API_KEY', 'BEDROCK_MODEL', undefined, 'manual', undefined],
  ['openrouter', 'OPENROUTER_API_KEY', 'OPENROUTER_MODEL', undefined, 'openai-compatible', 'openai/gpt-4o'],
  ['cerebras', 'CEREBRAS_API_KEY', 'CEREBRAS_MODEL', undefined, 'openai-compatible', 'llama-3.3-70b'],
  ['litellm', 'LITELLM_API_KEY', 'LITELLM_MODEL', 'LITELLM_BASE_URL', 'openai-compatible', 'gpt-4.1'],
  ['fireworks', 'FIREWORKS_API_KEY', 'FIREWORKS_MODEL', 'FIREWORKS_BASE_URL', 'openai-compatible', 'accounts/fireworks/models/llama-v3p1-8b-instruct'],
  ['together', 'TOGETHER_API_KEY', 'TOGETHER_MODEL', 'TOGETHER_BASE_URL', 'openai-compatible', 'openai/gpt-oss-20b'],
  ['lmstudio', 'LMSTUDIO_API_KEY', 'LMSTUDIO_MODEL', 'LMSTUDIO_BASE_URL', 'openai-compatible', 'openai/gpt-oss-20b'],
  ['anthropic', 'ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL', undefined, 'anthropic', 'claude-sonnet-4-20250514'],
  ['ollama', undefined, 'OLLAMA_MODEL', 'OLLAMA_URL', 'ollama', undefined],
  ['custom', 'CUSTOM_LLM_API_KEY', 'CUSTOM_MODEL', 'CUSTOM_LLM_URL', 'openai-compatible', undefined],
]

describe('TEXT_PROVIDERS', () => {
  it('has 15 rows in picker order, without sign-in providers', () => {
    expect(TEXT_PROVIDERS).toHaveLength(15)
    expect(TEXT_PROVIDERS.map((r) => r.value)).toEqual(EXPECTED.map((e) => e[0]))
    expect(TEXT_PROVIDERS.some((r) => r.value === 'presenton' || r.value === 'codex')).toBe(false)
  })

  it.each(EXPECTED)('%s row', (value, keyField, modelField, urlField, discovery, preferredModel) => {
    const row = textProvider(value)!
    expect(row.keyField).toBe(keyField)
    expect(row.modelField).toBe(modelField)
    expect(row.urlField).toBe(urlField)
    expect(row.discovery).toBe(discovery)
    expect(row.preferredModel).toBe(preferredModel)
  })

  it('textProvider returns undefined for unknown or missing values', () => {
    expect(textProvider('codex')).toBeUndefined()
    expect(textProvider(undefined)).toBeUndefined()
  })

  it('flags optional keys, required urls and special field groups', () => {
    expect(textProvider('bedrock')).toMatchObject({ keyOptional: true, fields: 'bedrock' })
    expect(textProvider('vertex')?.fields).toBe('vertex-azure')
    expect(textProvider('azure')?.fields).toBe('vertex-azure')
    expect(textProvider('ollama')?.fields).toBe('ollama')
    expect(textProvider('deepseek')).toMatchObject({ urlOptional: true, advancedUrl: true })
    expect(textProvider('custom')?.urlOptional).toBeFalsy()
    expect(textProvider('openai')?.getApiKeyUrl).toContain('openai')
    expect(textProvider('openai')?.icon).toBe('/providers/openai.png')
  })
})

describe('resolveDiscoveryUrl', () => {
  it('falls back to the default url', () => {
    expect(resolveDiscoveryUrl(textProvider('openai')!, {})).toBe('https://api.openai.com/v1')
  })
  it('trims a configured url', () => {
    expect(
      resolveDiscoveryUrl(textProvider('deepseek')!, { DEEPSEEK_BASE_URL: ' https://x/v1 ' }),
    ).toBe('https://x/v1')
  })
  it('is empty when nothing is configured and there is no default', () => {
    expect(resolveDiscoveryUrl(textProvider('custom')!, {})).toBe('')
  })
})

describe('canDiscover', () => {
  it('needs a key for openai', () => {
    expect(canDiscover(textProvider('openai')!, {})).toBe(false)
    expect(canDiscover(textProvider('openai')!, { OPENAI_API_KEY: 'sk-test-fake' })).toBe(true)
  })
  it('needs a url for litellm but not a key', () => {
    expect(canDiscover(textProvider('litellm')!, {})).toBe(false)
    expect(canDiscover(textProvider('litellm')!, { LITELLM_BASE_URL: 'http://proxy:4000/v1' })).toBe(true)
  })
  it('is always true for lmstudio', () => {
    expect(canDiscover(textProvider('lmstudio')!, {})).toBe(true)
  })
})

describe('other tables', () => {
  it('lists image providers in order', () => {
    expect(IMAGE_PROVIDERS.map((p) => p.value)).toEqual([
      'pexels', 'pixabay', 'dall-e-3', 'gpt-image-1.5', 'gemini_flash',
      'nanobanana_pro', 'comfyui', 'open_webui', 'openai_compatible',
    ])
  })
  it('lists web search providers in order', () => {
    expect(WEB_SEARCH_PROVIDERS.map((p) => p.value)).toEqual(['auto', 'searxng', 'tavily', 'exa', 'brave'])
  })
  it('defines sign-in providers and constants', () => {
    expect(Object.keys(SIGN_IN_PROVIDERS).sort()).toEqual(['codex', 'presenton'])
    expect(SIGN_IN_PROVIDERS.codex.label).toBe('ChatGPT')
    expect(DEFAULT_OLLAMA_URL).toBe('http://host.docker.internal:11434')
    expect(LOCALHOST_OLLAMA_URL).toBe('http://localhost:11434')
    expect(CLASSIC_SETTINGS_URL).toBe('http://backend.test:5001/settings')
  })
  it('defines sections and oauth-managed fields', () => {
    expect(SETTINGS_SECTIONS).toEqual(['text', 'images', 'web-search', 'account'])
    expect(OAUTH_MANAGED_FIELDS).toEqual([
      'CODEX_ACCESS_TOKEN', 'CODEX_REFRESH_TOKEN', 'CODEX_TOKEN_EXPIRES',
      'CODEX_ACCOUNT_ID', 'PRESENTON_CONNECTED', 'PRESENTON_EMAIL',
    ])
  })
})
