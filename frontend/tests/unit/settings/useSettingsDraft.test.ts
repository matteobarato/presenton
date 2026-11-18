import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ApiError, BackendUnreachableError } from '@/api/errors'
import type { ProviderConfig } from '@/settings/types'
import { useSessionStore } from '@/stores/session'
import { useSettingsDraft } from '@/composables/useSettingsDraft'

const saveProviderSettings = vi.hoisted(() => vi.fn<(c: ProviderConfig) => Promise<ProviderConfig>>())
const getCodexAuthStatus = vi.hoisted(() => vi.fn<() => Promise<string>>())
const getPresentonLinkStatus = vi.hoisted(() => vi.fn<() => Promise<boolean>>())
const checkStockImageKey = vi.hoisted(() => vi.fn<(p: string, k: string) => Promise<void>>())
const listOllamaModels = vi.hoisted(() => vi.fn<(u: string) => Promise<{ name: string }[]>>())
const toast = vi.hoisted(() => ({ error: vi.fn(), warning: vi.fn(), success: vi.fn() }))

vi.mock('@/api/providerSettings', () => ({ saveProviderSettings, getCodexAuthStatus, getPresentonLinkStatus }))
vi.mock('@/api/providerModels', () => ({ checkStockImageKey, listOllamaModels }))
vi.mock('vue-sonner', () => ({ toast }))

const KEY = 'sk-test-fake'
const base = (): ProviderConfig => ({
  LLM: 'openai',
  OPENAI_API_KEY: KEY,
  OPENAI_MODEL: 'gpt-4o',
  IMAGE_PROVIDER: 'dall-e-3',
  DISABLE_IMAGE_GENERATION: 'false' as unknown as boolean,
  CODEX_ACCESS_TOKEN: 'tok',
  PRESENTON_EMAIL: 'a@b.c',
})

function toastText(): string {
  return JSON.stringify([toast.error.mock.calls, toast.warning.mock.calls, toast.success.mock.calls])
}

let refreshRuntime: ReturnType<typeof vi.fn>

function setup(config: ProviderConfig = base()) {
  const d = useSettingsDraft()
  d.load(config)
  return d
}

