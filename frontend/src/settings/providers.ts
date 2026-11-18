// Ported from servers/nextjs/utils/providerConstants.ts @ aa7c7ae8
import type { ProviderConfig } from './types'

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
export const CLASSIC_SETTINGS_URL = `${__PRESENTON_BACKEND_URL__}/settings`

export const TEXT_PROVIDERS: TextProviderRow[] = [
  {
    value: 'openai',
    label: 'OpenAI',
    description: "OpenAI's latest text generation model",
    icon: '/providers/openai.png',
    keyField: 'OPENAI_API_KEY',
    keyLabel: 'OpenAI API key',
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
    description: 'DeepSeek models via DeepSeek API',
    icon: '/providers/deepseek-color.svg',
    keyField: 'DEEPSEEK_API_KEY',
    keyLabel: 'DeepSeek API key',
    modelField: 'DEEPSEEK_MODEL',
    urlField: 'DEEPSEEK_BASE_URL',
    urlLabel: 'DeepSeek base URL',
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
    description: "Google's primary text generation model",
    icon: '/providers/gemini-color.svg',
    keyField: 'GOOGLE_API_KEY',
    keyLabel: 'Google API key',
    modelField: 'GOOGLE_MODEL',
    discovery: 'google',
    discoveryNeeds: ['key'],
    preferredModel: 'models/gemini-2.5-flash',
    getApiKeyUrl: 'https://www.google.com/search?q=how+to+get+google+AI+studio+api+key&sxsrf=ANbL-n5_hUGaEiG9v6k9VxZWyv0mqO0Jew%3A1776339625724',
  },
  {
    value: 'vertex',
    label: 'Vertex AI',
    description: 'Google Vertex AI models',
    icon: '/providers/vertexai-color.svg',
    keyField: 'VERTEX_API_KEY',
    keyLabel: 'Vertex AI API key',
    modelField: 'VERTEX_MODEL',
    discovery: 'manual',
    discoveryNeeds: [],
    getApiKeyUrl: 'https://www.google.com/search?q=how+to+get+vertex+ai+api+key',
    fields: 'vertex-azure',
  },
  {
    value: 'azure',
    label: 'Azure OpenAI',
    description: 'Azure-hosted OpenAI deployments',
    icon: '/providers/azure-color.svg',
    keyField: 'AZURE_OPENAI_API_KEY',
    keyLabel: 'Azure OpenAI API key',
    modelField: 'AZURE_OPENAI_MODEL',
    discovery: 'manual',
    discoveryNeeds: [],
    getApiKeyUrl: 'https://www.google.com/search?q=azure+openai+api+key',
    fields: 'vertex-azure',
  },
  {
    value: 'bedrock',
    label: 'Amazon Bedrock',
    description: 'AWS Bedrock foundation models',
    icon: '/providers/bedrock-color.svg',
    keyField: 'BEDROCK_API_KEY',
    keyLabel: 'Bedrock API key (optional)',
    keyOptional: true,
    modelField: 'BEDROCK_MODEL',
    discovery: 'manual',
    discoveryNeeds: [],
    fields: 'bedrock',
  },
  {
    value: 'openrouter',
    label: 'OpenRouter',
    description: 'Many models through OpenRouter’s OpenAI-compatible API',
    icon: '/providers/openrouter-color.svg',
    keyField: 'OPENROUTER_API_KEY',
    keyLabel: 'OpenRouter API key',
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
    description: 'Cerebras Cloud via OpenAI-compatible API',
    icon: '/providers/cerebras-color.svg',
    keyField: 'CEREBRAS_API_KEY',
    keyLabel: 'Cerebras API key',
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
    description: 'OpenAI-compatible LiteLLM proxy or gateway',
    icon: '/providers/litellm-logo.svg',
    keyField: 'LITELLM_API_KEY',
    keyLabel: 'LiteLLM API key (optional)',
    keyOptional: true,
    keyPlaceholder: 'Optional if your proxy does not require auth',
    modelField: 'LITELLM_MODEL',
    urlField: 'LITELLM_BASE_URL',
    urlLabel: 'LiteLLM base URL',
    urlPlaceholder: 'e.g. http://host.docker.internal:4000/v1',
    discovery: 'openai-compatible',
    discoveryNeeds: ['url'],
    preferredModel: 'gpt-4.1',
  },
  {
    value: 'fireworks',
    label: 'Fireworks',
    description: 'Fireworks AI via OpenAI-compatible API',
    icon: '/providers/fireworks-color.svg',
    keyField: 'FIREWORKS_API_KEY',
    keyLabel: 'Fireworks API key',
    modelField: 'FIREWORKS_MODEL',
    urlField: 'FIREWORKS_BASE_URL',
    urlLabel: 'Fireworks base URL',
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
    description: 'Together AI via OpenAI-compatible API',
    icon: '/providers/together-color.svg',
    keyField: 'TOGETHER_API_KEY',
    keyLabel: 'Together AI API key',
    modelField: 'TOGETHER_MODEL',
    urlField: 'TOGETHER_BASE_URL',
    urlLabel: 'Together AI base URL',
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
    description: 'Local LM Studio OpenAI-compatible server',
    icon: '/providers/lm-studio.svg',
    keyField: 'LMSTUDIO_API_KEY',
    keyLabel: 'LM Studio API key (optional)',
    keyOptional: true,
    modelField: 'LMSTUDIO_MODEL',
    urlField: 'LMSTUDIO_BASE_URL',
    urlLabel: 'LM Studio base URL',
    urlOptional: true,
    defaultUrl: 'http://localhost:1234/v1',
    discovery: 'openai-compatible',
    discoveryNeeds: [],
    preferredModel: 'openai/gpt-oss-20b',
  },
  {
    value: 'anthropic',
    label: 'Anthropic',
    description: "Anthropic's Claude models",
    icon: '/providers/claude-color.svg',
    keyField: 'ANTHROPIC_API_KEY',
    keyLabel: 'Anthropic API key',
    modelField: 'ANTHROPIC_MODEL',
    discovery: 'anthropic',
    discoveryNeeds: ['key'],
    preferredModel: 'claude-sonnet-4-20250514',
    getApiKeyUrl: 'https://www.google.com/search?q=how+to+get+anthropic+api+key&sxsrf=ANbL-n7lsueZQ88L56HhqC1ch2PGD0rbNQ%3A1776339632265',
  },
  {
    value: 'ollama',
    label: 'Ollama',
    description: "Ollama's primary text generation model",
    icon: '/providers/ollama.svg',
    modelField: 'OLLAMA_MODEL',
    urlField: 'OLLAMA_URL',
    urlLabel: 'Ollama URL',
    discovery: 'ollama',
    discoveryNeeds: [],
    fields: 'ollama',
  },
  {
    value: 'custom',
    label: 'Custom',
    description: 'OpenAI-compatible LLM',
    icon: '/providers/custom.svg',
    keyField: 'CUSTOM_LLM_API_KEY',
    keyLabel: 'Custom LLM API key',
    modelField: 'CUSTOM_MODEL',
    urlField: 'CUSTOM_LLM_URL',
    urlLabel: 'Custom LLM URL',
    urlPlaceholder: 'OpenAI-compatible URL',
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
    description: 'Free stock photo and video platform',
    icon: '/providers/pexel.png',
    requiresApiKey: true,
    apiKeyField: 'PEXELS_API_KEY',
    apiKeyFieldLabel: 'Pexels API Key',
    getApiKeyUrl: 'https://docs.presenton.ai/help/get-api-keys/get-pexels-api-key',
  },
  {
    value: 'pixabay',
    label: 'Pixabay',
    description: 'Free images and videos',
    icon: '/providers/pixabay.png',
    requiresApiKey: true,
    apiKeyField: 'PIXABAY_API_KEY',
    apiKeyFieldLabel: 'Pixabay API Key',
    getApiKeyUrl: 'https://docs.presenton.ai/help/get-api-keys/get-pixabay-api-key',
  },
  {
    value: 'dall-e-3',
    label: 'DALL-E 3',
    description: "OpenAI's image generation model",
    icon: '/providers/openai.png',
    requiresApiKey: true,
    apiKeyField: 'OPENAI_API_KEY',
    apiKeyFieldLabel: 'OpenAI API Key',
    getApiKeyUrl: 'https://www.google.com/search?q=how+to+get+openai+api+key&ie=UTF-8',
  },
  {
    value: 'gpt-image-1.5',
    label: 'GPT Image 1.5',
    description: "OpenAI's image generation model",
    icon: '/providers/openai.png',
    requiresApiKey: true,
    apiKeyField: 'OPENAI_API_KEY',
    apiKeyFieldLabel: 'OpenAI API Key',
    getApiKeyUrl: 'https://www.google.com/search?q=how+to+get+openai+api+key&ie=UTF-8',
  },
  {
    value: 'gemini_flash',
    label: 'Gemini Flash',
    description: "Google's fast image generation model",
    icon: '/providers/gemini-color.svg',
    requiresApiKey: true,
    apiKeyField: 'GOOGLE_API_KEY',
    apiKeyFieldLabel: 'Google API Key',
    getApiKeyUrl: 'https://www.google.com/search?q=how+to+get+google+AI+studio+api+key&sxsrf=ANbL-n5_hUGaEiG9v6k9VxZWyv0mqO0Jew%3A1776339625724',
  },
  {
    value: 'nanobanana_pro',
    label: 'NanoBanana Pro',
    description: "Google's advanced image generation model",
    icon: '/providers/gemini-color.svg',
    requiresApiKey: true,
    apiKeyField: 'GOOGLE_API_KEY',
    apiKeyFieldLabel: 'Google API Key',
    getApiKeyUrl: 'https://www.google.com/search?q=how+to+get+google+AI+studio+api+key&sxsrf=ANbL-n5_hUGaEiG9v6k9VxZWyv0mqO0Jew%3A1776339625724',
  },
  {
    value: 'comfyui',
    label: 'ComfyUI',
    description: 'Use your local ComfyUI server with custom workflows',
    icon: '/providers/comfyui-color.svg',
    requiresApiKey: false,
    apiKeyField: 'COMFYUI_URL',
    apiKeyFieldLabel: 'ComfyUI Server URL',
  },
  {
    value: 'open_webui',
    label: 'Open WebUI',
    description: 'Use your Open WebUI server for image generation',
    icon: '/providers/open-webui.png',
    requiresApiKey: false,
    apiKeyField: 'OPEN_WEBUI_IMAGE_URL',
    apiKeyFieldLabel: 'Open WebUI URL',
  },
  {
    value: 'openai_compatible',
    label: 'Custom',
    description:
      'OpenAI-compatible /v1/images endpoint (LiteLLM, Azure, vLLM, etc.)',
    icon: '/providers/custom.svg',
    requiresApiKey: false,
    apiKeyField: 'OPENAI_COMPAT_IMAGE_BASE_URL',
    apiKeyFieldLabel: 'OpenAI-compatible base URL',
  },
]

