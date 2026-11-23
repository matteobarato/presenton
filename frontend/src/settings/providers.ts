// Ported from servers/nextjs/utils/providerConstants.ts @ aa7c7ae8
import { i18n } from '@/i18n'
import type { ProviderConfig } from './types'

/**
 * Catalogue text is either a provider or model name (returned as-is) or a message key under `settings.` (translated
 * at call time, so templates re-render when the UI locale changes).
 */
export function tx(text: string): string
export function tx(text: string | undefined): string | undefined
export function tx(text: string | undefined): string | undefined {
  return text?.startsWith('settings.') ? i18n.global.t(text) : text
}

/** The label of a web search row; the default row is the only one that is translated. */
export function webSearchLabel(row: WebSearchProviderRow): string {
  return row.value === 'auto' ? i18n.global.t('settings.providers.web.auto.label') : row.label
}

export type DiscoveryKind = 'openai-compatible' | 'google' | 'anthropic' | 'ollama' | 'manual'

export interface TextProviderRow {
  value: string
  label: string
  description: string
  icon: string
  keyField?: string
  keyLabel?: string
  keyOptional?: boolean
  keyPlaceholder?: string
  modelField: string
  urlField?: string
  urlLabel?: string
  urlPlaceholder?: string
  urlOptional?: boolean
  defaultUrl?: string
  discovery: DiscoveryKind
  discoveryNeeds: ('key' | 'url')[]
  preferredModel?: string
  getApiKeyUrl?: string
  fields?: 'ollama' | 'vertex-azure' | 'bedrock'
  advancedUrl?: boolean
}

export interface ImageProviderRow {
  value: string
  label: string
  description?: string
  icon?: string
  requiresApiKey?: boolean
  apiKeyField?: string
  apiKeyFieldLabel?: string
  getApiKeyUrl?: string
}

export interface WebSearchProviderRow {
  value: string
  label: string
  description: string
  icon?: string
  apiKeyField?: string
  apiKeyLabel?: string
  urlField?: string
  urlLabel?: string
}

export const DEFAULT_OLLAMA_URL = 'http://host.docker.internal:11434'
export const LOCALHOST_OLLAMA_URL = 'http://localhost:11434'

/** The classic app lives on the backend origin; same-origin /settings is this app. */
export const CLASSIC_SETTINGS_URL = `${__SLIDESHOWS_BACKEND_URL__}/settings`

