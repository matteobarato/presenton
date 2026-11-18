import { afterEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import ModelCombobox from '@/components/settings/ModelCombobox.vue'

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
async function open(modelValue: string, options: string[]) {
  wrapper = mount(ModelCombobox, { attachTo: document.body, props: { modelValue, options, providerLabel: 'OpenAI' } })
  await wrapper.get('button[role="combobox"]').trigger('click')
  await flush()
}
const optionEls = () => Array.from(document.body.querySelectorAll<HTMLElement>('[role="option"]'))
const names = () => optionEls().map((o) => o.textContent!.trim())
const search = () => document.body.querySelector('input[type="text"], input:not([type])') as HTMLInputElement
async function type(text: string) {
  search().value = text
  search().dispatchEvent(new Event('input'))
  await flush()
}

describe('ModelCombobox', () => {
  it('labels the trigger and shows the value or a prompt', async () => {
    wrapper = mount(ModelCombobox, { attachTo: document.body, props: { modelValue: '', options: [], providerLabel: 'OpenAI' } })
    expect(wrapper.get('label').text()).toBe('OpenAI model ID')
    expect(wrapper.get('button[role="combobox"]').text()).toBe('Select a discovered model or enter any model ID')
    await wrapper.setProps({ modelValue: 'gpt-4.1' })
    expect(wrapper.get('button[role="combobox"]').text()).toBe('gpt-4.1')
  })

  it('lists the current value first and removes duplicates', async () => {
    await open('gpt-4.1', ['gpt-4o', 'gpt-4.1', 'gpt-4o', '', 'o3'])
    expect(names()).toEqual(['gpt-4.1', 'gpt-4o', 'o3'])
  })

  it('filters while typing', async () => {
    await open('gpt-4.1', ['gpt-4o', 'o3'])
    await type('GPT-4O')
    expect(names()).toEqual(['gpt-4o'])
  })

  it('offers a Use entry for a novel id and emits the typed id', async () => {
    await open('gpt-4.1', ['gpt-4o'])
    await type('  my-custom-model ')
    expect(names()[0]).toContain('Use “my-custom-model”')
    optionEls()[0]!.click()
    await flush()
    expect(wrapper!.emitted('update:modelValue')).toEqual([['my-custom-model']])
    expect(optionEls()).toHaveLength(0)
  })

  it('emits an existing option when selected and closes', async () => {
    await open('gpt-4.1', ['gpt-4o', 'o3'])
    optionEls().find((o) => o.textContent!.includes('o3'))!.click()
    await flush()
    expect(wrapper!.emitted('update:modelValue')).toEqual([['o3']])
    expect(optionEls()).toHaveLength(0)
  })

  it('shows an empty state when there are no models and no query', async () => {
    await open('', [])
    expect(document.body.textContent).toContain('No discovered models yet.')
  })

  it('selects the custom entry with Enter', async () => {
    await open('', ['gpt-4o'])
    await type('brand-new')
    search().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await flush()
    expect(wrapper!.emitted('update:modelValue')).toEqual([['brand-new']])
  })

  it('closes on Escape and returns focus to the trigger', async () => {
    await open('gpt-4.1', ['gpt-4o'])
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flush()
    await new Promise((r) => setTimeout(r, 0))
    expect(optionEls()).toHaveLength(0)
    expect(document.activeElement).toBe(wrapper!.get('button[role="combobox"]').element)
  })
})
