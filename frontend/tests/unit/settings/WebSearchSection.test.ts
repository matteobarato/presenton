import { afterEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import WebSearchSection from '@/components/settings/WebSearchSection.vue'
import { WEB_SEARCH_PROVIDERS } from '@/settings/providers'
import type { ProviderConfig } from '@/settings/types'

const FAKE_KEY = 'sk-test-fake'
let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

function mountSection(config: ProviderConfig) {
  wrapper = mount(WebSearchSection, { attachTo: document.body, props: { config } })
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
function controlFor(w: VueWrapper, labelText: string) {
  const label = w.findAll('label').find((l) => l.text() === labelText)
  if (!label) throw new Error(`no label ${labelText}`)
  const el = w.find<HTMLInputElement>(`#${CSS.escape(label.attributes('for') ?? '')}`)
  if (!el.exists()) throw new Error(`label ${labelText} points at nothing`)
  return el
}
const labels = (w: VueWrapper) => w.findAll('label').map((l) => l.text())

interface Case {
  provider: string
  field?: { label: string; key: string; secret?: boolean; placeholder?: string }
}
const CASES: Case[] = [
  { provider: 'auto' },
  { provider: 'searxng', field: { label: 'SearXNG base URL', key: 'SEARXNG_BASE_URL', placeholder: 'https://search.example.com' } },
  { provider: 'tavily', field: { label: 'Tavily API key', key: 'TAVILY_API_KEY', secret: true } },
  { provider: 'exa', field: { label: 'Exa API key', key: 'EXA_API_KEY', secret: true } },
  { provider: 'brave', field: { label: 'Brave Search API key', key: 'BRAVE_SEARCH_API_KEY', secret: true } },
]

describe('WebSearchSection', () => {
  it('covers every provider row', () => {
    expect(CASES.map((c) => c.provider).sort()).toEqual(WEB_SEARCH_PROVIDERS.map((p) => p.value).sort())
  })

  it.each(CASES)('renders exactly the fields for $provider and emits the right keys', async (c) => {
    const w = mountSection({ LLM: 'openai', WEB_GROUNDING: true, WEB_SEARCH_PROVIDER: c.provider })
    const expected = ['Web search', 'Web search provider', ...(c.field ? [c.field.label, 'Maximum results'] : [])]
    expect(labels(w).sort()).toEqual(expected.sort())

    if (c.field) {
      const el = controlFor(w, c.field.label)
      expect(el.element.tagName).toBe('INPUT')
      expect(el.attributes('type')).toBe(c.field.secret ? 'password' : 'text')
      if (c.field.placeholder) expect(el.attributes('placeholder')).toBe(c.field.placeholder)
      await el.setValue(`value-for-${c.field.key}`)
      expect(w.emitted('set')!.at(-1)).toEqual([c.field.key, `value-for-${c.field.key}`])
      expect(w.findAll('input[type="password"]').length).toBe(c.field.secret ? 1 : 0)
    } else {
      expect(w.find('input').exists()).toBe(false)
      expect(w.text()).toContain('Model-native web grounding is preferred when available.')
    }
  })

  it('never renders a secret as text', () => {
    const w = mountSection({ WEB_GROUNDING: true, WEB_SEARCH_PROVIDER: 'tavily', TAVILY_API_KEY: FAKE_KEY })
    expect(w.get<HTMLInputElement>('input[type="password"]').element.value).toBe(FAKE_KEY)
    expect(w.text()).not.toContain(FAKE_KEY)
  })

  it('has a labelled switch whose toggle emits WEB_GROUNDING only when a provider is already set', async () => {
    const w = mountSection({ WEB_GROUNDING: true, WEB_SEARCH_PROVIDER: 'tavily' })
    const sw = w.get('[role="switch"]')
    expect(sw.attributes('aria-checked')).toBe('true')
    expect(controlFor(w, 'Web search').element).toBe(sw.element)
    await sw.trigger('click')
    expect(w.emitted('set')).toEqual([['WEB_GROUNDING', false]])
  })

  it('turning the switch on without a valid provider also defaults the provider to auto', async () => {
    for (const config of [{}, { WEB_GROUNDING: false }, { WEB_GROUNDING: false, WEB_SEARCH_PROVIDER: 'removed-provider' }]) {
      const w = mountSection(config)
      expect(w.get('[role="switch"]').attributes('aria-checked')).toBe('false')
      await w.get('[role="switch"]').trigger('click')
      expect(w.emitted('set')).toEqual([
        ['WEB_GROUNDING', true],
        ['WEB_SEARCH_PROVIDER', 'auto'],
      ])
      w.unmount()
    }
  })

  it('turning the switch on keeps an existing valid provider', async () => {
    const w = mountSection({ WEB_GROUNDING: false, WEB_SEARCH_PROVIDER: 'brave' })
    await w.get('[role="switch"]').trigger('click')
    expect(w.emitted('set')).toEqual([['WEB_GROUNDING', true]])
  })

  it('hides every provider control when web search is off', () => {
    const w = mountSection({ WEB_GROUNDING: false, WEB_SEARCH_PROVIDER: 'tavily', TAVILY_API_KEY: FAKE_KEY })
    expect(w.get('[role="switch"]').attributes('aria-checked')).toBe('false')
    expect(w.find('button[role="combobox"]').exists()).toBe(false)
    expect(w.find('input').exists()).toBe(false)
    expect(w.emitted('set')).toBeUndefined()
  })

  it('shows the default max results of 5 without emitting it', async () => {
    const w = mountSection({ WEB_GROUNDING: true, WEB_SEARCH_PROVIDER: 'exa' })
    await nextTick()
    const input = controlFor(w, 'Maximum results')
    expect(input.attributes('type')).toBe('number')
    expect(input.element.value).toBe('5')
    expect(w.emitted('set')).toBeUndefined()
  })

  it('emits max results as a string, and an empty string when cleared', async () => {
    const w = mountSection({ WEB_GROUNDING: true, WEB_SEARCH_PROVIDER: 'exa', WEB_SEARCH_MAX_RESULTS: '3' })
    const input = controlFor(w, 'Maximum results')
    expect(input.element.value).toBe('3')
    await input.setValue('8')
    expect(w.emitted('set')!.at(-1)).toEqual(['WEB_SEARCH_MAX_RESULTS', '8'])
    await input.setValue('')
    expect(w.emitted('set')!.at(-1)).toEqual(['WEB_SEARCH_MAX_RESULTS', ''])
    expect(typeof w.emitted('set')!.at(-1)![1]).toBe('string')
  })

  it('keeps a cleared max results empty instead of snapping back to 5', () => {
    const w = mountSection({ WEB_GROUNDING: true, WEB_SEARCH_PROVIDER: 'exa', WEB_SEARCH_MAX_RESULTS: '' })
    const input = controlFor(w, 'Maximum results')
    expect(input.element.value).toBe('')
    expect(input.attributes('placeholder')).toBe('5')
  })

  it('does not emit anything when merely viewed', async () => {
    const w = mountSection({ WEB_GROUNDING: true, WEB_SEARCH_PROVIDER: 'searxng', SEARXNG_BASE_URL: 'http://x' })
    await nextTick()
    await w.setProps({ config: { WEB_GROUNDING: true, WEB_SEARCH_PROVIDER: 'brave' } })
    await w.setProps({ config: {} })
    expect(w.emitted('set')).toBeUndefined()
  })

  it('keeps other providers values when switching A to B to A', async () => {
    const w = mountSection({ WEB_GROUNDING: true, WEB_SEARCH_PROVIDER: 'tavily', TAVILY_API_KEY: FAKE_KEY })
    await openPicker(w)
    await pick('Exa')
    expect(w.emitted('set')).toEqual([['WEB_SEARCH_PROVIDER', 'exa']])
    await w.setProps({ config: { WEB_GROUNDING: true, WEB_SEARCH_PROVIDER: 'exa', TAVILY_API_KEY: FAKE_KEY } })
    await openPicker(w)
    await pick('Tavily')
    expect(w.emitted('set')!.at(-1)).toEqual(['WEB_SEARCH_PROVIDER', 'tavily'])
    await w.setProps({ config: { WEB_GROUNDING: true, WEB_SEARCH_PROVIDER: 'tavily', TAVILY_API_KEY: FAKE_KEY } })
    expect(controlFor(w, 'Tavily API key').element.value).toBe(FAKE_KEY)
    expect(w.emitted('set')!.every(([f]) => f === 'WEB_SEARCH_PROVIDER')).toBe(true)
  })

  it('lists the five providers in the picker', async () => {
    const w = mountSection({ WEB_GROUNDING: true })
    await openPicker(w)
    expect(options()).toHaveLength(WEB_SEARCH_PROVIDERS.length)
    expect(options().map((o) => o.textContent)).toEqual(
      expect.arrayContaining(WEB_SEARCH_PROVIDERS.map((p) => expect.stringContaining(p.label))),
    )
  })

  it('renders an empty config with the switch off and no crash', () => {
    const w = mountSection({})
    expect(w.get('[role="switch"]').attributes('aria-checked')).toBe('false')
    expect(w.find('input').exists()).toBe(false)
    expect(w.emitted('set')).toBeUndefined()
  })

  it('renders an empty provider with the picker placeholder when enabled', () => {
    const w = mountSection({ WEB_GROUNDING: true })
    expect(w.get('button[role="combobox"]').text()).toContain('Select web search provider')
    expect(w.find('input').exists()).toBe(false)
  })

  it('renders an unknown provider as the placeholder without crashing', () => {
    const w = mountSection({ WEB_GROUNDING: true, WEB_SEARCH_PROVIDER: 'removed-provider' })
    expect(w.get('button[role="combobox"]').text()).toContain('Select web search provider')
    expect(w.find('input').exists()).toBe(false)
    expect(w.emitted('set')).toBeUndefined()
  })

  it('selecting a provider emits only WEB_SEARCH_PROVIDER', async () => {
    const w = mountSection({ WEB_GROUNDING: true })
    await openPicker(w)
    await pick('SearXNG')
    expect(w.emitted('set')).toEqual([['WEB_SEARCH_PROVIDER', 'searxng']])
  })

  it('shows only the managed notice for Presenton Cloud', () => {
    const w = mountSection({ LLM: 'presenton', WEB_GROUNDING: true, WEB_SEARCH_PROVIDER: 'tavily' })
    expect(w.text()).toContain('Managed by Presenton Cloud')
    expect(w.find('[role="switch"]').exists()).toBe(false)
    expect(w.find('button[role="combobox"]').exists()).toBe(false)
    expect(w.find('input').exists()).toBe(false)
    expect(w.emitted('set')).toBeUndefined()
  })
})
