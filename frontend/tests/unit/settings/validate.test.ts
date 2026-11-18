import { describe, expect, it } from 'vitest'
import { CODEX_MODEL_IDS, isSupportedCodexModel } from '@/settings/codexModels'
import { validateConfig } from '@/settings/validate'
import type { ConfigIssue } from '@/settings/validate'
import type { ProviderConfig } from '@/settings/types'

// Baseline that is valid apart from whatever a row overrides: images off, so
// text-provider rows are not masked by the image checks.
const base = { DISABLE_IMAGE_GENERATION: true }
const withImages = (patch: ProviderConfig): ProviderConfig => ({
  LLM: 'lmstudio',
  LMSTUDIO_MODEL: 'local-model',
  ...patch,
})

type Row = [patch: ProviderConfig, message: string, section: ConfigIssue['section']]

const textRows: Row[] = [
  [{}, 'Select a text provider.', 'text'],
  [{ ...base, LLM: 'nonsense' }, 'Unsupported or unknown text provider.', 'text'],
  [
    { ...base, LLM: 'openai', OPENAI_MODEL: 'gpt-x', LLM_MAX_OUTPUT_TOKENS: 0 },
    'Max output tokens must be a whole number greater than zero.',
    'text',
  ],
  [
    { ...base, LLM: 'openai', OPENAI_API_KEY: 'sk-test-fake', OPENAI_MODEL: 'gpt-x', LLM_MAX_OUTPUT_TOKENS: 'abc' as unknown as number },
    'Max output tokens must be a whole number greater than zero.',
    'text',
  ],
  [
    { ...base, LLM: 'openai', OPENAI_API_KEY: 'sk-test-fake', OPENAI_MODEL: 'gpt-x', LLM_MAX_OUTPUT_TOKENS: -5 },
    'Max output tokens must be a whole number greater than zero.',
    'text',
  ],
  [{ ...base, LLM: 'openai', OPENAI_MODEL: 'gpt-x' }, 'OpenAI API key is required.', 'text'],
  [
    { ...base, LLM: 'openai', OPENAI_API_KEY: 'sk-test-fake' },
    'Enter or select an OpenAI chat model ID on the Text Provider tab.',
    'text',
  ],
  [{ ...base, LLM: 'deepseek', DEEPSEEK_MODEL: 'm' }, 'DeepSeek API key is required.', 'text'],
  [{ ...base, LLM: 'deepseek', DEEPSEEK_API_KEY: 'sk-test-fake' }, 'Enter or select a DeepSeek model ID.', 'text'],
  [{ ...base, LLM: 'google', GOOGLE_MODEL: 'm' }, 'Google API key is required.', 'text'],
  [{ ...base, LLM: 'google', GOOGLE_API_KEY: 'sk-test-fake' }, 'Enter or select a Google model ID.', 'text'],
  [
    { ...base, LLM: 'vertex', VERTEX_MODEL: 'm' },
    'Vertex AI requires either a Vertex API key or a GCP project.',
    'text',
  ],
  [
    { ...base, LLM: 'vertex', VERTEX_MODEL: 'm', VERTEX_LOCATION: 'us-central1' },
    'Vertex AI requires either a Vertex API key or a GCP project.',
    'text',
  ],
  [
    { ...base, LLM: 'vertex', VERTEX_MODEL: 'm', VERTEX_API_KEY: 'sk-test-fake', VERTEX_PROJECT: 'p' },
    'Use either Vertex API key mode or project/location mode, not both.',
    'text',
  ],
  [
    { ...base, LLM: 'vertex', VERTEX_MODEL: 'm', VERTEX_API_KEY: 'sk-test-fake', VERTEX_LOCATION: 'us-central1' },
    'Use either Vertex API key mode or project/location mode, not both.',
    'text',
  ],
  [{ ...base, LLM: 'vertex', VERTEX_API_KEY: 'sk-test-fake' }, 'Vertex model is required.', 'text'],
  [
    { ...base, LLM: 'azure', AZURE_OPENAI_ENDPOINT: 'https://x', AZURE_OPENAI_API_VERSION: 'v', AZURE_OPENAI_MODEL: 'm' },
    'Azure OpenAI API key is required.',
    'text',
  ],
  [
    { ...base, LLM: 'azure', AZURE_OPENAI_API_KEY: 'sk-test-fake', AZURE_OPENAI_API_VERSION: 'v', AZURE_OPENAI_MODEL: 'm' },
    'Azure endpoint is required.',
    'text',
  ],
  [
    { ...base, LLM: 'azure', AZURE_OPENAI_API_KEY: 'sk-test-fake', AZURE_OPENAI_ENDPOINT: 'https://x', AZURE_OPENAI_MODEL: 'm' },
    'Azure OpenAI API version is required.',
    'text',
  ],
  [
    { ...base, LLM: 'azure', AZURE_OPENAI_API_KEY: 'sk-test-fake', AZURE_OPENAI_ENDPOINT: 'https://x', AZURE_OPENAI_API_VERSION: 'v' },
    'Azure model name is required.',
    'text',
  ],
  [{ ...base, LLM: 'bedrock', BEDROCK_API_KEY: 'sk-test-fake' }, 'Bedrock model is required.', 'text'],
  [{ ...base, LLM: 'bedrock', BEDROCK_MODEL: 'm' }, 'Provide Bedrock API key, or AWS access key ID + secret key.', 'text'],
  [
    { ...base, LLM: 'bedrock', BEDROCK_MODEL: 'm', BEDROCK_AWS_ACCESS_KEY_ID: 'AKIAFAKE' },
    'Provide Bedrock API key, or AWS access key ID + secret key.',
    'text',
  ],
  [
    { ...base, LLM: 'bedrock', BEDROCK_MODEL: 'm', BEDROCK_AWS_SECRET_ACCESS_KEY: 'fake-secret' },
    'Provide Bedrock API key, or AWS access key ID + secret key.',
    'text',
  ],
  [{ ...base, LLM: 'openrouter', OPENROUTER_MODEL: 'm' }, 'OpenRouter API key is required.', 'text'],
  [{ ...base, LLM: 'openrouter', OPENROUTER_API_KEY: 'sk-test-fake' }, 'Select or enter an OpenRouter model id.', 'text'],
  [{ ...base, LLM: 'cerebras', CEREBRAS_MODEL: 'm' }, 'Cerebras API key is required.', 'text'],
  [{ ...base, LLM: 'cerebras', CEREBRAS_API_KEY: 'sk-test-fake' }, 'Select or enter a Cerebras model id.', 'text'],
  [{ ...base, LLM: 'fireworks', FIREWORKS_MODEL: 'm' }, 'Fireworks API key is required.', 'text'],
  [{ ...base, LLM: 'fireworks', FIREWORKS_API_KEY: 'sk-test-fake' }, 'Select or enter a Fireworks model id.', 'text'],
  [{ ...base, LLM: 'together', TOGETHER_MODEL: 'm' }, 'Together API key is required.', 'text'],
  [{ ...base, LLM: 'together', TOGETHER_API_KEY: 'sk-test-fake' }, 'Select or enter a Together model id.', 'text'],
  [{ ...base, LLM: 'anthropic', ANTHROPIC_MODEL: 'm' }, 'Anthropic API key is required.', 'text'],
  [{ ...base, LLM: 'anthropic', ANTHROPIC_API_KEY: 'sk-test-fake' }, 'Enter or select an Anthropic model ID.', 'text'],
  [
    { ...base, LLM: 'ollama', OLLAMA_MODEL: 'm' },
    'Ollama URL is required. Enter your Ollama server URL, or click "Check models" to fill the reachable default.',
    'text',
  ],
  [
    { ...base, LLM: 'ollama', OLLAMA_URL: 'http://localhost:11434' },
    'Select an Ollama model. If none appear, confirm Ollama is running and reachable.',
    'text',
  ],
  [
    { ...base, LLM: 'custom', CUSTOM_MODEL: 'm' },
    'Enter your custom LLM endpoint URL (OpenAI-compatible).',
    'text',
  ],
  [
    { ...base, LLM: 'custom', CUSTOM_LLM_URL: 'https://x' },
    'Enter a model ID or alias for your custom endpoint.',
    'text',
  ],
  [{ ...base, LLM: 'litellm', LITELLM_MODEL: 'm' }, 'LiteLLM base URL is required.', 'text'],
  [
    { ...base, LLM: 'litellm', LITELLM_BASE_URL: 'https://x' },
    'Enter or select a LiteLLM model ID or alias.',
    'text',
  ],
  [{ ...base, LLM: 'lmstudio' }, 'Enter or select an LM Studio model ID.', 'text'],
  [{ ...base, LLM: 'codex' }, 'Select a Codex model.', 'text'],
  [{ ...base, LLM: 'codex', CODEX_MODEL: 'gpt-0-unknown' }, 'Select a supported Codex model.', 'text'],
  [{ ...base, LLM: 'chatgpt' }, 'Select a Codex model.', 'text'],
  [{ ...base, LLM: 'chatgpt', CODEX_MODEL: 'gpt-0-unknown' }, 'Select a supported Codex model.', 'text'],
]