export const TEXT_PROVIDERS: TextProviderRow[] = [
  {
    value: 'openai',
    label: 'OpenAI',
    description: "settings.providers.text.openai.description",
    icon: '/providers/openai.png',
    keyField: 'OPENAI_API_KEY',
    keyLabel: 'settings.providers.text.openai.keyLabel',
    modelField: 'OPENAI_MODEL',
    defaultUrl: 'https://api.openai.com/v1',
    discovery: 'openai-compatible',
    discoveryNeeds: ['key'],
    preferredModel: 'gpt-4.1',
    getApiKeyUrl: 'https://www.google.com/search?q=how+to+get+openai+api+key&ie=UTF-8',
  },
  {
    value: 'deepseek',
    label: 'DeepSeek',
    description: 'settings.providers.text.deepseek.description',
    icon: '/providers/deepseek-color.svg',
    keyField: 'DEEPSEEK_API_KEY',
    keyLabel: 'settings.providers.text.deepseek.keyLabel',
    modelField: 'DEEPSEEK_MODEL',
    urlField: 'DEEPSEEK_BASE_URL',
    urlLabel: 'settings.providers.text.deepseek.urlLabel',
    urlOptional: true,
    defaultUrl: 'https://api.deepseek.com/v1',
    discovery: 'openai-compatible',
    discoveryNeeds: ['key'],
    preferredModel: 'deepseek-chat',
    getApiKeyUrl: 'https://platform.deepseek.com/api_keys',
    advancedUrl: true,
  },
  {
    value: 'google',
    label: 'Google',
    description: "settings.providers.text.google.description",
    icon: '/providers/gemini-color.svg',
    keyField: 'GOOGLE_API_KEY',
    keyLabel: 'settings.providers.text.google.keyLabel',
    modelField: 'GOOGLE_MODEL',
    discovery: 'google',
    discoveryNeeds: ['key'],
    preferredModel: 'models/gemini-2.5-flash',
    getApiKeyUrl: 'https://www.google.com/search?q=how+to+get+google+AI+studio+api+key&sxsrf=ANbL-n5_hUGaEiG9v6k9VxZWyv0mqO0Jew%3A1776339625724',
  },
  {
    value: 'vertex',
    label: 'Vertex AI',
    description: 'settings.providers.text.vertex.description',
    icon: '/providers/vertexai-color.svg',
    keyField: 'VERTEX_API_KEY',
    keyLabel: 'settings.providers.text.vertex.keyLabel',
    modelField: 'VERTEX_MODEL',
    discovery: 'manual',
    discoveryNeeds: [],
    getApiKeyUrl: 'https://www.google.com/search?q=how+to+get+vertex+ai+api+key',
    fields: 'vertex-azure',
  },
  {
    value: 'azure',
    label: 'Azure OpenAI',
    description: 'settings.providers.text.azure.description',
    icon: '/providers/azure-color.svg',
    keyField: 'AZURE_OPENAI_API_KEY',
    keyLabel: 'settings.providers.text.azure.keyLabel',
    modelField: 'AZURE_OPENAI_MODEL',
    discovery: 'manual',
    discoveryNeeds: [],
    getApiKeyUrl: 'https://www.google.com/search?q=azure+openai+api+key',
    fields: 'vertex-azure',
  },
  {
    value: 'bedrock',
    label: 'Amazon Bedrock',
    description: 'settings.providers.text.bedrock.description',
    icon: '/providers/bedrock-color.svg',
    keyField: 'BEDROCK_API_KEY',
    keyLabel: 'settings.providers.text.bedrock.keyLabel',
    keyOptional: true,
    modelField: 'BEDROCK_MODEL',
    discovery: 'manual',
    discoveryNeeds: [],
    fields: 'bedrock',
  },
  {
    value: 'openrouter',
    label: 'OpenRouter',
    description: 'settings.providers.text.openrouter.description',
    icon: '/providers/openrouter-color.svg',
    keyField: 'OPENROUTER_API_KEY',
    keyLabel: 'settings.providers.text.openrouter.keyLabel',
    modelField: 'OPENROUTER_MODEL',
    defaultUrl: 'https://openrouter.ai/api/v1',
    discovery: 'openai-compatible',
    discoveryNeeds: ['key'],
    preferredModel: 'openai/gpt-4o',
    getApiKeyUrl: 'https://openrouter.ai/keys',
  },
  {
    value: 'cerebras',
    label: 'Cerebras',
    description: 'settings.providers.text.cerebras.description',
    icon: '/providers/cerebras-color.svg',
    keyField: 'CEREBRAS_API_KEY',
    keyLabel: 'settings.providers.text.cerebras.keyLabel',
    modelField: 'CEREBRAS_MODEL',
    defaultUrl: 'https://api.cerebras.ai/v1',
    discovery: 'openai-compatible',
    discoveryNeeds: ['key'],
    preferredModel: 'llama-3.3-70b',
    getApiKeyUrl: 'https://inference-docs.cerebras.ai',
  },
  {
    value: 'litellm',
    label: 'LiteLLM',
    description: 'settings.providers.text.litellm.description',
    icon: '/providers/litellm-logo.svg',
    keyField: 'LITELLM_API_KEY',
    keyLabel: 'settings.providers.text.litellm.keyLabel',
    keyOptional: true,
    keyPlaceholder: 'settings.providers.text.litellm.keyPlaceholder',
    modelField: 'LITELLM_MODEL',
    urlField: 'LITELLM_BASE_URL',
    urlLabel: 'settings.providers.text.litellm.urlLabel',
    urlPlaceholder: 'settings.providers.text.litellm.urlPlaceholder',
    discovery: 'openai-compatible',
    discoveryNeeds: ['url'],
    preferredModel: 'gpt-4.1',
  },
  {
    value: 'fireworks',
    label: 'Fireworks',
    description: 'settings.providers.text.fireworks.description',
    icon: '/providers/fireworks-color.svg',
    keyField: 'FIREWORKS_API_KEY',
    keyLabel: 'settings.providers.text.fireworks.keyLabel',
    modelField: 'FIREWORKS_MODEL',
    urlField: 'FIREWORKS_BASE_URL',
    urlLabel: 'settings.providers.text.fireworks.urlLabel',
    urlOptional: true,
    defaultUrl: 'https://api.fireworks.ai/inference/v1',
    discovery: 'openai-compatible',
    discoveryNeeds: ['key'],
    preferredModel: 'accounts/fireworks/models/llama-v3p1-8b-instruct',
    getApiKeyUrl: 'https://fireworks.ai/account/api-keys',
  },
  {
    value: 'together',
    label: 'Together AI',
    description: 'settings.providers.text.together.description',
    icon: '/providers/together-color.svg',
    keyField: 'TOGETHER_API_KEY',
    keyLabel: 'settings.providers.text.together.keyLabel',
    modelField: 'TOGETHER_MODEL',
    urlField: 'TOGETHER_BASE_URL',
    urlLabel: 'settings.providers.text.together.urlLabel',
    urlOptional: true,
    defaultUrl: 'https://api.together.ai/v1',
    discovery: 'openai-compatible',
    discoveryNeeds: ['key'],
    preferredModel: 'openai/gpt-oss-20b',
    getApiKeyUrl: 'https://api.together.xyz/settings/api-keys',
  },
  {
    value: 'lmstudio',
    label: 'LM Studio',
    description: 'settings.providers.text.lmstudio.description',
    icon: '/providers/lm-studio.svg',
    keyField: 'LMSTUDIO_API_KEY',
    keyLabel: 'settings.providers.text.lmstudio.keyLabel',
    keyOptional: true,
    modelField: 'LMSTUDIO_MODEL',
    urlField: 'LMSTUDIO_BASE_URL',
    urlLabel: 'settings.providers.text.lmstudio.urlLabel',
    urlOptional: true,
    defaultUrl: 'http://localhost:1234/v1',
    discovery: 'openai-compatible',
    discoveryNeeds: [],
    preferredModel: 'openai/gpt-oss-20b',
  },
  {
    value: 'anthropic',
    label: 'Anthropic',
    description: "settings.providers.text.anthropic.description",
    icon: '/providers/claude-color.svg',
    keyField: 'ANTHROPIC_API_KEY',
    keyLabel: 'settings.providers.text.anthropic.keyLabel',
    modelField: 'ANTHROPIC_MODEL',
    discovery: 'anthropic',
    discoveryNeeds: ['key'],
    preferredModel: 'claude-sonnet-4-20250514',
    getApiKeyUrl: 'https://www.google.com/search?q=how+to+get+anthropic+api+key&sxsrf=ANbL-n7lsueZQ88L56HhqC1ch2PGD0rbNQ%3A1776339632265',
  },
  {
    value: 'ollama',
    label: 'Ollama',
    description: "settings.providers.text.ollama.description",
    icon: '/providers/ollama.svg',
    modelField: 'OLLAMA_MODEL',
    urlField: 'OLLAMA_URL',
    urlLabel: 'settings.providers.text.ollama.urlLabel',
    discovery: 'ollama',
    discoveryNeeds: [],
    fields: 'ollama',
  },
  {
    value: 'custom',
    label: 'Custom',
    description: 'settings.providers.text.custom.description',
    icon: '/providers/custom.svg',
    keyField: 'CUSTOM_LLM_API_KEY',
    keyLabel: 'settings.providers.text.custom.keyLabel',
    modelField: 'CUSTOM_MODEL',
    urlField: 'CUSTOM_LLM_URL',
    urlLabel: 'settings.providers.text.custom.urlLabel',
    urlPlaceholder: 'settings.providers.text.custom.urlPlaceholder',
    discovery: 'openai-compatible',
    discoveryNeeds: ['url'],
  },
]

