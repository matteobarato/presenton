// Ported from servers/nextjs/utils/storeHelpers.ts
import { i18n } from '@/i18n'
import { isSupportedCodexModel } from './codexModels'
import { isProvided, normaliseConfig } from './normalise'
import type { ProviderConfig, SettingsSection } from './types'

export interface ConfigIssue {
  message: string
  section: Exclude<SettingsSection, 'account'>
}

// Messages are looked up when the issue is built, so they follow the current UI locale.
const text = (key: string): ConfigIssue => ({ message: i18n.global.t(key), section: 'text' })
const images = (key: string): ConfigIssue => ({ message: i18n.global.t(key), section: 'images' })
const webSearch = (key: string): ConfigIssue => ({ message: i18n.global.t(key), section: 'web-search' })

function trimmed(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value
}

/** Returns the first validation issue (with the section it belongs to), or null when valid. */
export function validateConfig(input: ProviderConfig): ConfigIssue | null {
  const config = normaliseConfig(input)

  if (!config.LLM) {
    return text('settings.validate.noProvider')
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
    return text('settings.validate.maxOutputTokens')
  }

  if (!config.DISABLE_IMAGE_GENERATION && !config.IMAGE_PROVIDER) {
    return images('settings.validate.noImageProvider')
  }

  if (llm === 'openai') {
    if (!isProvided(config.OPENAI_API_KEY)) {
      return text('settings.validate.openaiKey')
    }
    if (!isProvided(config.OPENAI_MODEL)) {
      return text('settings.validate.openaiModel')
    }
  } else if (llm === 'deepseek') {
    if (!isProvided(config.DEEPSEEK_API_KEY)) {
      return text('settings.validate.deepseekKey')
    }
    if (!isProvided(config.DEEPSEEK_MODEL)) {
      return text('settings.validate.deepseekModel')
    }
  } else if (llm === 'google') {
    if (!isProvided(config.GOOGLE_API_KEY)) {
      return text('settings.validate.googleKey')
    }
    if (!isProvided(config.GOOGLE_MODEL)) {
      return text('settings.validate.googleModel')
    }
  } else if (llm === 'vertex') {
    const hasApiKey = isProvided(config.VERTEX_API_KEY)
    const hasProject = isProvided(config.VERTEX_PROJECT)
    const hasLocation = isProvided(config.VERTEX_LOCATION)
    if (!hasApiKey && !hasProject) {
      return text('settings.validate.vertexRequiresAuth')
    }
    if (hasApiKey && (hasProject || hasLocation)) {
      return text('settings.validate.vertexOneMode')
    }
    if (!isProvided(config.VERTEX_MODEL)) {
      return text('settings.validate.vertexModel')
    }
  } else if (llm === 'azure') {
    if (!isProvided(config.AZURE_OPENAI_API_KEY)) {
      return text('settings.validate.azureKey')
    }
    if (!isProvided(config.AZURE_OPENAI_ENDPOINT)) {
      return text('settings.validate.azureEndpoint')
    }
    if (!isProvided(config.AZURE_OPENAI_API_VERSION)) {
      return text('settings.validate.azureApiVersion')
    }
    if (!isProvided(config.AZURE_OPENAI_MODEL)) {
      return text('settings.validate.azureModel')
    }
  } else if (llm === 'bedrock') {
    if (!isProvided(config.BEDROCK_MODEL)) {
      return text('settings.validate.bedrockModel')
    }
    const hasApiKey = isProvided(config.BEDROCK_API_KEY)
    const hasAwsAccess = isProvided(config.BEDROCK_AWS_ACCESS_KEY_ID)
    const hasAwsSecret = isProvided(config.BEDROCK_AWS_SECRET_ACCESS_KEY)
    if (!hasApiKey && !(hasAwsAccess && hasAwsSecret)) {
      return text('settings.validate.bedrockAuth')
    }
  } else if (llm === 'openrouter') {
    if (!isProvided(config.OPENROUTER_API_KEY)) {
      return text('settings.validate.openrouterKey')
    }
    if (!isProvided(config.OPENROUTER_MODEL)) {
      return text('settings.validate.openrouterModel')
    }
  } else if (llm === 'cerebras') {
    if (!isProvided(config.CEREBRAS_API_KEY)) {
      return text('settings.validate.cerebrasKey')
    }
    if (!isProvided(config.CEREBRAS_MODEL)) {
      return text('settings.validate.cerebrasModel')
    }
  } else if (llm === 'fireworks') {
    if (!isProvided(config.FIREWORKS_API_KEY)) {
      return text('settings.validate.fireworksKey')
    }
    if (!isProvided(config.FIREWORKS_MODEL)) {
      return text('settings.validate.fireworksModel')
    }
  } else if (llm === 'together') {
    if (!isProvided(config.TOGETHER_API_KEY)) {
      return text('settings.validate.togetherKey')
    }
    if (!isProvided(config.TOGETHER_MODEL)) {
      return text('settings.validate.togetherModel')
    }
  } else if (llm === 'anthropic') {
    if (!isProvided(config.ANTHROPIC_API_KEY)) {
      return text('settings.validate.anthropicKey')
    }
    if (!isProvided(config.ANTHROPIC_MODEL)) {
      return text('settings.validate.anthropicModel')
    }
  } else if (llm === 'ollama') {
    if (!isProvided(trimmed(config.OLLAMA_URL))) {
      return text(
        'settings.validate.ollamaUrl',
      )
    }
    if (!isProvided(config.OLLAMA_MODEL)) {
      return text('settings.validate.ollamaModel')
    }
  } else if (llm === 'custom') {
    if (!isProvided(config.CUSTOM_LLM_URL)) {
      return text('settings.validate.customUrl')
    }
    if (!isProvided(config.CUSTOM_MODEL)) {
      return text('settings.validate.customModel')
    }
  } else if (llm === 'litellm') {
    if (!isProvided(config.LITELLM_BASE_URL)) {
      return text('settings.validate.litellmUrl')
    }
    if (!isProvided(config.LITELLM_MODEL)) {
      return text('settings.validate.litellmModel')
    }
  } else if (llm === 'lmstudio') {
    if (!isProvided(config.LMSTUDIO_MODEL)) {
      return text('settings.validate.lmstudioModel')
    }
  } else if (llm === 'codex' || llm === 'chatgpt') {
    if (!isProvided(config.CODEX_MODEL)) {
      return text('settings.validate.codexModel')
    }
    if (!isSupportedCodexModel(config.CODEX_MODEL)) {
      return text('settings.validate.codexSupported')
    }
  } else {
    return text('settings.validate.unsupported')
  }

  if (!config.DISABLE_IMAGE_GENERATION) {
    switch (config.IMAGE_PROVIDER) {
      case 'pexels':
        if (!isProvided(config.PEXELS_API_KEY)) {
          return images('settings.validate.pexelsKey')
        }
        break
      case 'pixabay':
        if (!isProvided(config.PIXABAY_API_KEY)) {
          return images('settings.validate.pixabayKey')
        }
        break
      case 'dall-e-3':
        if (!isProvided(config.OPENAI_API_KEY)) {
          return images('settings.validate.dalleKey')
        }
        break
      case 'gpt-image-1.5':
        if (!isProvided(config.OPENAI_API_KEY)) {
          return images('settings.validate.gptImageKey')
        }
        break
      case 'gemini_flash':
        if (!isProvided(config.GOOGLE_API_KEY)) {
          return images('settings.validate.geminiKey')
        }
        break
      case 'nanobanana_pro':
        if (!isProvided(config.GOOGLE_API_KEY)) {
          return images('settings.validate.nanobananaKey')
        }
        break
      case 'comfyui':
        if (!isProvided(config.COMFYUI_URL)) {
          return images('settings.validate.comfyuiUrl')
        }
        break
      case 'open_webui':
        if (!isProvided(config.OPEN_WEBUI_IMAGE_URL)) {
          return images('settings.validate.openWebuiUrl')
        }
        break
      case 'openai_compatible':
        if (
          !isProvided(trimmed(config.OPENAI_COMPAT_IMAGE_BASE_URL)) ||
          !isProvided(trimmed(config.OPENAI_COMPAT_IMAGE_API_KEY)) ||
          !isProvided(trimmed(config.OPENAI_COMPAT_IMAGE_MODEL))
        ) {
          return images('settings.validate.compatibleImage')
        }
        break
      default:
        return images('settings.validate.invalidImage')
    }
  }

  if (config.WEB_GROUNDING) {
    if (!isProvided(config.WEB_SEARCH_PROVIDER)) {
      return webSearch('settings.validate.noWebSearch')
    }
    switch (config.WEB_SEARCH_PROVIDER) {
      case 'searxng':
        if (!isProvided(config.SEARXNG_BASE_URL)) {
          return webSearch('settings.validate.searxngUrl')
        }
        break
      case 'tavily':
        if (!isProvided(config.TAVILY_API_KEY)) {
          return webSearch('settings.validate.tavilyKey')
        }
        break
      case 'exa':
        if (!isProvided(config.EXA_API_KEY)) {
          return webSearch('settings.validate.exaKey')
        }
        break
      case 'brave':
        if (!isProvided(config.BRAVE_SEARCH_API_KEY)) {
          return webSearch('settings.validate.braveKey')
        }
        break
      case 'auto':
        break
      default:
        return webSearch('settings.validate.invalidWebSearch')
    }
  }

  return null
}