const imageRows: Row[] = [
  [
    { LLM: 'lmstudio', LMSTUDIO_MODEL: 'm' },
    'Select an image provider, or turn off image generation.',
    'images',
  ],
  [
    { LLM: 'lmstudio', LMSTUDIO_MODEL: 'm', DISABLE_IMAGE_GENERATION: 'false' as unknown as boolean },
    'Select an image provider, or turn off image generation.',
    'images',
  ],
  [withImages({ IMAGE_PROVIDER: 'pexels' }), 'Pexels API key is required.', 'images'],
  [withImages({ IMAGE_PROVIDER: 'pixabay' }), 'Pixabay API key is required.', 'images'],
  [withImages({ IMAGE_PROVIDER: 'dall-e-3' }), 'OpenAI API key is required for DALL·E 3.', 'images'],
  [withImages({ IMAGE_PROVIDER: 'gpt-image-1.5' }), 'OpenAI API key is required for GPT Image 1.5.', 'images'],
  [
    withImages({ IMAGE_PROVIDER: 'gemini_flash' }),
    'Google API key is required for Gemini Flash image generation.',
    'images',
  ],
  [withImages({ IMAGE_PROVIDER: 'nanobanana_pro' }), 'Google API key is required for NanoBanana Pro.', 'images'],
  [withImages({ IMAGE_PROVIDER: 'comfyui' }), 'ComfyUI server URL is required.', 'images'],
  [withImages({ IMAGE_PROVIDER: 'open_webui' }), 'Open WebUI URL is required.', 'images'],
  [
    withImages({ IMAGE_PROVIDER: 'openai_compatible', OPENAI_COMPAT_IMAGE_API_KEY: 'sk-test-fake', OPENAI_COMPAT_IMAGE_MODEL: 'm' }),
    'OpenAI-compatible image API requires base URL, API key, and model.',
    'images',
  ],
  [
    withImages({ IMAGE_PROVIDER: 'openai_compatible', OPENAI_COMPAT_IMAGE_BASE_URL: 'https://x', OPENAI_COMPAT_IMAGE_MODEL: 'm' }),
    'OpenAI-compatible image API requires base URL, API key, and model.',
    'images',
  ],
  [
    withImages({ IMAGE_PROVIDER: 'openai_compatible', OPENAI_COMPAT_IMAGE_BASE_URL: 'https://x', OPENAI_COMPAT_IMAGE_API_KEY: 'sk-test-fake' }),
    'OpenAI-compatible image API requires base URL, API key, and model.',
    'images',
  ],
  [
    withImages({
      IMAGE_PROVIDER: 'openai_compatible',
      OPENAI_COMPAT_IMAGE_BASE_URL: '   ',
      OPENAI_COMPAT_IMAGE_API_KEY: 'sk-test-fake',
      OPENAI_COMPAT_IMAGE_MODEL: 'm',
    }),
    'OpenAI-compatible image API requires base URL, API key, and model.',
    'images',
  ],
  [withImages({ IMAGE_PROVIDER: 'nonsense' }), 'Select a valid image provider.', 'images'],
]

