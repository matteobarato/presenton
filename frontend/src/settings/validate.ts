// Ported from servers/nextjs/utils/storeHelpers.ts
import { isSupportedCodexModel } from './codexModels'
import { isProvided, normaliseConfig } from './normalise'
import type { ProviderConfig, SettingsSection } from './types'

export interface ConfigIssue {
  message: string
  section: Exclude<SettingsSection, 'account'>
}

const text = (message: string): ConfigIssue => ({ message, section: 'text' })
const images = (message: string): ConfigIssue => ({ message, section: 'images' })
const webSearch = (message: string): ConfigIssue => ({ message, section: 'web-search' })

function trimmed(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value
}

/** Returns the first validation issue (with the section it belongs to), or null when valid. */
export function validateConfig(input: ProviderConfig): ConfigIssue | null {
  const config = normaliseConfig(input)

  if (!config.LLM) {
    return text('Select a text provider.')
  }

  const llm = config.LLM
  if (llm === 'presenton') {
    return null
  }

  const maxOutputTokens = config.LLM_MAX_OUTPUT_TOKENS as unknown
  if (
    isProvided(maxOutputTokens) &&
    (typeof maxOutputTokens !== 'number' || !Number.isInteger(maxOutputTokens) || maxOutputTokens <= 0)
  ) {
    return text('Max output tokens must be a whole number greater than zero.')
  }

  if (!config.DISABLE_IMAGE_GENERATION && !config.IMAGE_PROVIDER) {
    return images('Select an image provider, or turn off image generation.')
  }

  if (llm === 'openai') {
    if (!isProvided(config.OPENAI_API_KEY)) {
      return text('OpenAI API key is required.')
    }
    if (!isProvided(config.OPENAI_MODEL)) {
      return text('Enter or select an OpenAI chat model ID on the Text Provider tab.')
    }
  } else if (llm === 'deepseek') {
    if (!isProvided(config.DEEPSEEK_API_KEY)) {
      return text('DeepSeek API key is required.')
    }
    if (!isProvided(config.DEEPSEEK_MODEL)) {
      return text('Enter or select a DeepSeek model ID.')
    }
  } else if (llm === 'google') {
    if (!isProvided(config.GOOGLE_API_KEY)) {
      return text('Google API key is required.')
    }
    if (!isProvided(config.GOOGLE_MODEL)) {
      return text('Enter or select a Google model ID.')
    }
  } else if (llm === 'vertex') {
    const hasApiKey = isProvided(config.VERTEX_API_KEY)
    const hasProject = isProvided(config.VERTEX_PROJECT)
    const hasLocation = isProvided(config.VERTEX_LOCATION)
    if (!hasApiKey && !hasProject) {
      return text('Vertex AI requires either a Vertex API key or a GCP project.')
    }
    if (hasApiKey && (hasProject || hasLocation)) {
      return text('Use either Vertex API key mode or project/location mode, not both.')
    }
    if (!isProvided(config.VERTEX_MODEL)) {
      return text('Vertex model is required.')
    }
  } else if (llm === 'azure') {
    if (!isProvided(config.AZURE_OPENAI_API_KEY)) {
      return text('Azure OpenAI API key is required.')
    }
    if (!isProvided(config.AZURE_OPENAI_ENDPOINT)) {
      return text('Azure endpoint is required.')
    }
    if (!isProvided(config.AZURE_OPENAI_API_VERSION)) {
      return text('Azure OpenAI API version is required.')
    }
    if (!isProvided(config.AZURE_OPENAI_MODEL)) {
      return text('Azure model name is required.')
    }
  } else if (llm === 'bedrock') {
    if (!isProvided(config.BEDROCK_MODEL)) {
      return text('Bedrock model is required.')
    }
    const hasApiKey = isProvided(config.BEDROCK_API_KEY)
    const hasAwsAccess = isProvided(config.BEDROCK_AWS_ACCESS_KEY_ID)
    const hasAwsSecret = isProvided(config.BEDROCK_AWS_SECRET_ACCESS_KEY)
    if (!hasApiKey && !(hasAwsAccess && hasAwsSecret)) {
      return text('Provide Bedrock API key, or AWS access key ID + secret key.')
    }
  } else if (llm === 'openrouter') {
    if (!isProvided(config.OPENROUTER_API_KEY)) {
      return text('OpenRouter API key is required.')
    }
    if (!isProvided(config.OPENROUTER_MODEL)) {
      return text('Select or enter an OpenRouter model id.')
    }
  } else if (llm === 'cerebras') {
    if (!isProvided(config.CEREBRAS_API_KEY)) {
      return text('Cerebras API key is required.')
    }
    if (!isProvided(config.CEREBRAS_MODEL)) {
      return text('Select or enter a Cerebras model id.')
    }
  } else if (llm === 'fireworks') {
    if (!isProvided(config.FIREWORKS_API_KEY)) {
      return text('Fireworks API key is required.')
    }
    if (!isProvided(config.FIREWORKS_MODEL)) {
      return text('Select or enter a Fireworks model id.')
    }
  } else if (llm === 'together') {
    if (!isProvided(config.TOGETHER_API_KEY)) {
      return text('Together API key is required.')
    }
    if (!isProvided(config.TOGETHER_MODEL)) {
      return text('Select or enter a Together model id.')
    }
  } else if (llm === 'anthropic') {
    if (!isProvided(config.ANTHROPIC_API_KEY)) {
      return text('Anthropic API key is required.')
    }
    if (!isProvided(config.ANTHROPIC_MODEL)) {
      return text('Enter or select an Anthropic model ID.')
    }
  } else if (llm === 'ollama') {
    if (!isProvided(trimmed(config.OLLAMA_URL))) {
      return text(
        'Ollama URL is required. Enter your Ollama server URL, or click "Check models" to fill the reachable default.',
      )
    }
    if (!isProvided(config.OLLAMA_MODEL)) {
      return text('Select an Ollama model. If none appear, confirm Ollama is running and reachable.')
    }
  } else if (llm === 'custom') {
    if (!isProvided(config.CUSTOM_LLM_URL)) {
      return text('Enter your custom LLM endpoint URL (OpenAI-compatible).')
    }
    if (!isProvided(config.CUSTOM_MODEL)) {
      return text('Enter a model ID or alias for your custom endpoint.')
    }
  } else if (llm === 'litellm') {
    if (!isProvided(config.LITELLM_BASE_URL)) {
      return text('LiteLLM base URL is required.')
    }
    if (!isProvided(config.LITELLM_MODEL)) {
      return text('Enter or select a LiteLLM model ID or alias.')
    }
  } else if (llm === 'lmstudio') {
    if (!isProvided(config.LMSTUDIO_MODEL)) {
      return text('Enter or select an LM Studio model ID.')
    }
  } else if (llm === 'codex' || llm === 'chatgpt') {
    if (!isProvided(config.CODEX_MODEL)) {
      return text('Select a Codex model.')
    }
    if (!isSupportedCodexModel(config.CODEX_MODEL)) {
      return text('Select a supported Codex model.')
    }
  } else {
    return text('Unsupported or unknown text provider.')
  }

  if (!config.DISABLE_IMAGE_GENERATION) {
    switch (config.IMAGE_PROVIDER) {
      case 'pexels':
        if (!isProvided(config.PEXELS_API_KEY)) {
          return images('Pexels API key is required.')
        }
        break
      case 'pixabay':
        if (!isProvided(config.PIXABAY_API_KEY)) {
          return images('Pixabay API key is required.')
        }
        break
      case 'dall-e-3':
        if (!isProvided(config.OPENAI_API_KEY)) {
          return images('OpenAI API key is required for DALL·E 3.')
        }
        break
      case 'gpt-image-1.5':
        if (!isProvided(config.OPENAI_API_KEY)) {
          return images('OpenAI API key is required for GPT Image 1.5.')
        }
        break
      case 'gemini_flash':
        if (!isProvided(config.GOOGLE_API_KEY)) {
          return images('Google API key is required for Gemini Flash image generation.')
        }
        break
      case 'nanobanana_pro':
        if (!isProvided(config.GOOGLE_API_KEY)) {
          return images('Google API key is required for NanoBanana Pro.')
        }
        break
      case 'comfyui':
        if (!isProvided(config.COMFYUI_URL)) {
          return images('ComfyUI server URL is required.')
        }
        break
      case 'open_webui':
        if (!isProvided(config.OPEN_WEBUI_IMAGE_URL)) {
          return images('Open WebUI URL is required.')
        }
        break
      case 'openai_compatible':
        if (
          !isProvided(trimmed(config.OPENAI_COMPAT_IMAGE_BASE_URL)) ||
          !isProvided(trimmed(config.OPENAI_COMPAT_IMAGE_API_KEY)) ||
          !isProvided(trimmed(config.OPENAI_COMPAT_IMAGE_MODEL))
        ) {
          return images('OpenAI-compatible image API requires base URL, API key, and model.')
        }
        break
      default:
        return images('Select a valid image provider.')
    }
  }

  if (config.WEB_GROUNDING) {
    if (!isProvided(config.WEB_SEARCH_PROVIDER)) {
      return webSearch('Select a web search provider, or turn off web search.')
    }
    switch (config.WEB_SEARCH_PROVIDER) {
      case 'searxng':
        if (!isProvided(config.SEARXNG_BASE_URL)) {
          return webSearch('SearXNG base URL is required.')
        }
        break
      case 'tavily':
        if (!isProvided(config.TAVILY_API_KEY)) {
          return webSearch('Tavily API key is required.')
        }
        break
      case 'exa':
        if (!isProvided(config.EXA_API_KEY)) {
          return webSearch('Exa API key is required.')
        }
        break
      case 'brave':
        if (!isProvided(config.BRAVE_SEARCH_API_KEY)) {
          return webSearch('Brave Search API key is required.')
        }
        break
      case 'auto':
        break
      default:
        return webSearch('Select a valid web search provider.')
    }
  }

  return null
}
