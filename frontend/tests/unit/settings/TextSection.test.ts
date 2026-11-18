import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, nextTick, ref } from 'vue'
import TextSection from '@/components/settings/TextSection.vue'
import { DEFAULT_OLLAMA_URL, TEXT_PROVIDERS } from '@/settings/providers'
import type { ProviderConfig } from '@/settings/types'

const listOpenAiCompatibleModels = vi.hoisted(() => vi.fn<(p: { url: string; apiKey: string }) => Promise<string[]>>())
const listGoogleModels = vi.hoisted(() => vi.fn())
const listAnthropicModels = vi.hoisted(() => vi.fn())
const toastError = vi.hoisted(() => vi.fn())
vi.mock('@/api/providerModels', () => ({ listOpenAiCompatibleModels, listGoogleModels, listAnthropicModels }))
vi.mock('vue-sonner', () => ({ toast: { error: toastError } }))

const FAKE_KEY = 'sk-test-fake'
let wrapper: VueWrapper | null = null

beforeEach(() => {
  listOpenAiCompatibleModels.mockReset()
  toastError.mockReset()
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

function mountSection(config: ProviderConfig) {
  wrapper = mount(TextSection, { attachTo: document.body, props: { config } })
  return wrapper
}
const options = () => Array.from(document.body.querySelectorAll<HTMLElement>('[role="option"]'))
async function openPicker(w: VueWrapper) {
  await w.get('button[role="combobox"]').trigger('click')
  await nextTick()
  await nextTick()
}
async function pick(label: string) {
  const option = options().find((o) => o.textContent?.includes(label))
  if (!option) throw new Error(`no option ${label}`)
  option.click()
  await nextTick()
  await nextTick()
}
const button = (w: VueWrapper, text: string) => w.findAll('button').find((b) => b.text().includes(text))

describe('TextSection', () => {
  it('renders an empty config with the picker placeholder and nothing else', () => {
    const w = mountSection({})
    expect(w.get('button[role="combobox"]').text()).toBe('Select text provider')
    expect(w.find('input').exists()).toBe(false)
    expect(w.text()).toContain('ChatGPT sign-in and Presenton Cloud are set up in the classic app.')
  })

  it('lists the 15 key-based providers and neither ChatGPT nor Presenton', async () => {
    const w = mountSection({})
    await openPicker(w)
    const labels = options().map((o) => o.querySelector('span span')?.textContent)
    expect(labels).toHaveLength(15)
    expect(labels).toEqual(TEXT_PROVIDERS.map((r) => r.label))
    const all = options().map((o) => o.textContent).join(' ')
    expect(all).not.toContain('ChatGPT')
    expect(all).not.toContain('Presenton')
  })

  it('emits the provider when one is picked', async () => {
    const w = mountSection({})
    await openPicker(w)
    await pick('Anthropic')
    expect(w.emitted('set')).toEqual([['LLM', 'anthropic']])
  })

  it('fills the default Ollama URL when Ollama is picked with no URL', async () => {
    const w = mountSection({})
    await openPicker(w)
    await pick('Ollama')
    expect(w.emitted('set')).toEqual([
      ['LLM', 'ollama'],
      ['OLLAMA_URL', DEFAULT_OLLAMA_URL],
    ])
  })

  it('keeps an existing Ollama URL', async () => {
    const w = mountSection({ OLLAMA_URL: 'http://my-ollama:11434' })
    await openPicker(w)
    await pick('Ollama')
    expect(w.emitted('set')).toEqual([['LLM', 'ollama']])
  })

  it('links to the classic app in a new tab', () => {
    const w = mountSection({})
    const link = w.get('a[href^="http://backend.test:5001/settings"]')
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toContain('noopener')
  })

  it('emits the key field when typing a key and enables Check models only with a key', async () => {
    const w = mountSection({ LLM: 'anthropic' })
    const check = () => button(w, 'Check models')!
    expect(check().attributes('disabled')).toBeDefined()
    await w.get('input[type="password"]').setValue('sk-ant-test-fake')
    expect(w.emitted('set')).toEqual([['ANTHROPIC_API_KEY', 'sk-ant-test-fake']])
    await w.setProps({ config: { LLM: 'anthropic', ANTHROPIC_API_KEY: 'sk-ant-test-fake' } })
    expect(check().attributes('disabled')).toBeUndefined()
  })

  it('shows the key label, placeholder and Get an API key link from the row', () => {
    const w = mountSection({ LLM: 'openai' })
    expect(w.text()).toContain('OpenAI API key')
    expect(w.get('input[type="password"]').attributes('placeholder')).toBe('Enter your OpenAI API key')
    const link = w.get('a[href*="openai"]')
    expect(link.text()).toBe('Get an API key')
    expect(link.attributes('target')).toBe('_blank')
  })

  it('marks optional keys and uses the row placeholder', () => {
    const w = mountSection({ LLM: 'litellm' })
    expect(w.text()).toContain('LiteLLM API key (optional)')
    expect(w.text().match(/\(optional\)/g)).toHaveLength(1)
    expect(w.get('input[type="password"]').attributes('placeholder')).toBe('Optional if your proxy does not require auth')
    expect(w.find('a[href*="google.com"]').exists()).toBe(false)
  })

  it('renders the base URL field and emits it', async () => {
    const w = mountSection({ LLM: 'litellm' })
    const url = w.get('input[type="text"]')
    expect(url.attributes('placeholder')).toBe('e.g. http://host.docker.internal:4000/v1')
    expect(w.text()).toContain('LiteLLM base URL')
    await url.setValue('http://gw/v1')
    expect(w.emitted('set')).toEqual([['LITELLM_BASE_URL', 'http://gw/v1']])
  })

  it('marks optional URLs', () => {
    const w = mountSection({ LLM: 'fireworks' })
    expect(w.text()).toContain('Fireworks base URL (optional)')
  })

  it('puts the DeepSeek base URL under collapsed Advanced settings unless a value is set', async () => {
    const w = mountSection({ LLM: 'deepseek' })
    const details = w.get('details')
    expect(details.text()).toContain('Advanced settings')
    expect((details.element as HTMLDetailsElement).open).toBe(false)
    await w.setProps({ config: { LLM: 'deepseek' } })
    const set = mountSection({ LLM: 'deepseek', DEEPSEEK_BASE_URL: 'https://proxy.test/v1' })
    expect((set.get('details').element as HTMLDetailsElement).open).toBe(true)
  })

  it('renders nothing for the dedicated-field providers until their components land', () => {
    for (const LLM of ['ollama', 'vertex', 'azure', 'bedrock']) {
      const w = mountSection({ LLM })
      expect(w.find('input').exists()).toBe(false)
      expect(w.text()).not.toContain('Check models')
      w.unmount()
    }
  })

  describe('model discovery', () => {
    it('shows the model picker after a successful check', async () => {
      listOpenAiCompatibleModels.mockResolvedValue(['gpt-4o', 'gpt-4.1'])
      const w = mountSection({ LLM: 'openai', OPENAI_API_KEY: FAKE_KEY })
      expect(w.text()).not.toContain('OpenAI model ID')
      await button(w, 'Check models')!.trigger('click')
      await flushPromises()
      expect(listOpenAiCompatibleModels).toHaveBeenCalledWith({ url: 'https://api.openai.com/v1', apiKey: FAKE_KEY })
      expect(w.text()).toContain('OpenAI model ID')
      expect(w.text()).not.toContain('No models were discovered')
      expect(w.emitted('set')).toEqual([['OPENAI_MODEL', 'gpt-4.1']])
    })

    it('shows the spinner label while checking', async () => {
      let finish!: (m: string[]) => void
      listOpenAiCompatibleModels.mockReturnValue(new Promise((resolve) => (finish = resolve)))
      const w = mountSection({ LLM: 'openai', OPENAI_API_KEY: FAKE_KEY })
      await button(w, 'Check models')!.trigger('click')
      expect(w.text()).toContain('Checking for models…')
      expect(button(w, 'Checking for models…')!.attributes('disabled')).toBeDefined()
      finish([])
      await flushPromises()
      expect(w.text()).not.toContain('Checking for models…')
    })

    it('notes when no models were discovered and keeps free entry', async () => {
      listOpenAiCompatibleModels.mockRejectedValue(new Error('Unreachable'))
      const w = mountSection({ LLM: 'openai', OPENAI_API_KEY: FAKE_KEY })
      await button(w, 'Check models')!.trigger('click')
      await flushPromises()
      expect(w.text()).toContain('No models were discovered. You can still enter a valid model ID or alias manually above.')
      expect(w.text()).toContain('OpenAI model ID')
      expect(toastError).toHaveBeenCalledWith('Could not load models', expect.objectContaining({ description: expect.stringContaining('You can enter a model ID manually.') }))
    })

    it('clears the discovered models when the key changes', async () => {
      listOpenAiCompatibleModels.mockResolvedValue(['gpt-4.1'])
      const w = mountSection({ LLM: 'openai', OPENAI_API_KEY: FAKE_KEY })
      await button(w, 'Check models')!.trigger('click')
      await flushPromises()
      expect(w.text()).toContain('OpenAI model ID')
      await w.setProps({ config: { LLM: 'openai', OPENAI_API_KEY: 'sk-test-other' } })
      expect(w.text()).not.toContain('OpenAI model ID')
    })

    it('shows the configured model without needing a check', () => {
      const w = mountSection({ LLM: 'openai', OPENAI_API_KEY: FAKE_KEY, OPENAI_MODEL: 'gpt-4.1' })
      expect(w.text()).toContain('OpenAI model ID')
      expect(w.text()).toContain('gpt-4.1')
    })
  })

  describe('sign-in providers', () => {
    it('shows ChatGPT read-only, with the classic link and no inputs or tokens', () => {
      const w = mountSection({ LLM: 'codex', CODEX_MODEL: 'gpt-5', CODEX_ACCESS_TOKEN: 'codex-token-fake', CODEX_REFRESH_TOKEN: 'codex-refresh-fake' })
      expect(w.text()).toContain('ChatGPT')
      expect(w.text()).toContain('gpt-5')
      expect(w.text()).not.toContain('codex-token-fake')
      expect(w.text()).not.toContain('codex-refresh-fake')
      expect(w.find('input').exists()).toBe(false)
      expect(w.find('button[role="combobox"]').exists()).toBe(false)
      expect(w.get('a').attributes('href')!.startsWith('http://backend.test:5001/settings')).toBe(true)
      expect(w.get('img').attributes('src')).toBe('/providers/openai.png')
    })

    it('shows Presenton Cloud with the account email only', () => {
      const w = mountSection({ LLM: 'presenton', PRESENTON_EMAIL: 'a@b.test', PRESENTON_CONNECTED: true, PRESENTON_ACCESS_TOKEN: 'tok-fake' })
      expect(w.text()).toContain('Presenton')
      expect(w.text()).toContain('a@b.test')
      expect(w.text()).not.toContain('tok-fake')
      expect(w.text().toLowerCase()).not.toContain('token')
      expect(w.find('input').exists()).toBe(false)
    })

    it('falls back to "Connected account" without an email', () => {
      const w = mountSection({ LLM: 'presenton', PRESENTON_EMAIL: null })
      expect(w.text()).toContain('Connected account')
    })

    it('reveals the picker via Switch to another provider, then leaves read-only mode on pick', async () => {
      const w = mountSection({ LLM: 'codex', CODEX_MODEL: 'gpt-5' })
      await button(w, 'Switch to another provider')!.trigger('click')
      expect(w.get('button[role="combobox"]').text()).toBe('Select text provider')
      expect(button(w, 'Switch to another provider')).toBeUndefined()
      await openPicker(w)
      await pick('OpenAI')
      expect(w.emitted('set')).toEqual([['LLM', 'openai']])
      await w.setProps({ config: { LLM: 'openai' } })
      expect(w.get('button[role="combobox"]').text()).toBe('OpenAI')
      expect(w.find('input[type="password"]').exists()).toBe(true)
    })
  })

  it('keeps each provider’s typed values when switching A to B to A', async () => {
    const config = ref<ProviderConfig>({ LLM: 'openai' })
    const Harness = defineComponent({
      components: { TextSection },
      setup: () => ({
        config,
        set: (field: string, value: unknown) => {
          config.value = { ...config.value, [field]: value }
        },
      }),
      template: '<TextSection :config="config" @set="set" />',
    })
    const w = mount(Harness, { attachTo: document.body })
    wrapper = w
    await w.get('input[type="password"]').setValue(FAKE_KEY)
    await openPicker(w)
    await pick('Anthropic')
    expect((w.get('input[type="password"]').element as HTMLInputElement).value).toBe('')
    await w.get('input[type="password"]').setValue('sk-ant-test-fake')
    await openPicker(w)
    await pick('OpenAI')
    expect((w.get('input[type="password"]').element as HTMLInputElement).value).toBe(FAKE_KEY)
    expect(config.value.OPENAI_API_KEY).toBe(FAKE_KEY)
    expect(config.value.ANTHROPIC_API_KEY).toBe('sk-ant-test-fake')
  })
})
