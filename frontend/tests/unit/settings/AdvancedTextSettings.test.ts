import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import AdvancedTextSettings from '@/components/settings/AdvancedTextSettings.vue'
import type { ProviderConfig } from '@/settings/types'

const getGenerationDefaults = vi.hoisted(() => vi.fn<() => Promise<{ defaultMaxOutputTokens: number }>>())
const listOpenRouterProviders = vi.hoisted(() =>
  vi.fn<(p: { model: string; apiKey: string; baseUrl?: string }) => Promise<string[]>>(),
)
vi.mock('@/api/providerModels', () => ({ getGenerationDefaults, listOpenRouterProviders }))

const FAKE_KEY = 'sk-test-fake'
let wrapper: VueWrapper | null = null

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
  getGenerationDefaults.mockReset()
  listOpenRouterProviders.mockReset()
  getGenerationDefaults.mockResolvedValue({ defaultMaxOutputTokens: 16384 })
  listOpenRouterProviders.mockResolvedValue([])
})
const extra: VueWrapper[] = []
afterEach(() => {
  vi.useRealTimers()
  for (const w of extra.splice(0)) w.unmount()
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

async function make(config: ProviderConfig = { LLM: 'openai' }) {
  if (wrapper) extra.push(wrapper)
  wrapper = mount(AdvancedTextSettings, { attachTo: document.body, props: { config } })
  await flushPromises()
  return wrapper
}
const OPENROUTER: ProviderConfig = { LLM: 'openrouter', OPENROUTER_MODEL: 'openai/gpt-4o', OPENROUTER_API_KEY: FAKE_KEY }
const emitted = (w: VueWrapper) => (w.emitted('set') ?? []) as [string, unknown][]
const tokens = (w: VueWrapper) => w.get<HTMLInputElement>('input[type="number"]')
const checkbox = (w: VueWrapper) => w.get('button[role="checkbox"]')
const select = (w: VueWrapper, label: string) => {
  const labelEl = w.findAll('label').find((l) => l.text() === label)
  if (!labelEl) throw new Error(`no label ${label}`)
  return w.get<HTMLSelectElement>(`#${labelEl.attributes('for')}`)
}
const button = (w: VueWrapper, name: string) =>
  w.findAll('button').find((b) => b.text().trim() === name || b.attributes('aria-label') === name)
const needButton = (w: VueWrapper, name: string) => {
  const b = button(w, name)
  if (!b) throw new Error(`no button ${name}`)
  return b
}

describe('AdvancedTextSettings: generation controls', () => {
  it('never emits on mount or after the defaults arrive', async () => {
    const w = await make({ LLM: 'openai', LLM_MAX_OUTPUT_TOKENS: 2048 })
    expect(emitted(w)).toEqual([])
    const wr = await make(OPENROUTER)
    expect(emitted(wr)).toEqual([])
  })

  it('shows the fetched default as the placeholder', async () => {
    const w = await make()
    expect(tokens(w).attributes('placeholder')).toBe('16384')
    expect(tokens(w).element.value).toBe('')
  })

  it('still renders with placeholder 8192 when the defaults fetch fails', async () => {
    getGenerationDefaults.mockRejectedValue(new Error('boom'))
    const w = await make()
    expect(tokens(w).attributes('placeholder')).toBe('8192')
    expect(emitted(w)).toEqual([])
  })

  it('shows a configured limit in the field', async () => {
    const w = await make({ LLM: 'openai', LLM_MAX_OUTPUT_TOKENS: 2048 })
    expect(tokens(w).element.value).toBe('2048')
  })

  it('ticking Use model maximum sets the profile and clears the limit', async () => {
    const w = await make({ LLM: 'openai', LLM_MAX_OUTPUT_TOKENS: 2048 })
    await checkbox(w).trigger('click')
    expect(emitted(w)).toEqual([
      ['LLM_GENERATION_PROFILE', 'model_max'],
      ['LLM_MAX_OUTPUT_TOKENS', ''],
    ])
  })

  it('unticking clears the profile and the limit', async () => {
    const w = await make({ LLM: 'openai', LLM_GENERATION_PROFILE: 'model_max' })
    expect(checkbox(w).attributes('aria-checked')).toBe('true')
    expect(tokens(w).element.disabled).toBe(true)
    expect(tokens(w).attributes('placeholder')).toBe('Model maximum')
    await checkbox(w).trigger('click')
    expect(emitted(w)).toEqual([
      ['LLM_GENERATION_PROFILE', ''],
      ['LLM_MAX_OUTPUT_TOKENS', ''],
    ])
  })

  it('treats a manual limit as overriding the model maximum', async () => {
    const w = await make({ LLM: 'openai', LLM_GENERATION_PROFILE: 'model_max', LLM_MAX_OUTPUT_TOKENS: 4096 })
    expect(checkbox(w).attributes('aria-checked')).toBe('false')
    expect(tokens(w).element.disabled).toBe(false)
  })

  it('typing a limit emits it as text for normalise', async () => {
    const w = await make()
    await tokens(w).setValue('4096')
    expect(emitted(w)).toEqual([['LLM_MAX_OUTPUT_TOKENS', '4096']])
  })

  it('clearing the field emits an empty limit, and typing drops a legacy profile', async () => {
    const w = await make({ LLM: 'openai', LLM_GENERATION_PROFILE: 'fast', LLM_MAX_OUTPUT_TOKENS: 2048 })
    await tokens(w).setValue('')
    expect(emitted(w)).toEqual([
      ['LLM_GENERATION_PROFILE', ''],
      ['LLM_MAX_OUTPUT_TOKENS', ''],
    ])
  })

  it('changing reasoning mode to Off resets effort and budget', async () => {
    const w = await make({ LLM: 'openai', LLM_REASONING_EFFORT: 'high', LLM_REASONING_BUDGET_TOKENS: 2000 })
    await select(w, 'Reasoning mode').setValue('disabled')
    expect(emitted(w)).toEqual([
      ['LLM_REASONING_MODE', 'disabled'],
      ['LLM_REASONING_EFFORT', ''],
      ['LLM_REASONING_BUDGET_TOKENS', ''],
    ])
  })

  it('model default clears the mode; an invalid effort of none is cleared when reasoning is switched on', async () => {
    const w = await make({ LLM: 'openai', LLM_REASONING_MODE: 'enabled', LLM_REASONING_EFFORT: 'none' })
    await select(w, 'Reasoning mode').setValue('model_default')
    expect(emitted(w)).toEqual([
      ['LLM_REASONING_MODE', ''],
      ['LLM_REASONING_EFFORT', ''],
    ])
  })

  it('switching reasoning on keeps a real effort', async () => {
    const w = await make({ LLM: 'openai', LLM_REASONING_EFFORT: 'high' })
    await select(w, 'Reasoning mode').setValue('enabled')
    expect(emitted(w)).toEqual([['LLM_REASONING_MODE', 'enabled']])
  })

  it('hides reasoning effort when reasoning is off and maps legacy values to model default', async () => {
    const off = await make({ LLM: 'openai', LLM_REASONING_MODE: 'disabled' })
    expect(off.findAll('label').some((l) => l.text() === 'Reasoning effort')).toBe(false)
    const on = await make({ LLM: 'openai', LLM_REASONING_MODE: 'auto', LLM_REASONING_EFFORT: 'none' })
    expect(select(on, 'Reasoning mode').element.value).toBe('model_default')
    expect(select(on, 'Reasoning effort').element.value).toBe('model_default')
  })

  it('emits the chosen reasoning effort, empty for model default', async () => {
    const w = await make()
    await select(w, 'Reasoning effort').setValue('xhigh')
    await select(w, 'Reasoning effort').setValue('model_default')
    expect(emitted(w)).toEqual([
      ['LLM_REASONING_EFFORT', 'xhigh'],
      ['LLM_REASONING_EFFORT', ''],
    ])
  })

  it('labels every control', async () => {
    const w = await make(OPENROUTER)
    for (const el of w.element.querySelectorAll('input, select, button[role="checkbox"]')) {
      const id = el.getAttribute('id')
      const labelled = (id && w.element.querySelector(`label[for="${CSS.escape(id)}"]`)) || el.getAttribute('aria-label')
      expect(labelled, el.outerHTML).toBeTruthy()
    }
  })
})

describe('AdvancedTextSettings: reset', () => {
  it('sets exactly the listed fields to empty values', async () => {
    const w = await make({
      ...OPENROUTER,
      LLM_GENERATION_PROFILE: 'model_max',
      LLM_MAX_OUTPUT_TOKENS: 4096,
      OPENROUTER_PROVIDER_ORDER: ['anthropic'],
    })
    await needButton(w, 'Reset to defaults').trigger('click')
    expect(emitted(w)).toEqual([
      ['LLM_GENERATION_PROFILE', ''],
      ['LLM_MAX_OUTPUT_TOKENS', ''],
      ['LLM_REASONING_MODE', ''],
      ['LLM_REASONING_EFFORT', ''],
      ['LLM_REASONING_BUDGET_TOKENS', ''],
      ['DISABLE_THINKING', ''],
      ['EXTENDED_REASONING', ''],
      ['OPENROUTER_PROVIDER_ORDER', []],
      ['OPENROUTER_ALLOW_FALLBACKS', ''],
      ['OPENROUTER_REQUIRE_PARAMETERS', ''],
      ['OPENROUTER_DATA_COLLECTION', ''],
      ['OPENROUTER_ZDR', ''],
    ])
  })
})

describe('AdvancedTextSettings: OpenRouter routing', () => {
  it('only renders the routing options for openrouter', async () => {
    const other = await make({ LLM: 'anthropic' })
    expect(other.text()).not.toContain('OpenRouter routing')
    expect(button(other, 'Load providers')).toBeUndefined()
    const w = await make(OPENROUTER)
    expect(w.text()).toContain('OpenRouter routing')
    expect(button(w, 'Load providers')).toBeDefined()
  })

  it('emits the tri-state routing options', async () => {
    const w = await make(OPENROUTER)
    await select(w, 'Allow fallbacks').setValue('false')
    await select(w, 'Require parameters').setValue('true')
    await select(w, 'Data collection').setValue('deny')
    await select(w, 'Zero data retention (ZDR)').setValue('true')
    await select(w, 'Allow fallbacks').setValue('')
    expect(emitted(w)).toEqual([
      ['OPENROUTER_ALLOW_FALLBACKS', false],
      ['OPENROUTER_REQUIRE_PARAMETERS', true],
      ['OPENROUTER_DATA_COLLECTION', 'deny'],
      ['OPENROUTER_ZDR', true],
      ['OPENROUTER_ALLOW_FALLBACKS', ''],
    ])
  })

  it('reflects stored routing values', async () => {
    const w = await make({ ...OPENROUTER, OPENROUTER_ALLOW_FALLBACKS: false, OPENROUTER_DATA_COLLECTION: 'allow', OPENROUTER_ZDR: true })
    expect(select(w, 'Allow fallbacks').element.value).toBe('false')
    expect(select(w, 'Require parameters').element.value).toBe('')
    expect(select(w, 'Data collection').element.value).toBe('allow')
    expect(select(w, 'Zero data retention (ZDR)').element.value).toBe('true')
  })

  it('does not fetch providers until asked, then offers the unchosen ones as chips', async () => {
    listOpenRouterProviders.mockResolvedValue(['anthropic', 'openai', 'google'])
    const w = await make({ ...OPENROUTER, OPENROUTER_BASE_URL: 'https://or.test/api', OPENROUTER_PROVIDER_ORDER: ['openai'] })
    expect(listOpenRouterProviders).not.toHaveBeenCalled()
    await needButton(w, 'Load providers').trigger('click')
    await flushPromises()
    expect(listOpenRouterProviders).toHaveBeenCalledWith({ model: 'openai/gpt-4o', apiKey: FAKE_KEY, baseUrl: 'https://or.test/api' })
    expect(button(w, 'Add anthropic')).toBeDefined()
    expect(button(w, 'Add google')).toBeDefined()
    expect(button(w, 'Add openai')).toBeUndefined()
    expect(emitted(w)).toEqual([])
    await needButton(w, 'Add anthropic').trigger('click')
    expect(emitted(w)).toEqual([['OPENROUTER_PROVIDER_ORDER', ['openai', 'anthropic']]])
  })

  it('asks for a model and key instead of fetching without them', async () => {
    const w = await make({ LLM: 'openrouter', OPENROUTER_MODEL: 'openai/gpt-4o' })
    await needButton(w, 'Load providers').trigger('click')
    await flushPromises()
    expect(listOpenRouterProviders).not.toHaveBeenCalled()
    expect(w.text()).toContain('Enter an OpenRouter model and API key first.')
  })

  it('shows a neutral message on failure, without the key, and keeps the chosen order', async () => {
    listOpenRouterProviders.mockRejectedValue(new Error(`401 for ${FAKE_KEY}`))
    const w = await make({ ...OPENROUTER, OPENROUTER_PROVIDER_ORDER: ['anthropic', 'google'] })
    await needButton(w, 'Load providers').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('Could not load providers.')
    expect(w.text()).not.toContain(FAKE_KEY)
    expect(document.body.textContent).not.toContain(FAKE_KEY)
    expect(w.text()).toContain('anthropic')
    expect(w.text()).toContain('google')
    expect(emitted(w)).toEqual([])
  })

  it('moves and removes chosen providers', async () => {
    const w = await make({ ...OPENROUTER, OPENROUTER_PROVIDER_ORDER: ['a', 'b', 'c'] })
    expect(w.findAll('[aria-label="Move a up"]')[0].attributes('disabled')).toBeDefined()
    expect(w.get('[aria-label="Move c down"]').attributes('disabled')).toBeDefined()
    await w.get('[aria-label="Move b up"]').trigger('click')
    await w.get('[aria-label="Move a down"]').trigger('click')
    await w.get('[aria-label="Remove c"]').trigger('click')
    expect(emitted(w)).toEqual([
      ['OPENROUTER_PROVIDER_ORDER', ['b', 'a', 'c']],
      ['OPENROUTER_PROVIDER_ORDER', ['b', 'a', 'c']],
      ['OPENROUTER_PROVIDER_ORDER', ['a', 'b']],
    ])
  })

  it('keeps the loaded list and starts no new fetch when an unrelated field changes', async () => {
    listOpenRouterProviders.mockResolvedValue(['anthropic', 'openai'])
    const config = { ...OPENROUTER }
    const w = await make(config)
    await needButton(w, 'Load providers').trigger('click')
    await flushPromises()
    await w.setProps({ config: { ...config, OPENROUTER_PROVIDER_ORDER: ['openai'] } })
    await w.setProps({ config: { ...config, OPENROUTER_PROVIDER_ORDER: ['openai'], LLM_MAX_OUTPUT_TOKENS: 100 } })
    expect(button(w, 'Add anthropic')).toBeDefined()
    expect(button(w, 'Load providers')?.attributes('disabled')).toBeUndefined()
    expect(listOpenRouterProviders).toHaveBeenCalledTimes(1)
  })

  it('keeps an in-flight provider list when an unrelated field changes', async () => {
    const d = deferred<string[]>()
    listOpenRouterProviders.mockReturnValue(d.promise)
    const w = await make(OPENROUTER)
    await needButton(w, 'Load providers').trigger('click')
    await w.setProps({ config: { ...OPENROUTER, LLM_MAX_OUTPUT_TOKENS: 100 } })
    d.resolve(['anthropic'])
    await flushPromises()
    expect(button(w, 'Add anthropic')).toBeDefined()
  })

  it.each([
    ['model', { OPENROUTER_MODEL: 'other/model' }],
    ['key', { OPENROUTER_API_KEY: 'sk-test-other' }],
    ['base URL', { OPENROUTER_BASE_URL: 'https://or.test/api' }],
  ])('drops the loaded list when the %s changes', async (_name, change) => {
    listOpenRouterProviders.mockResolvedValue(['anthropic'])
    const w = await make(OPENROUTER)
    await needButton(w, 'Load providers').trigger('click')
    await flushPromises()
    expect(button(w, 'Add anthropic')).toBeDefined()
    await w.setProps({ config: { ...OPENROUTER, ...change } })
    expect(button(w, 'Add anthropic')).toBeUndefined()
  })

  it('keeps the remaining chips after adding one when set is applied to the config like the draft does', async () => {
    listOpenRouterProviders.mockResolvedValue(['anthropic', 'openai', 'google'])
    const Harness = defineComponent({
      setup() {
        const config = ref<ProviderConfig>({ ...OPENROUTER })
        const set = (field: string, value: unknown) => {
          config.value = { ...config.value, [field]: value } as ProviderConfig
        }
        return () => h(AdvancedTextSettings, { config: config.value, onSet: set })
      },
    })
    if (wrapper) extra.push(wrapper)
    const w = mount(Harness, { attachTo: document.body })
    wrapper = w as unknown as VueWrapper
    await flushPromises()
    await needButton(w as unknown as VueWrapper, 'Load providers').trigger('click')
    await flushPromises()
    await needButton(w as unknown as VueWrapper, 'Add anthropic').trigger('click')
    await flushPromises()
    const v = w as unknown as VueWrapper
    expect(button(v, 'Add anthropic')).toBeUndefined()
    expect(button(v, 'Add openai')).toBeDefined()
    expect(button(v, 'Add google')).toBeDefined()
    expect(v.text()).toContain('anthropic')
    await needButton(v, 'Add openai').trigger('click')
    await flushPromises()
    expect(button(v, 'Add google')).toBeDefined()
    expect(listOpenRouterProviders).toHaveBeenCalledTimes(1)
  })

  it('ignores a provider list that arrives after the key changed', async () => {
    const d = deferred<string[]>()
    listOpenRouterProviders.mockReturnValue(d.promise)
    const w = await make(OPENROUTER)
    await needButton(w, 'Load providers').trigger('click')
    expect(needButton(w, 'Loading…').attributes('disabled')).toBeDefined()
    await w.setProps({ config: { ...OPENROUTER, OPENROUTER_API_KEY: 'sk-test-other' } })
    expect(button(w, 'Load providers')?.attributes('disabled')).toBeUndefined()
    d.resolve(['anthropic'])
    await flushPromises()
    expect(button(w, 'Add anthropic')).toBeUndefined()
  })

  it('ignores a provider list that arrives after unmount', async () => {
    const d = deferred<string[]>()
    listOpenRouterProviders.mockReturnValue(d.promise)
    const w = await make(OPENROUTER)
    await needButton(w, 'Load providers').trigger('click')
    w.unmount()
    wrapper = null
    d.resolve(['anthropic'])
    await flushPromises()
    expect(emitted(w)).toEqual([])
  })
})

describe('AdvancedTextSettings: stale defaults', () => {
  it('ignores a defaults result that arrives after the model changed', async () => {
    vi.useFakeTimers()
    const first = deferred<{ defaultMaxOutputTokens: number }>()
    const second = deferred<{ defaultMaxOutputTokens: number }>()
    getGenerationDefaults.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    wrapper = mount(AdvancedTextSettings, { attachTo: document.body, props: { config: { LLM: 'openai', OPENAI_MODEL: 'a' } } })
    await wrapper.setProps({ config: { LLM: 'openai', OPENAI_MODEL: 'b' } })
    await vi.advanceTimersByTimeAsync(1000)
    expect(getGenerationDefaults).toHaveBeenCalledTimes(2)
    second.resolve({ defaultMaxOutputTokens: 1000 })
    await vi.advanceTimersByTimeAsync(0)
    first.resolve({ defaultMaxOutputTokens: 2000 })
    await vi.advanceTimersByTimeAsync(0)
    expect(tokens(wrapper).attributes('placeholder')).toBe('1000')
    expect(emitted(wrapper)).toEqual([])
  })

  it('does not refetch on every keystroke', async () => {
    vi.useFakeTimers()
    wrapper = mount(AdvancedTextSettings, { attachTo: document.body, props: { config: { LLM: 'openai', OPENAI_MODEL: '' } } })
    for (const m of ['g', 'gp', 'gpt']) await wrapper.setProps({ config: { LLM: 'openai', OPENAI_MODEL: m } })
    await vi.advanceTimersByTimeAsync(1000)
    expect(getGenerationDefaults).toHaveBeenCalledTimes(2)
  })

  it('ignores a defaults result that arrives after unmount', async () => {
    const d = deferred<{ defaultMaxOutputTokens: number }>()
    getGenerationDefaults.mockReturnValue(d.promise)
    const w = await make()
    w.unmount()
    wrapper = null
    d.resolve({ defaultMaxOutputTokens: 1 })
    await flushPromises()
    expect(emitted(w)).toEqual([])
  })
})
