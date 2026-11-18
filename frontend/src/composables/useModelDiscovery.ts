import { ref, watch, type Ref } from 'vue'
import { toast } from 'vue-sonner'
import { listAnthropicModels, listGoogleModels, listOpenAiCompatibleModels } from '@/api/providerModels'
import { canDiscover, resolveDiscoveryUrl, type TextProviderRow } from '@/settings/providers'
import type { ProviderConfig } from '@/settings/types'

const FALLBACK_MESSAGE = 'The provider did not return a model list.'
const MIN_SECRET_LENGTH = 6

function configString(config: ProviderConfig, field?: string): string {
  if (!field) return ''
  const value = config[field]
  return typeof value === 'string' ? value.trim() : ''
}

/** A failure message for a toast, with the API key masked should the provider echo it back. */
function failureMessage(error: unknown, apiKey: string): string {
  let message = error instanceof Error && error.message.trim() ? error.message.trim() : FALLBACK_MESSAGE
  if (apiKey.length >= MIN_SECRET_LENGTH) message = message.split(apiKey).join('[redacted]')
  return /[.!?]$/.test(message) ? message : `${message}.`
}

function discover(row: TextProviderRow, config: ProviderConfig, apiKey: string): Promise<string[]> {
  if (row.discovery === 'google') return listGoogleModels(apiKey)
  if (row.discovery === 'anthropic') return listAnthropicModels(apiKey)
  return listOpenAiCompatibleModels({ url: resolveDiscoveryUrl(row, config), apiKey })
}

/**
 * Model discovery for the generic text provider form. Discovered models are cleared when the
 * provider, key or base URL changes, and a result that arrives after such a change is ignored.
 */
export function useModelDiscovery(opts: {
  row: Ref<TextProviderRow | undefined>
  config: Ref<ProviderConfig>
  set: (field: string, value: unknown) => void
}): { models: Ref<string[]>; checked: Ref<boolean>; loading: Ref<boolean>; check(): Promise<void> } {
  const { row, config, set } = opts
  const models = ref<string[]>([])
  const checked = ref(false)
  const loading = ref(false)
  let requestId = 0

  watch(
    // One string, so unrelated config edits (which replace the array identity) do not reset.
    () =>
      JSON.stringify([
        row.value?.value,
        configString(config.value, row.value?.keyField),
        row.value ? resolveDiscoveryUrl(row.value, config.value) : '',
      ]),
    () => {
      requestId += 1
      models.value = []
      checked.value = false
      loading.value = false
    },
  )

  async function check(): Promise<void> {
    const current = row.value
    if (!current || loading.value) return
    if (current.discovery === 'manual' || current.discovery === 'ollama') return
    if (!canDiscover(current, config.value)) return

    const id = ++requestId
    const snapshot = config.value
    const apiKey = configString(snapshot, current.keyField)
    loading.value = true
    try {
      const found = await discover(current, snapshot, apiKey)
      if (id !== requestId) return
      models.value = found
      checked.value = true
      if (found.length > 0 && !configString(config.value, current.modelField)) {
        const preferred = current.preferredModel
        set(current.modelField, preferred && found.includes(preferred) ? preferred : found[0])
      }
    } catch (error) {
      if (id !== requestId) return
      models.value = []
      checked.value = true
      toast.error('Could not load models', {
        description: `${failureMessage(error, apiKey)} You can enter a model ID manually.`,
      })
    } finally {
      if (id === requestId) loading.value = false
    }
  }

  return { models, checked, loading, check }
}
