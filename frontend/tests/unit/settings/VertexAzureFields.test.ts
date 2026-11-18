import { afterEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import VertexAzureFields from '@/components/settings/VertexAzureFields.vue'
import type { ProviderConfig } from '@/settings/types'

let wrapper: VueWrapper | null = null
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

function make(provider: 'vertex' | 'azure', config: ProviderConfig = {}) {
  wrapper = mount(VertexAzureFields, { attachTo: document.body, props: { provider, config } })
  return wrapper
}
function inputFor(w: VueWrapper, label: string) {
  const el = Array.from((w.element as HTMLElement).querySelectorAll<HTMLLabelElement>('label')).find((l) => l.textContent?.trim() === label)
  if (!el) throw new Error(`no label ${label}`)
  const input = (w.element as HTMLElement).querySelector<HTMLInputElement>(`#${CSS.escape(el.htmlFor)}`)
  if (!input) throw new Error(`no input for ${label}`)
  return input
}
async function type(w: VueWrapper, label: string, value: string) {
  const input = inputFor(w, label)
  input.value = value
  input.dispatchEvent(new Event('input'))
  await w.vm.$nextTick()
}

describe('VertexAzureFields: Vertex', () => {
  it.each([
    ['Vertex AI API key', 'VERTEX_API_KEY'],
    ['Model', 'VERTEX_MODEL'],
    ['Project ID', 'VERTEX_PROJECT'],
    ['Region', 'VERTEX_LOCATION'],
    ['Custom endpoint', 'VERTEX_BASE_URL'],
  ])('%s emits set with %s', async (label, key) => {
    const w = make('vertex')
    await type(w, label, 'abc')
    expect(w.emitted('set')).toEqual([[key, 'abc']])
  })

  it('uses the ported placeholders', () => {
    const w = make('vertex')
    expect(inputFor(w, 'Model').placeholder).toBe('e.g. gemini-2.5-flash')
    expect(inputFor(w, 'Region').placeholder).toBe('e.g. us-central1')
    expect(inputFor(w, 'Project ID').placeholder).toBe('Optional')
    expect(inputFor(w, 'Custom endpoint').placeholder).toBe('Optional')
  })

  it('renders the API key as a password field', () => {
    const w = make('vertex', { VERTEX_API_KEY: 'sk-test-fake' })
    const key = inputFor(w, 'Vertex AI API key')
    expect(key.type).toBe('password')
    expect(key.value).toBe('sk-test-fake')
  })

  it('keeps project, region and endpoint under collapsed Advanced settings', () => {
    const w = make('vertex', { VERTEX_MODEL: 'gemini-2.5-flash' })
    const details = w.get('details')
    expect(details.text()).toContain('Advanced settings')
    expect((details.element as HTMLDetailsElement).open).toBe(false)
    expect(details.element.contains(inputFor(w, 'Project ID'))).toBe(true)
    expect(details.element.contains(inputFor(w, 'Region'))).toBe(true)
    expect(details.element.contains(inputFor(w, 'Custom endpoint'))).toBe(true)
    // Key and model stay visible outside the collapsed section.
    expect(details.element.contains(inputFor(w, 'Vertex AI API key'))).toBe(false)
    expect(details.element.contains(inputFor(w, 'Model'))).toBe(false)
  })

  it.each([['VERTEX_PROJECT'], ['VERTEX_LOCATION'], ['VERTEX_BASE_URL']])('opens Advanced settings when %s has a value', (key) => {
    const w = make('vertex', { [key]: 'something' })
    expect((w.get('details').element as HTMLDetailsElement).open).toBe(true)
  })

  it('opens Advanced settings when a value arrives later', async () => {
    const w = make('vertex', {})
    await w.setProps({ config: { VERTEX_PROJECT: 'my-project' } })
    expect((w.get('details').element as HTMLDetailsElement).open).toBe(true)
  })

  it('shows no Azure fields', () => {
    const w = make('vertex')
    expect(w.text()).not.toContain('Azure endpoint')
    expect(w.text()).not.toContain('API version')
  })
})

describe('VertexAzureFields: Azure', () => {
  it.each([
    ['Azure OpenAI API key', 'AZURE_OPENAI_API_KEY'],
    ['Azure endpoint', 'AZURE_OPENAI_ENDPOINT'],
    ['Model name', 'AZURE_OPENAI_MODEL'],
    ['API version', 'AZURE_OPENAI_API_VERSION'],
  ])('%s emits set with %s', async (label, key) => {
    const w = make('azure')
    await type(w, label, 'abc')
    expect(w.emitted('set')).toEqual([[key, 'abc']])
  })

  it('uses the ported placeholders', () => {
    const w = make('azure')
    expect(inputFor(w, 'Azure endpoint').placeholder).toBe('https://your-resource.openai.azure.com')
    expect(inputFor(w, 'Model name').placeholder).toBe('e.g. gpt-5.4-mini')
    expect(inputFor(w, 'API version').placeholder).toBe('e.g. 2024-12-01-preview')
  })

  it('renders the API key as a password field and no Vertex fields or Advanced section', () => {
    const w = make('azure', { AZURE_OPENAI_API_KEY: 'sk-test-fake' })
    expect(inputFor(w, 'Azure OpenAI API key').type).toBe('password')
    expect(w.find('details').exists()).toBe(false)
    expect(w.text()).not.toContain('Project ID')
  })

  it('emits nothing on mount, even with legacy Azure values', () => {
    const legacy = { AZURE_OPENAI_DEPLOYMENT: 'my-deployment', AZURE_OPENAI_BASE_URL: 'https://legacy.test' }
    expect(make('azure', legacy).emitted('set')).toBeUndefined()
    wrapper?.unmount()
    expect(make('vertex', legacy).emitted('set')).toBeUndefined()
  })
})
