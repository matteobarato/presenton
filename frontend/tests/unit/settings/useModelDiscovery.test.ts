import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, nextTick, ref } from 'vue'
import { ApiError } from '@/api/errors'
import { useModelDiscovery } from '@/composables/useModelDiscovery'
import { textProvider } from '@/settings/providers'
import type { ProviderConfig } from '@/settings/types'

const listOpenAiCompatibleModels = vi.hoisted(() => vi.fn<(p: { url: string; apiKey: string }) => Promise<string[]>>())
const listGoogleModels = vi.hoisted(() => vi.fn<(k: string) => Promise<string[]>>())
const listAnthropicModels = vi.hoisted(() => vi.fn<(k: string) => Promise<string[]>>())
const toastError = vi.hoisted(() => vi.fn())
vi.mock('@/api/providerModels', () => ({ listOpenAiCompatibleModels, listGoogleModels, listAnthropicModels }))
vi.mock('vue-sonner', () => ({ toast: { error: toastError } }))

const FAKE_KEY = 'sk-test-fake'

function setup(initial: ProviderConfig) {
  const config = ref<ProviderConfig>({ ...initial })
  const row = computed(() => textProvider(config.value.LLM))
  const set = vi.fn((field: string, value: unknown) => {
    config.value = { ...config.value, [field]: value }
  })
  return { config, set, ...useModelDiscovery({ row, config, set }) }
}

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  listOpenAiCompatibleModels.mockReset()
  listGoogleModels.mockReset()
  listAnthropicModels.mockReset()
  toastError.mockReset()
})

