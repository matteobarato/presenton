import { ref, type Ref } from 'vue'
import { getProviderSettings } from '@/api/providerSettings'
import { ApiError, BackendUnreachableError, extractApiErrorMessage } from '@/api/errors'
import type { ProviderConfig } from '@/settings/types'
import { i18n } from '@/i18n'
import { useSessionStore } from '@/stores/session'

export type AccessMode = 'loading' | 'edit' | 'locked' | 'managed' | 'error'

/**
 * Who may do what on `/settings`. Only admins are sent to the admin endpoint; everyone else
 * is `managed` without a request. The error message comes only from `extractApiErrorMessage`.
 */
export function useSettingsAccess(): {
  mode: Ref<AccessMode>
  config: Ref<ProviderConfig | null>
  error: Ref<string>
  reload(): Promise<void>
} {
  const session = useSessionStore()
  const mode = ref<AccessMode>('loading')
  const config = ref<ProviderConfig | null>(null)
  const error = ref('')
  let latest = 0

  async function reload(): Promise<void> {
    const run = ++latest

    if (session.user?.role !== 'admin') {
      config.value = null
      error.value = ''
      mode.value = 'managed'
      return
    }

    mode.value = 'loading'
    try {
      const result = await getProviderSettings()
      if (run !== latest) return
      config.value = result
      error.value = ''
      mode.value = 'edit'
    } catch (e) {
      if (run !== latest) return
      config.value = null
      if (e instanceof ApiError && e.status === 403) {
        error.value = ''
        mode.value = 'locked'
        return
      }
      const body = e instanceof ApiError ? e.body : e instanceof BackendUnreachableError ? e.message : null
      error.value = extractApiErrorMessage(body, i18n.global.t('settings.access.loadFailed'), e instanceof ApiError ? e.status : undefined)
      mode.value = 'error'
    }
  }

  void reload()

  return { mode, config, error, reload }
}
