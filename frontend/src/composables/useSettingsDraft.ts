import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { toast } from 'vue-sonner'
import { ApiError, BackendUnreachableError, extractApiErrorMessage } from '@/api/errors'
import { checkStockImageKey, listOllamaModels } from '@/api/providerModels'
import { getCodexAuthStatus, getPresentonLinkStatus, saveProviderSettings } from '@/api/providerSettings'
import { normaliseConfig } from '@/settings/normalise'
import { OAUTH_MANAGED_FIELDS, type ProviderConfig, type SettingsSection } from '@/settings/types'
import { validateConfig } from '@/settings/validate'
import { useSessionStore } from '@/stores/session'

export type SaveResult = { ok: true } | { ok: false; section?: SettingsSection }

const SAVE_FALLBACK = 'The settings could not be saved. Please try again.'
const SECRET_FIELD = /(KEY|TOKEN|SECRET|PASSWORD)/
const MIN_SECRET_LENGTH = 6

function clone(config: ProviderConfig): ProviderConfig {
  return JSON.parse(JSON.stringify(config)) as ProviderConfig
}

function stripManaged(config: ProviderConfig): ProviderConfig {
  const out = clone(config)
  for (const field of OAUTH_MANAGED_FIELDS) delete out[field]
  return out
}

/** Drops `undefined` and `''` values so "typed then deleted" compares equal to "never set". */
function comparable(config: ProviderConfig): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(config).sort()) {
    const value = config[key]
    if (value !== undefined && value !== '') out[key] = value
  }
  return out
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  return ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
}

/** Error text for a toast, with every secret in the draft masked. */
function redactSecrets(message: string, config: ProviderConfig): string {
  let out = message
  for (const [field, value] of Object.entries(config)) {
    if (!SECRET_FIELD.test(field) || typeof value !== 'string') continue
    const secret = value.trim()
    if (secret.length >= MIN_SECRET_LENGTH) out = out.split(secret).join('[redacted]')
  }
  return out
}

/**
 * Draft state, dirty tracking and the save flow for `/settings`. A failed save leaves the draft
 * untouched. Toast descriptions never include a draft secret.
 */
export function useSettingsDraft(): {
  draft: Ref<ProviderConfig>
  original: Ref<ProviderConfig>
  dirty: ComputedRef<boolean>
  saving: Ref<boolean>
  load(config: ProviderConfig): void
  set(field: string, value: unknown): void
  discard(): void
  save(): Promise<SaveResult>
} {
  const session = useSessionStore()
  const draft = ref<ProviderConfig>({})
  const original = ref<ProviderConfig>({})
  const saving = ref(false)

  const dirty = computed(() => !deepEqual(comparable(draft.value), comparable(original.value)))

  function load(config: ProviderConfig): void {
    original.value = stripManaged(config)
    draft.value = clone(original.value)
  }

  function set(field: string, value: unknown): void {
    draft.value = { ...draft.value, [field]: value }
  }

  function discard(): void {
    draft.value = clone(original.value)
  }

  async function run(config: ProviderConfig): Promise<SaveResult> {
    if (config.LLM === 'codex' && (await getCodexAuthStatus()) !== 'authenticated') {
      toast.error('Sign in to ChatGPT again', {
        description: 'Open the classic app to sign in, or switch to another provider.',
      })
      return { ok: false }
    }
    if (config.LLM === 'presenton' && !(await getPresentonLinkStatus())) {
      toast.warning('Connect Presenton first', {
        description: 'Sign in to Presenton Cloud before selecting it as the text provider.',
      })
      return { ok: false }
    }

    const normalised = normaliseConfig(config)
    const issue = validateConfig(normalised)
    if (issue) {
      toast.warning('Cannot save settings', { description: issue.message })
      return { ok: false, section: issue.section }
    }

    try {
      const provider = normalised.IMAGE_PROVIDER
      if (
        normalised.LLM !== 'presenton' &&
        !normalised.DISABLE_IMAGE_GENERATION &&
        (provider === 'pexels' || provider === 'pixabay')
      ) {
        const key = provider === 'pexels' ? normalised.PEXELS_API_KEY : normalised.PIXABAY_API_KEY
        await checkStockImageKey(provider, typeof key === 'string' ? key : '')
      }
      if (normalised.LLM === 'ollama' && normalised.OLLAMA_MODEL) {
        const model = String(normalised.OLLAMA_MODEL)
        const url = String(normalised.OLLAMA_URL ?? '')
        const models = await listOllamaModels(url)
        if (!models.some((m) => m.name === model)) {
          throw new Error(
            `The selected model "${model}" is not available at ${url}. Check models and select an available model.`,
          )
        }
      }
    } catch (e) {
      const message = e instanceof Error && e.message ? e.message : 'The provider check failed.'
      toast.error('Cannot save settings', { description: redactSecrets(message, normalised) })
      return { ok: false }
    }

    try {
      const response = await saveProviderSettings(normalised)
      load(response)
    } catch (e) {
      const body = e instanceof ApiError ? e.body : e instanceof BackendUnreachableError ? e.message : null
      const message = extractApiErrorMessage(body, SAVE_FALLBACK, e instanceof ApiError ? e.status : undefined)
      toast.error('Could not save settings', { description: redactSecrets(message, normalised) })
      return { ok: false }
    }

    try {
      await session.refreshRuntime()
    } catch {
      // The settings are saved; a failed runtime refresh keeps the previous runtime config.
    }
    toast.success('Settings saved', { description: 'Your configuration was saved successfully.' })
    return { ok: true }
  }

  async function save(): Promise<SaveResult> {
    if (saving.value) return { ok: false }
    saving.value = true
    try {
      return await run(draft.value)
    } catch {
      toast.error('Could not save settings', { description: SAVE_FALLBACK })
      return { ok: false }
    } finally {
      saving.value = false
    }
  }

  return { draft, original, dirty, saving, load, set, discard, save }
}
