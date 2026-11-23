// Ported from servers/nextjs SettingPage.tsx (textSummary / imageSummary / webSearchSummary)
import { i18n } from '@/i18n'
import {
  IMAGE_PROVIDERS,
  SIGN_IN_PROVIDERS,
  WEB_SEARCH_PROVIDERS,
  textProvider,
  webSearchLabel,
} from './providers'
import type { ProviderConfig, SettingsSection } from './types'

const SECRET_PATTERN = /(_API_KEY|_SECRET|_TOKEN|PASSWORD)/

/** True for config names that hold credentials; read-only summaries must never show these. */
export function isSecretKey(name: string): boolean {
  return SECRET_PATTERN.test(name)
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function signInProvider(key: string) {
  return key === 'codex' || key === 'presenton' ? SIGN_IN_PROVIDERS[key] : undefined
}

export function textSummary(config: ProviderConfig): string {
  const key = str(config.LLM)
  const label = textProvider(key)?.label ?? signInProvider(key)?.label ?? (key || i18n.global.t('settings.summary.noText'))
  const modelField = textProvider(key)?.modelField ?? signInProvider(key)?.modelField
  const model = modelField ? str(config[modelField]) : ''
  return model ? i18n.global.t('settings.summary.textWithModel', { label, model }) : label
}

export function imageSummary(config: ProviderConfig): string {
  if (str(config.LLM) === 'presenton') return i18n.global.t('settings.summary.cloudImages')
  if (config.DISABLE_IMAGE_GENERATION) return i18n.global.t('settings.summary.imageDisabled')
  const provider = str(config.IMAGE_PROVIDER)
  if (provider) return IMAGE_PROVIDERS.find((row) => row.value === provider)?.label ?? provider
  return i18n.global.t('settings.summary.noImage')
}

export function webSearchSummary(config: ProviderConfig): string {
  if (str(config.LLM) === 'presenton') return i18n.global.t('settings.summary.cloudWebSearch')
  if (config.WEB_GROUNDING) {
    const key = str(config.WEB_SEARCH_PROVIDER).toLowerCase()
    const row = WEB_SEARCH_PROVIDERS.find((candidate) => candidate.value === key)
    const name = row ? webSearchLabel(row) : i18n.global.t('settings.summary.noWebProvider')
    return i18n.global.t('settings.summary.webProvider', { name })
  }
  return i18n.global.t('settings.summary.webDisabled')
}

export function sectionSubtitle(section: SettingsSection, config: ProviderConfig): string {
  switch (section) {
    case 'text':
      return textSummary(config)
    case 'images':
      return imageSummary(config)
    case 'web-search':
      return webSearchSummary(config)
    default:
      return ''
  }
}
