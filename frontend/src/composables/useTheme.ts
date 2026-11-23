import { computed, ref, watch } from 'vue'

export type ThemePreference = 'dark' | 'light' | 'system'
export type ResolvedTheme = 'dark' | 'light'

const STORAGE_KEY = 'theme'
const QUERY = '(prefers-color-scheme: dark)'

function isPreference(v: unknown): v is ThemePreference {
  return v === 'dark' || v === 'light' || v === 'system'
}

function readStored(): ThemePreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return isPreference(v) ? v : 'system'
  } catch {
    return 'system'
  }
}

const preference = ref<ThemePreference>('system')
const osDark = ref(true)
const resolved = computed<ResolvedTheme>(() =>
  preference.value === 'system' ? (osDark.value ? 'dark' : 'light') : preference.value,
)

/** Writes the resolved theme onto <html>: class for tokens, color-scheme for native widgets. */
export function applyTheme(theme: ResolvedTheme): void {
  const el = document.documentElement
  el.classList.toggle('dark', theme === 'dark')
  el.classList.toggle('light', theme === 'light')
  el.style.colorScheme = theme
}

let started = false
export function initTheme(): void {
  preference.value = readStored()
  const mql = typeof window.matchMedia === 'function' ? window.matchMedia(QUERY) : null
  osDark.value = mql ? mql.matches : true
  mql?.addEventListener?.('change', (e) => { osDark.value = e.matches })
  if (!started) {
    started = true
    watch(resolved, applyTheme)
  }
  applyTheme(resolved.value)
}

function setPreference(p: ThemePreference): void {
  preference.value = p
  try {
    localStorage.setItem(STORAGE_KEY, p)
  } catch {
    /* storage blocked: preference lasts for this session only */
  }
  applyTheme(resolved.value)
}

export function useTheme() {
  return { preference, resolved, setPreference }
}