export function textProvider(value?: string): TextProviderRow | undefined {
  return TEXT_PROVIDERS.find((row) => row.value === value)
}

/** Providers that sign in instead of taking an API key. */
export const SIGN_IN_PROVIDERS: Record<'codex' | 'presenton', { label: string; icon: string; modelField?: string }> = {
  presenton: {
    label: 'Presenton',
    icon: '/providers/presenton.png',
  },
  codex: {
    label: 'ChatGPT',
    icon: '/providers/openai.png',
    modelField: 'CODEX_MODEL',
  },
}

export const IMAGE_PROVIDERS: ImageProviderRow[] = [
  {
    value: 'pexels',
    label: 'Pexels',
    description: 'settings.providers.image.pexels.description',
    icon: '/providers/pexel.png',
    requiresApiKey: true,
    apiKeyField: 'PEXELS_API_KEY',
    apiKeyFieldLabel: 'settings.providers.image.pexels.apiKeyFieldLabel',
    getApiKeyUrl: 'https://docs.presenton.ai/help/get-api-keys/get-pexels-api-key',
  },
  {
    value: 'pixabay',
    label: 'Pixabay',
    description: 'settings.providers.image.pixabay.description',
    icon: '/providers/pixabay.png',
    requiresApiKey: true,
    apiKeyField: 'PIXABAY_API_KEY',
    apiKeyFieldLabel: 'settings.providers.image.pixabay.apiKeyFieldLabel',
    getApiKeyUrl: 'https://docs.presenton.ai/help/get-api-keys/get-pixabay-api-key',
  },
  {
    value: 'dall-e-3',
    label: 'DALL-E 3',
    description: "settings.providers.image.dall-e-3.description",
    icon: '/providers/openai.png',
    requiresApiKey: true,
    apiKeyField: 'OPENAI_API_KEY',
    apiKeyFieldLabel: 'settings.providers.image.dall-e-3.apiKeyFieldLabel',
    getApiKeyUrl: 'https://www.google.com/search?q=how+to+get+openai+api+key&ie=UTF-8',
  },
  {
    value: 'gpt-image-1.5',
    label: 'GPT Image 1.5',
    description: "settings.providers.image.gpt_image_1_5.description",
    icon: '/providers/openai.png',
    requiresApiKey: true,
    apiKeyField: 'OPENAI_API_KEY',
    apiKeyFieldLabel: 'settings.providers.image.gpt_image_1_5.apiKeyFieldLabel',
    getApiKeyUrl: 'https://www.google.com/search?q=how+to+get+openai+api+key&ie=UTF-8',
  },
  {
    value: 'gemini_flash',
    label: 'Gemini Flash',
    description: "settings.providers.image.gemini_flash.description",
    icon: '/providers/gemini-color.svg',
    requiresApiKey: true,
    apiKeyField: 'GOOGLE_API_KEY',
    apiKeyFieldLabel: 'settings.providers.image.gemini_flash.apiKeyFieldLabel',
    getApiKeyUrl: 'https://www.google.com/search?q=how+to+get+google+AI+studio+api+key&sxsrf=ANbL-n5_hUGaEiG9v6k9VxZWyv0mqO0Jew%3A1776339625724',
  },
  {
    value: 'nanobanana_pro',
    label: 'NanoBanana Pro',
    description: "settings.providers.image.nanobanana_pro.description",
    icon: '/providers/gemini-color.svg',
    requiresApiKey: true,
    apiKeyField: 'GOOGLE_API_KEY',
    apiKeyFieldLabel: 'settings.providers.image.nanobanana_pro.apiKeyFieldLabel',
    getApiKeyUrl: 'https://www.google.com/search?q=how+to+get+google+AI+studio+api+key&sxsrf=ANbL-n5_hUGaEiG9v6k9VxZWyv0mqO0Jew%3A1776339625724',
  },
  {
    value: 'comfyui',
    label: 'ComfyUI',
    description: 'settings.providers.image.comfyui.description',
    icon: '/providers/comfyui-color.svg',
    requiresApiKey: false,
    apiKeyField: 'COMFYUI_URL',
    apiKeyFieldLabel: 'settings.providers.image.comfyui.apiKeyFieldLabel',
  },
  {
    value: 'open_webui',
    label: 'Open WebUI',
    description: 'settings.providers.image.open_webui.description',
    icon: '/providers/open-webui.png',
    requiresApiKey: false,
    apiKeyField: 'OPEN_WEBUI_IMAGE_URL',
    apiKeyFieldLabel: 'settings.providers.image.open_webui.apiKeyFieldLabel',
  },
  {
    value: 'openai_compatible',
    label: 'Custom',
    description:
      'settings.providers.image.openai_compatible.description',
    icon: '/providers/custom.svg',
    requiresApiKey: false,
    apiKeyField: 'OPENAI_COMPAT_IMAGE_BASE_URL',
    apiKeyFieldLabel: 'settings.providers.image.openai_compatible.apiKeyFieldLabel',
  },
]