const webRows: Row[] = [
  [
    { ...base, LLM: 'lmstudio', LMSTUDIO_MODEL: 'm', WEB_GROUNDING: true },
    'Select a web search provider, or turn off web search.',
    'web-search',
  ],
  [
    { ...base, LLM: 'lmstudio', LMSTUDIO_MODEL: 'm', WEB_GROUNDING: 'true' as unknown as boolean },
    'Select a web search provider, or turn off web search.',
    'web-search',
  ],
  [
    { ...base, LLM: 'lmstudio', LMSTUDIO_MODEL: 'm', WEB_GROUNDING: true, WEB_SEARCH_PROVIDER: 'searxng' },
    'SearXNG base URL is required.',
    'web-search',
  ],
  [
    { ...base, LLM: 'lmstudio', LMSTUDIO_MODEL: 'm', WEB_GROUNDING: true, WEB_SEARCH_PROVIDER: 'tavily' },
    'Tavily API key is required.',
    'web-search',
  ],
  [
    { ...base, LLM: 'lmstudio', LMSTUDIO_MODEL: 'm', WEB_GROUNDING: true, WEB_SEARCH_PROVIDER: 'exa' },
    'Exa API key is required.',
    'web-search',
  ],
  [
    { ...base, LLM: 'lmstudio', LMSTUDIO_MODEL: 'm', WEB_GROUNDING: true, WEB_SEARCH_PROVIDER: 'brave' },
    'Brave Search API key is required.',
    'web-search',
  ],
  [
    { ...base, LLM: 'lmstudio', LMSTUDIO_MODEL: 'm', WEB_GROUNDING: true, WEB_SEARCH_PROVIDER: 'nonsense' },
    'Select a valid web search provider.',
    'web-search',
  ],
]