export const WEB_SEARCH_PROVIDERS: WebSearchProviderRow[] = [
  {
    value: 'auto',
    label: 'Default (Model)',
    description:
      'Use model-native web grounding when available. Otherwise web search stays off until you choose an external provider.',
    icon: '/providers/model-search.svg',
  },
  {
    value: 'searxng',
    label: 'SearXNG',
    description: 'Use a self-hosted SearXNG instance.',
    icon: '/providers/searxng.svg',
    urlField: 'SEARXNG_BASE_URL',
    urlLabel: 'SearXNG base URL',
  },
  {
    value: 'tavily',
    label: 'Tavily',
    description: 'Search API optimized for AI applications.',
    icon: '/providers/tavily.png',
    apiKeyField: 'TAVILY_API_KEY',
    apiKeyLabel: 'Tavily API key',
  },
  {
    value: 'exa',
    label: 'Exa',
    description: 'AI-native web search with extracted result highlights.',
    icon: '/providers/exa.png',
    apiKeyField: 'EXA_API_KEY',
    apiKeyLabel: 'Exa API key',
  },
  {
    value: 'brave',
    label: 'Brave',
    description: 'Brave Search API for web search results.',
    icon: '/providers/brave.svg',
    apiKeyField: 'BRAVE_SEARCH_API_KEY',
    apiKeyLabel: 'Brave Search API key',
  },
]

export const DALLE_3_QUALITY_OPTIONS = [
  {
    label: 'Standard',
    value: 'standard',
    description: 'Faster generation with lower cost',
  },
  {
    label: 'HD',
    value: 'hd',
    description: 'Higher quality images with increased cost',
  },
]

export const GPT_IMAGE_1_5_QUALITY_OPTIONS = [
  {
    label: 'Low',
    value: 'low',
    description: 'Fastest and most cost-effective',
  },
  {
    label: 'Medium',
    value: 'medium',
    description: 'Balanced quality and speed',
  },
  {
    label: 'High',
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