export const WEB_SEARCH_PROVIDERS: WebSearchProviderRow[] = [
  {
    value: 'auto',
    label: 'Default (Model)',
    description:
      'settings.providers.web.auto.description',
    icon: '/providers/model-search.svg',
  },
  {
    value: 'searxng',
    label: 'SearXNG',
    description: 'settings.providers.web.searxng.description',
    icon: '/providers/searxng.svg',
    urlField: 'SEARXNG_BASE_URL',
    urlLabel: 'settings.providers.web.searxng.urlLabel',
  },
  {
    value: 'tavily',
    label: 'Tavily',
    description: 'settings.providers.web.tavily.description',
    icon: '/providers/tavily.png',
    apiKeyField: 'TAVILY_API_KEY',
    apiKeyLabel: 'settings.providers.web.tavily.apiKeyLabel',
  },
  {
    value: 'exa',
    label: 'Exa',
    description: 'settings.providers.web.exa.description',
    icon: '/providers/exa.png',
    apiKeyField: 'EXA_API_KEY',
    apiKeyLabel: 'settings.providers.web.exa.apiKeyLabel',
  },
  {
    value: 'brave',
    label: 'Brave',
    description: 'settings.providers.web.brave.description',
    icon: '/providers/brave.svg',
    apiKeyField: 'BRAVE_SEARCH_API_KEY',
    apiKeyLabel: 'settings.providers.web.brave.apiKeyLabel',
  },
]

