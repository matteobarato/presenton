import { computed } from 'vue'
import { i18n, setUiLocale, type UiLocale } from './index'

export function useUiLocale() {
  const locale = computed<UiLocale>(() => i18n.global.locale.value as UiLocale)
  return { locale, setLocale: setUiLocale }
}
