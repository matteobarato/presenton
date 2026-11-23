import { config } from '@vue/test-utils'
import { i18n } from '@/i18n'

// Components call useI18n(); install the plugin (English, the default) for every mounted test component.
config.global.plugins = [...(config.global.plugins ?? []), i18n]
