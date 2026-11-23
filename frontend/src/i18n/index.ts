import { createI18n, type LocaleMessages, type VueMessageType } from 'vue-i18n'

export type UiLocale = 'en' | 'it'
export const UI_LOCALES: readonly UiLocale[] = ['en', 'it']
const STORAGE_KEY = 'ui-locale'

type Messages = LocaleMessages<VueMessageType>

/** Each file `locales/<lang>/<area>.json` becomes the namespace `<area>` (e.g. `create.wizard.title`). */
function load(lang: UiLocale): Messages {
  const files =
    lang === 'en'
      ? import.meta.glob('./locales/en/*.json', { eager: true, import: 'default' })
      : import.meta.glob('./locales/it/*.json', { eager: true, import: 'default' })
  const out: Messages = {}
  for (const [path, mod] of Object.entries(files)) {
    const area = path.split('/').pop()!.replace(/\.json$/, '')
    out[area] = mod as Messages[string]
  }
  return out
}

export function detectLocale(): UiLocale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'en' || stored === 'it') return stored
  } catch {
    /* storage unavailable */
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language : 'en'
  return nav.toLowerCase().startsWith('it') ? 'it' : 'en'
}

export const i18n = createI18n({
  legacy: false,
  locale: detectLocale(),
  fallbackLocale: 'en',
  messages: { en: load('en'), it: load('it') },
})

export function setUiLocale(lang: UiLocale): void {
  i18n.global.locale.value = lang
  document.documentElement.lang = lang
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    /* storage unavailable */
  }
}
