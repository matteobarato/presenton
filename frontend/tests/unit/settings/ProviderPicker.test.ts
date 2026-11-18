import { afterEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import ProviderPicker from '@/components/settings/ProviderPicker.vue'

const options = [
  { value: 'openai', label: 'OpenAI', description: 'GPT models', icon: '/providers/openai.png' },
  { value: 'anthropic', label: 'Anthropic', description: 'Claude models' },
  { value: 'ollama', label: 'Ollama', description: 'Local models' },
]

let wrapper: VueWrapper | null = null
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})
const flush = async () => {
  await nextTick()
  await nextTick()
}
async function open(modelValue = '') {
  wrapper = mount(ProviderPicker, {
    attachTo: document.body,
    props: { modelValue, options, placeholder: 'Select provider', searchPlaceholder: 'Search providers', label: 'Provider' },
  })
  await wrapper.get('button[role="combobox"]').trigger('click')
  await flush()
}
const optionEls = () => Array.from(document.body.querySelectorAll<HTMLElement>('[role="option"]'))
const search = () => document.body.querySelector('input[placeholder="Search providers"]') as HTMLInputElement

describe('ProviderPicker', () => {
  it('shows the placeholder, then the selected label with its icon', async () => {
    wrapper = mount(ProviderPicker, { attachTo: document.body, props: { modelValue: '', options, placeholder: 'Select provider' } })
    expect(wrapper.get('button[role="combobox"]').text()).toBe('Select provider')
    await wrapper.setProps({ modelValue: 'openai' })
    const trigger = wrapper.get('button[role="combobox"]')
    expect(trigger.text()).toBe('OpenAI')
    expect(trigger.get('img').attributes('src')).toBe('/providers/openai.png')
    expect(trigger.get('img').attributes('alt')).toBe('')
  })

  it('lists all options when opened', async () => {
    await open()
    expect(optionEls().map((o) => o.textContent)).toEqual([
      expect.stringContaining('OpenAI'),
      expect.stringContaining('Anthropic'),
      expect.stringContaining('Ollama'),
    ])
  })

  it('marks the selected option', async () => {
    await open('anthropic')
    expect(optionEls().map((o) => o.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false'])
  })

  it('filters by label or description, case-insensitively', async () => {
    await open()
    search().value = 'AN'
    search().dispatchEvent(new Event('input'))
    await flush()
    expect(optionEls()).toHaveLength(1)
    expect(optionEls()[0]!.textContent).toContain('Anthropic')
    search().value = 'local'
    search().dispatchEvent(new Event('input'))
    await flush()
    expect(optionEls()[0]!.textContent).toContain('Ollama')
  })

  it('shows the empty state when nothing matches', async () => {
    await open()
    search().value = 'zzz'
    search().dispatchEvent(new Event('input'))
    await flush()
    expect(optionEls()).toHaveLength(0)
    expect(document.body.textContent).toContain('No provider found.')
  })

  it('emits the value and closes on choosing', async () => {
    await open()
    optionEls()[1]!.click()
    await flush()
    expect(wrapper!.emitted('update:modelValue')).toEqual([['anthropic']])
    expect(optionEls()).toHaveLength(0)
  })

  it('closes on Escape and returns focus to the trigger', async () => {
    await open()
    expect(search()).toBeTruthy()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flush()
    await new Promise((r) => setTimeout(r, 0))
    expect(optionEls()).toHaveLength(0)
    expect(document.activeElement).toBe(wrapper!.get('button[role="combobox"]').element)
  })

  it('labels the trigger with the visible label and the current value', async () => {
    await open('ollama')
    const trigger = wrapper!.get('button[role="combobox"]')
    expect(wrapper!.get('label').text()).toBe('Provider')
    expect(wrapper!.get('label').attributes('for')).toBe(trigger.attributes('id'))
    expect(trigger.attributes('aria-haspopup')).toBe('listbox')
  })
})