describe('useSettingsDraft', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    for (const m of [saveProviderSettings, getCodexAuthStatus, getPresentonLinkStatus, checkStockImageKey, listOllamaModels])
      m.mockReset()
    for (const m of Object.values(toast)) m.mockReset()
    saveProviderSettings.mockImplementation(async (c) => ({ ...c }))
    getCodexAuthStatus.mockResolvedValue('authenticated')
    getPresentonLinkStatus.mockResolvedValue(true)
    checkStockImageKey.mockResolvedValue()
    listOllamaModels.mockResolvedValue([{ name: 'llama3' }])
    refreshRuntime = vi.fn().mockResolvedValue(undefined)
    useSessionStore().refreshRuntime = refreshRuntime as never
  })

  it('load strips OAuth-managed fields from both copies', () => {
    const d = setup()
    for (const c of [d.draft.value, d.original.value]) {
      expect(c.CODEX_ACCESS_TOKEN).toBeUndefined()
      expect(c.PRESENTON_EMAIL).toBeUndefined()
      expect(c.OPENAI_API_KEY).toBe(KEY)
    }
    expect(d.dirty.value).toBe(false)
  })

  it('migrates legacy Azure fields on load without making the draft dirty', async () => {
    const d = setup({
      ...base(),
      LLM: 'azure',
      AZURE_OPENAI_DEPLOYMENT: 'my-deployment',
      AZURE_OPENAI_BASE_URL: 'https://legacy.test',
    })
    expect(d.dirty.value).toBe(false)
    expect(d.draft.value.AZURE_OPENAI_MODEL).toBe('my-deployment')
    expect(d.original.value.AZURE_OPENAI_MODEL).toBe('my-deployment')
    d.set('AZURE_OPENAI_MODEL', 'other')
    expect(d.dirty.value).toBe(true)
    d.discard()
    expect(d.draft.value.AZURE_OPENAI_MODEL).toBe('my-deployment')
    expect(d.dirty.value).toBe(false)
  })

  it('set makes dirty and discard restores', () => {
    const d = setup()
    d.set('OPENAI_MODEL', 'gpt-5')
    expect(d.dirty.value).toBe(true)
    d.discard()
    expect(d.draft.value.OPENAI_MODEL).toBe('gpt-4o')
    expect(d.dirty.value).toBe(false)
  })

  it('typing then deleting a new value is not dirty; restoring the original is not dirty', () => {
    const d = setup()
    d.set('TAVILY_API_KEY', 'abc')
    expect(d.dirty.value).toBe(true)
    d.set('TAVILY_API_KEY', '')
    expect(d.dirty.value).toBe(false)
    d.set('OPENAI_MODEL', 'x')
    d.set('OPENAI_MODEL', 'gpt-4o')
    expect(d.dirty.value).toBe(false)
  })

  it('compares arrays and booleans deeply', () => {
    const d = setup({ ...base(), OPENROUTER_PROVIDER_ORDER: ['a', 'b'], WEB_GROUNDING: true })
    d.set('OPENROUTER_PROVIDER_ORDER', ['a', 'b'])
    d.set('WEB_GROUNDING', true)
    expect(d.dirty.value).toBe(false)
    d.set('OPENROUTER_PROVIDER_ORDER', ['b', 'a'])
    expect(d.dirty.value).toBe(true)
  })

  describe('dirty tracking', () => {
    it('web search toggled on then off against absent keys is clean', () => {
      const d = setup()
      d.set('WEB_GROUNDING', true)
      d.set('WEB_SEARCH_PROVIDER', 'auto')
      expect(d.dirty.value).toBe(true)
      d.set('WEB_GROUNDING', false)
      expect(d.dirty.value).toBe(false)
    })

    it('a chosen web search provider stays dirty when web search is off', () => {
      const d = setup()
      d.set('WEB_GROUNDING', false)
      d.set('WEB_SEARCH_PROVIDER', 'tavily')
      expect(d.dirty.value).toBe(true)
    })

    it('images toggled off then on against an absent key is clean', () => {
      const d = setup({ LLM: 'openai', OPENAI_API_KEY: KEY, OPENAI_MODEL: 'm' })
      d.set('DISABLE_IMAGE_GENERATION', true)
      expect(d.dirty.value).toBe(true)
      d.set('DISABLE_IMAGE_GENERATION', false)
      expect(d.dirty.value).toBe(false)
    })

    it('a true flag against a stored false stays dirty', () => {
      const d = setup({ ...base(), WEB_GROUNDING: false })
      d.set('WEB_GROUNDING', true)
      expect(d.dirty.value).toBe(true)
    })

    it('an empty provider order (reset or last chip removed) equals an absent one', () => {
      const d = setup({ LLM: 'openrouter', OPENROUTER_API_KEY: KEY })
      d.set('OPENROUTER_PROVIDER_ORDER', ['a'])
      expect(d.dirty.value).toBe(true)
      d.set('OPENROUTER_PROVIDER_ORDER', [])
      expect(d.dirty.value).toBe(false)
    })

    it('a numeric token limit equals the same limit retyped as a string', () => {
      const d = setup({ ...base(), LLM_MAX_OUTPUT_TOKENS: 4096 })
      d.set('LLM_MAX_OUTPUT_TOKENS', '4096')
      expect(d.dirty.value).toBe(false)
      d.set('LLM_MAX_OUTPUT_TOKENS', '4097')
      expect(d.dirty.value).toBe(true)
    })

    it('a stored null equals an empty string', () => {
      const d = setup({ ...base(), OPENAI_URL: null as unknown as string })
      d.set('OPENAI_URL', '')
      expect(d.dirty.value).toBe(false)
      d.set('OPENAI_URL', 'x')
      expect(d.dirty.value).toBe(true)
    })

    it('still treats a changed value and a reordered array as dirty', () => {
      const d = setup({ ...base(), OPENROUTER_PROVIDER_ORDER: ['a', 'b'] })
      d.set('OPENROUTER_PROVIDER_ORDER', ['b', 'a'])
      expect(d.dirty.value).toBe(true)
      d.set('OPENROUTER_PROVIDER_ORDER', ['a', 'b'])
      d.set('OPENAI_MODEL', 'other')
      expect(d.dirty.value).toBe(true)
    })
  })

  describe('load normalisation', () => {
    it('normalises string booleans in both copies without making the draft dirty', () => {
      const d = setup({ LLM: 'openai', OPENAI_API_KEY: KEY, DISABLE_IMAGE_GENERATION: 'false' as unknown as boolean, WEB_GROUNDING: 'true' as unknown as boolean })
      expect(d.draft.value.DISABLE_IMAGE_GENERATION).toBe(false)
      expect(d.original.value.DISABLE_IMAGE_GENERATION).toBe(false)
      expect(d.draft.value.WEB_GROUNDING).toBe(true)
      expect(d.dirty.value).toBe(false)
    })

    it('is idempotent', () => {
      const d = setup({ ...base(), LLM_MAX_OUTPUT_TOKENS: '2048' as unknown as number, OPENROUTER_PROVIDER_ORDER: 'a, b' as unknown as string[] })
      const first = JSON.parse(JSON.stringify(d.draft.value))
      d.load(d.draft.value)
      expect(d.draft.value).toEqual(first)
      expect(d.dirty.value).toBe(false)
    })

    it('sends the same body for an already-normalised config', async () => {
      const stored: ProviderConfig = { LLM: 'openai', OPENAI_API_KEY: KEY, OPENAI_MODEL: 'm', IMAGE_PROVIDER: 'dall-e-3', DISABLE_IMAGE_GENERATION: false }
      const d = setup(stored)
      d.set('OPENAI_MODEL', 'm2')
      await d.save()
      expect(saveProviderSettings.mock.calls[0][0]).toEqual({
        ...stored,
        OPENAI_MODEL: 'm2',
        LLM_GENERATION_PROFILE: '',
        LLM_REASONING_BUDGET_TOKENS: '',
      })
    })
  })

  it('redacts a secret that is a prefix of a longer secret without leaving the tail', async () => {
    const short = 'sk-test-abc'
    const long = 'sk-test-abcdef'
    saveProviderSettings.mockRejectedValue(new ApiError('boom', 500, { detail: `rejected ${long}` }))
    const d = setup({ LLM: 'openai', OPENAI_API_KEY: short, OPENAI_MODEL: 'm', IMAGE_PROVIDER: 'pexels', PEXELS_API_KEY: long, DISABLE_IMAGE_GENERATION: true })
    expect(await d.save()).toEqual({ ok: false })
    const text = toastText()
    expect(text).not.toContain('def')
    expect(text).not.toContain(long)
    expect(text).toContain('[redacted]')
  })

  it('save success sends a normalised body without OAuth fields, refreshes runtime and is clean', async () => {
    const d = setup()
    d.set('OPENAI_MODEL', 'gpt-5')
    const result = await d.save()
    expect(result).toEqual({ ok: true })
    expect(saveProviderSettings).toHaveBeenCalledTimes(1)
    const body = saveProviderSettings.mock.calls[0][0]
    expect(body.DISABLE_IMAGE_GENERATION).toBe(false)
    expect(body.OPENAI_MODEL).toBe('gpt-5')
    expect(body.CODEX_ACCESS_TOKEN).toBeUndefined()
    expect(body.PRESENTON_EMAIL).toBeUndefined()
    expect(refreshRuntime).toHaveBeenCalledTimes(1)
    expect(d.dirty.value).toBe(false)
    expect(d.saving.value).toBe(false)
    expect(toast.success).toHaveBeenCalledWith('Settings saved', {
      description: 'Your configuration was saved successfully.',
    })
  })

  it('validation failure sends nothing and carries the section', async () => {
    const d = setup({ LLM: 'openai', OPENAI_API_KEY: KEY, OPENAI_MODEL: 'm', IMAGE_PROVIDER: 'pexels' })
    const result = await d.save()
    expect(result).toEqual({ ok: false, section: 'images' })
    expect(saveProviderSettings).not.toHaveBeenCalled()
    expect(toast.warning).toHaveBeenCalledWith('Cannot save settings', { description: 'Pexels API key is required.' })
    expect(d.saving.value).toBe(false)
  })

  it('codex unauthenticated stops before the PUT', async () => {
    getCodexAuthStatus.mockResolvedValue('unauthenticated')
    const d = setup({ LLM: 'codex', CODEX_MODEL: 'gpt-5.1-codex', DISABLE_IMAGE_GENERATION: true })
    expect(await d.save()).toEqual({ ok: false })
    expect(saveProviderSettings).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('Sign in to ChatGPT again', {
      description: 'Open the classic app to sign in, or switch to another provider.',
    })
  })

  it('presenton unlinked stops before the PUT', async () => {
    getPresentonLinkStatus.mockResolvedValue(false)
    const d = setup({ LLM: 'presenton' })
    expect(await d.save()).toEqual({ ok: false })
    expect(saveProviderSettings).not.toHaveBeenCalled()
    expect(toast.warning).toHaveBeenCalledWith('Connect Presenton first', {
      description: 'Sign in to Presenton Cloud before selecting it as the text provider.',
    })
  })

  it('presenton linked saves and skips the stock check', async () => {
    const d = setup({ LLM: 'presenton', IMAGE_PROVIDER: 'pexels', PEXELS_API_KEY: KEY })
    expect((await d.save()).ok).toBe(true)
    expect(checkStockImageKey).not.toHaveBeenCalled()
  })

  it('stock key rejection stops before the PUT without leaking the key', async () => {
    checkStockImageKey.mockRejectedValue(new Error(`Pexels rejected ${KEY}`))
    const d = setup({ LLM: 'openai', OPENAI_API_KEY: 'sk-other', OPENAI_MODEL: 'm', IMAGE_PROVIDER: 'pexels', PEXELS_API_KEY: KEY })
    expect(await d.save()).toEqual({ ok: false })
    expect(checkStockImageKey).toHaveBeenCalledWith('pexels', KEY)
    expect(saveProviderSettings).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledTimes(1)
    expect(toast.error.mock.calls[0][0]).toBe('Cannot save settings')
    expect(toastText()).not.toContain(KEY)
  })

  it('skips the stock check when image generation is disabled', async () => {
    const d = setup({ ...base(), IMAGE_PROVIDER: 'pexels', PEXELS_API_KEY: KEY, DISABLE_IMAGE_GENERATION: true })
    expect((await d.save()).ok).toBe(true)
    expect(checkStockImageKey).not.toHaveBeenCalled()
  })

  it('checks a pixabay key', async () => {
    const d = setup({ ...base(), IMAGE_PROVIDER: 'pixabay', PIXABAY_API_KEY: 'px-key' })
    expect((await d.save()).ok).toBe(true)
    expect(checkStockImageKey).toHaveBeenCalledWith('pixabay', 'px-key')
  })

  it('ollama model missing stops before the PUT', async () => {
    const d = setup({ LLM: 'ollama', OLLAMA_URL: 'http://ollama:11434', OLLAMA_MODEL: 'mistral', DISABLE_IMAGE_GENERATION: true })
    expect(await d.save()).toEqual({ ok: false })
    expect(listOllamaModels).toHaveBeenCalledWith('http://ollama:11434')
    expect(saveProviderSettings).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('Cannot save settings', {
      description:
        'The selected model "mistral" is not available at http://ollama:11434. Check models and select an available model.',
    })
  })

  it('ollama model present saves', async () => {
    const d = setup({ LLM: 'ollama', OLLAMA_URL: 'http://ollama:11434', OLLAMA_MODEL: 'llama3', DISABLE_IMAGE_GENERATION: true })
    expect((await d.save()).ok).toBe(true)
  })

  it.each([
    ['403', new ApiError('Forbidden', 403, { detail: `no access for ${KEY}` })],
    ['500', new ApiError('Boom', 500, { detail: 'Server exploded' })],
    ['unreachable', new BackendUnreachableError()],
  ])('PUT %s keeps the draft dirty and leaks nothing', async (_n, err) => {
    saveProviderSettings.mockRejectedValue(err)
    const d = setup()
    d.set('OPENAI_MODEL', 'gpt-5')
    const before = JSON.stringify(d.draft.value)
    expect(await d.save()).toEqual({ ok: false })
    expect(JSON.stringify(d.draft.value)).toBe(before)
    expect(d.dirty.value).toBe(true)
    expect(d.saving.value).toBe(false)
    expect(refreshRuntime).not.toHaveBeenCalled()
    expect(toast.error.mock.calls[0][0]).toBe('Could not save settings')
    expect(toastText()).not.toContain(KEY)
  })

  it('a thrown collaborator does not leave saving stuck', async () => {
    getPresentonLinkStatus.mockRejectedValue(new Error('x'))
    const d = setup({ LLM: 'presenton' })
    expect(await d.save()).toEqual({ ok: false })
    expect(d.saving.value).toBe(false)
  })

  it('a second save while saving sends one PUT', async () => {
    let release!: () => void
    saveProviderSettings.mockImplementation(
      (c) => new Promise((r) => { release = () => r({ ...c }) }),
    )
    const d = setup()
    d.set('OPENAI_MODEL', 'gpt-5')
    const first = d.save()
    expect(d.saving.value).toBe(true)
    expect(await d.save()).toEqual({ ok: false })
    await vi.waitFor(() => expect(saveProviderSettings).toHaveBeenCalledTimes(1))
    release()
    expect(await first).toEqual({ ok: true })
    expect(saveProviderSettings).toHaveBeenCalledTimes(1)
  })
})