describe('validateConfig', () => {
  describe.each([
    ['text provider', textRows],
    ['image provider', imageRows],
    ['web search', webRows],
  ])('%s issues', (_label, rows) => {
    it.each(rows)('%j -> %s', (patch, message, section) => {
      expect(validateConfig(patch)).toEqual({ message, section })
    })
  })

  describe('valid configs', () => {
    it('accepts presenton with nothing else set', () => {
      expect(validateConfig({ LLM: 'presenton' })).toBeNull()
    })

    it('accepts a complete openai config with images disabled', () => {
      expect(
        validateConfig({
          LLM: 'openai',
          OPENAI_API_KEY: 'sk-test-fake',
          OPENAI_MODEL: 'gpt-x',
          DISABLE_IMAGE_GENERATION: true,
        }),
      ).toBeNull()
    })

    it('accepts a complete codex config', () => {
      expect(
        validateConfig({ LLM: 'codex', CODEX_MODEL: 'gpt-5.4', DISABLE_IMAGE_GENERATION: true }),
      ).toBeNull()
    })

    it('accepts lmstudio with only a model', () => {
      expect(
        validateConfig({ LLM: 'lmstudio', LMSTUDIO_MODEL: 'local-model', DISABLE_IMAGE_GENERATION: true }),
      ).toBeNull()
    })

    it('accepts web grounding with the auto provider', () => {
      expect(
        validateConfig({
          LLM: 'lmstudio',
          LMSTUDIO_MODEL: 'local-model',
          DISABLE_IMAGE_GENERATION: true,
          WEB_GROUNDING: true,
          WEB_SEARCH_PROVIDER: 'auto',
        }),
      ).toBeNull()
    })

    it('accepts a complete config with an image provider and a valid token limit', () => {
      expect(
        validateConfig({
          LLM: 'lmstudio',
          LMSTUDIO_MODEL: 'local-model',
          IMAGE_PROVIDER: 'pexels',
          PEXELS_API_KEY: 'sk-test-fake',
          LLM_MAX_OUTPUT_TOKENS: '4096' as unknown as number,
        }),
      ).toBeNull()
    })
  })

  it('does not mutate its input', () => {
    const input = { LLM: 'lmstudio', LMSTUDIO_MODEL: 'm', WEB_GROUNDING: 'false' } as unknown as ProviderConfig
    const snapshot = structuredClone(input)
    validateConfig(input)
    expect(input).toEqual(snapshot)
  })
})

describe('codexModels', () => {
  it('lists the supported model ids', () => {
    expect(CODEX_MODEL_IDS).toContain('gpt-5.4')
    expect(CODEX_MODEL_IDS).toHaveLength(7)
  })

  it.each([
    ['gpt-5.4', true],
    ['gpt-5.3-codex-spark', true],
    ['gpt-0-unknown', false],
    ['', false],
    [undefined, false],
  ])('isSupportedCodexModel(%j) is %s', (model, expected) => {
    expect(isSupportedCodexModel(model)).toBe(expected)
  })
})