export const DALLE_3_QUALITY_OPTIONS = [
  {
    label: 'settings.providers.quality.brave',
    value: 'standard',
    description: 'Faster generation with lower cost',
  },
  {
    label: 'settings.providers.quality.standard',
    value: 'hd',
    description: 'Higher quality images with increased cost',
  },
]

export const GPT_IMAGE_1_5_QUALITY_OPTIONS = [
  {
    label: 'settings.providers.quality.hd',
    value: 'low',
    description: 'Fastest and most cost-effective',
  },
  {
    label: 'settings.providers.quality.low',
    value: 'medium',
    description: 'Balanced quality and speed',
  },
  {
    label: 'settings.providers.quality.medium',
    value: 'high',
    description: 'Best quality with longer generation time',
  },
]

function configString(config: ProviderConfig, field?: string): string {
  if (!field) return ''
  const value = config[field]
  return typeof value === 'string' ? value.trim() : ''
}

export function resolveDiscoveryUrl(row: TextProviderRow, config: ProviderConfig): string {
  return configString(config, row.urlField) || row.defaultUrl || ''
}

export function canDiscover(row: TextProviderRow, config: ProviderConfig): boolean {
  return row.discoveryNeeds.every((need) =>
    need === 'key' ? configString(config, row.keyField) !== '' : resolveDiscoveryUrl(row, config) !== '',
  )
}