describe('useModelDiscovery', () => {
  it('checks OpenAI with the default URL and key, selecting the preferred model when listed', async () => {
    listOpenAiCompatibleModels.mockResolvedValue(['gpt-4o', 'gpt-4.1'])
    const d = setup({ LLM: 'openai', OPENAI_API_KEY: FAKE_KEY })
    await d.check()
    expect(listOpenAiCompatibleModels).toHaveBeenCalledWith({ url: 'https://api.openai.com/v1', apiKey: FAKE_KEY })
    expect(d.models.value).toEqual(['gpt-4o', 'gpt-4.1'])
    expect(d.checked.value).toBe(true)
    expect(d.loading.value).toBe(false)
    expect(d.set).toHaveBeenCalledWith('OPENAI_MODEL', 'gpt-4.1')
  })

  it('selects the first model when the preferred one is not listed', async () => {
    listOpenAiCompatibleModels.mockResolvedValue(['gpt-4o', 'o3'])
    const d = setup({ LLM: 'openai', OPENAI_API_KEY: FAKE_KEY })
    await d.check()
    expect(d.set).toHaveBeenCalledWith('OPENAI_MODEL', 'gpt-4o')
  })

  it('keeps an existing model', async () => {
    listOpenAiCompatibleModels.mockResolvedValue(['gpt-4o', 'gpt-4.1'])
    const d = setup({ LLM: 'openai', OPENAI_API_KEY: FAKE_KEY, OPENAI_MODEL: 'my-alias' })
    await d.check()
    expect(d.set).not.toHaveBeenCalled()
    expect(d.models.value).toEqual(['gpt-4o', 'gpt-4.1'])
  })

  it('does not select anything when no models are returned', async () => {
    listOpenAiCompatibleModels.mockResolvedValue([])
    const d = setup({ LLM: 'openai', OPENAI_API_KEY: FAKE_KEY })
    await d.check()
    expect(d.checked.value).toBe(true)
    expect(d.models.value).toEqual([])
    expect(d.set).not.toHaveBeenCalled()
  })

  it('uses the configured base URL for DeepSeek', async () => {
    listOpenAiCompatibleModels.mockResolvedValue(['deepseek-chat'])
    const d = setup({ LLM: 'deepseek', DEEPSEEK_API_KEY: FAKE_KEY, DEEPSEEK_BASE_URL: 'https://proxy.test/v1' })
    await d.check()
    expect(listOpenAiCompatibleModels).toHaveBeenCalledWith({ url: 'https://proxy.test/v1', apiKey: FAKE_KEY })
  })

  it('calls the Google and Anthropic APIs for their rows', async () => {
    listGoogleModels.mockResolvedValue(['models/gemini-2.5-flash'])
    const google = setup({ LLM: 'google', GOOGLE_API_KEY: 'g-test-fake' })
    await google.check()
    expect(listGoogleModels).toHaveBeenCalledWith('g-test-fake')
    expect(google.set).toHaveBeenCalledWith('GOOGLE_MODEL', 'models/gemini-2.5-flash')

    listAnthropicModels.mockResolvedValue(['claude-x'])
    const anthropic = setup({ LLM: 'anthropic', ANTHROPIC_API_KEY: 'sk-ant-test-fake' })
    await anthropic.check()
    expect(listAnthropicModels).toHaveBeenCalledWith('sk-ant-test-fake')
    expect(anthropic.set).toHaveBeenCalledWith('ANTHROPIC_MODEL', 'claude-x')
    expect(listOpenAiCompatibleModels).not.toHaveBeenCalled()
  })

  it('checks LM Studio without a key, on its default URL', async () => {
    listOpenAiCompatibleModels.mockResolvedValue(['openai/gpt-oss-20b'])
    const d = setup({ LLM: 'lmstudio' })
    await d.check()
    expect(listOpenAiCompatibleModels).toHaveBeenCalledWith({ url: 'http://localhost:1234/v1', apiKey: '' })
  })

  it('is a no-op when discovery is not possible, manual, or already running', async () => {
    const noKey = setup({ LLM: 'openai' })
    await noKey.check()
    expect(noKey.checked.value).toBe(false)

    const manual = setup({ LLM: 'vertex', VERTEX_API_KEY: FAKE_KEY })
    await manual.check()
    const ollama = setup({ LLM: 'ollama', OLLAMA_URL: 'http://x' })
    await ollama.check()
    const none = setup({})
    await none.check()
    expect(manual.checked.value).toBe(false)
    expect(ollama.checked.value).toBe(false)
    expect(none.checked.value).toBe(false)

    const gate = deferred<string[]>()
    listOpenAiCompatibleModels.mockReturnValue(gate.promise)
    const busy = setup({ LLM: 'openai', OPENAI_API_KEY: FAKE_KEY })
    const first = busy.check()
    expect(busy.loading.value).toBe(true)
    await busy.check()
    gate.resolve(['gpt-4.1'])
    await first
    expect(listOpenAiCompatibleModels).toHaveBeenCalledTimes(1)
    expect(listGoogleModels).not.toHaveBeenCalled()
  })

  it('toasts a failure without the key, clears models and leaves free entry available', async () => {
    listOpenAiCompatibleModels.mockRejectedValue(new ApiError(`Incorrect API key provided: ${FAKE_KEY}`, 401))
    const d = setup({ LLM: 'openai', OPENAI_API_KEY: FAKE_KEY })
    await d.check()
    expect(d.models.value).toEqual([])
    expect(d.checked.value).toBe(true)
    expect(d.loading.value).toBe(false)
    expect(toastError).toHaveBeenCalledTimes(1)
    const [title, options] = toastError.mock.calls[0] as [string, { description: string }]
    expect(title).toBe('Could not load models')
    expect(options.description).toContain('You can enter a model ID manually.')
    expect(options.description).not.toContain(FAKE_KEY)
    expect(options.description).toContain('Incorrect API key provided')
  })

  it('falls back to a generic message for non-Error failures', async () => {
    listAnthropicModels.mockRejectedValue('boom')
    const d = setup({ LLM: 'anthropic', ANTHROPIC_API_KEY: 'sk-ant-test-fake' })
    await d.check()
    const [, options] = toastError.mock.calls[0] as [string, { description: string }]
    expect(options.description).toContain('You can enter a model ID manually.')
    expect(options.description).not.toContain('boom')
  })

  describe('stale results', () => {
    async function checked() {
      listOpenAiCompatibleModels.mockResolvedValue(['gpt-4.1'])
      const d = setup({ LLM: 'openai', OPENAI_API_KEY: FAKE_KEY, DEEPSEEK_API_KEY: 'ds-test-fake' })
      await d.check()
      expect(d.models.value).toEqual(['gpt-4.1'])
      expect(d.checked.value).toBe(true)
      return d
    }

    it('are cleared when the provider changes', async () => {
      const d = await checked()
      d.config.value = { ...d.config.value, LLM: 'deepseek' }
      await nextTick()
      expect(d.models.value).toEqual([])
      expect(d.checked.value).toBe(false)
    })

    it('are cleared when the key changes', async () => {
      const d = await checked()
      d.config.value = { ...d.config.value, OPENAI_API_KEY: 'sk-test-other' }
      await nextTick()
      expect(d.models.value).toEqual([])
      expect(d.checked.value).toBe(false)
    })

    it('are cleared when the DeepSeek base URL changes', async () => {
      listOpenAiCompatibleModels.mockResolvedValue(['deepseek-chat'])
      const d = setup({ LLM: 'deepseek', DEEPSEEK_API_KEY: FAKE_KEY })
      await d.check()
      expect(d.models.value).toEqual(['deepseek-chat'])
      d.config.value = { ...d.config.value, DEEPSEEK_BASE_URL: 'https://proxy.test/v1' }
      await nextTick()
      expect(d.models.value).toEqual([])
      expect(d.checked.value).toBe(false)
    })

    it('are kept when an unrelated field changes', async () => {
      const d = await checked()
      d.config.value = { ...d.config.value, OPENAI_MODEL: 'gpt-4o' }
      await nextTick()
      expect(d.models.value).toEqual(['gpt-4.1'])
      expect(d.checked.value).toBe(true)
    })

    it('ignores a result that resolves after the key changed', async () => {
      const gate = deferred<string[]>()
      listOpenAiCompatibleModels.mockReturnValue(gate.promise)
      const d = setup({ LLM: 'openai', OPENAI_API_KEY: FAKE_KEY })
      const pending = d.check()
      d.config.value = { ...d.config.value, OPENAI_API_KEY: 'sk-test-other' }
      await nextTick()
      expect(d.loading.value).toBe(false)
      gate.resolve(['gpt-4.1'])
      await pending
      expect(d.models.value).toEqual([])
      expect(d.checked.value).toBe(false)
      expect(d.set).not.toHaveBeenCalled()
    })

    it('ignores a failure that arrives after the provider changed, without a toast', async () => {
      const gate = deferred<string[]>()
      listOpenAiCompatibleModels.mockReturnValue(gate.promise)
      const d = setup({ LLM: 'openai', OPENAI_API_KEY: FAKE_KEY })
      const pending = d.check()
      d.config.value = { ...d.config.value, LLM: 'ollama' }
      await nextTick()
      gate.reject(new Error('nope'))
      await pending
      expect(toastError).not.toHaveBeenCalled()
      expect(d.checked.value).toBe(false)
    })
  })
})
