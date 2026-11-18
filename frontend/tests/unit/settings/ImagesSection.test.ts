import { afterEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import ImagesSection from '@/components/settings/ImagesSection.vue'
import { IMAGE_PROVIDERS } from '@/settings/providers'
import type { ProviderConfig } from '@/settings/types'

const FAKE_KEY = 'sk-test-fake'
let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

function mountSection(config: ProviderConfig) {
  wrapper = mount(ImagesSection, { attachTo: document.body, props: { config } })
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
  fields: { label: string; key: string; secret?: boolean; textarea?: boolean; placeholder?: string }[]
  quality?: { label: string; key: string; shown: string }
  link?: boolean
}
const key = (provider: string) => IMAGE_PROVIDERS.find((p) => p.value === provider)!
const CASES: Case[] = [
  { provider: 'pexels', link: true, fields: [{ label: 'Pexels API Key', key: 'PEXELS_API_KEY', secret: true }] },
  { provider: 'pixabay', link: true, fields: [{ label: 'Pixabay API Key', key: 'PIXABAY_API_KEY', secret: true }] },
  {
    provider: 'dall-e-3',
    link: true,
    fields: [{ label: 'OpenAI API Key', key: 'OPENAI_API_KEY', secret: true }],
    quality: { label: 'DALL·E 3 Image Quality', key: 'DALL_E_3_QUALITY', shown: 'standard' },
  },
  {
    provider: 'gpt-image-1.5',
    link: true,
    fields: [{ label: 'OpenAI API Key', key: 'OPENAI_API_KEY', secret: true }],
    quality: { label: 'GPT Image 1.5 Quality', key: 'GPT_IMAGE_1_5_QUALITY', shown: 'low' },
  },
  { provider: 'gemini_flash', link: true, fields: [{ label: 'Google API Key', key: 'GOOGLE_API_KEY', secret: true }] },
  { provider: 'nanobanana_pro', link: true, fields: [{ label: 'Google API Key', key: 'GOOGLE_API_KEY', secret: true }] },
  {
    provider: 'comfyui',
    fields: [
      { label: 'ComfyUI Server URL', key: 'COMFYUI_URL', placeholder: 'http://192.168.1.7:8188' },
      {
        label: 'Workflow JSON',
        key: 'COMFYUI_WORKFLOW',
        textarea: true,
        placeholder: 'Paste your ComfyUI workflow JSON here (export via "Export (API)" in ComfyUI)',
      },
    ],
  },
  {
    provider: 'open_webui',
    fields: [
      { label: 'Open WebUI URL', key: 'OPEN_WEBUI_IMAGE_URL', placeholder: 'http://localhost:3000/api/v1' },
      { label: 'API Key (optional)', key: 'OPEN_WEBUI_IMAGE_API_KEY', secret: true },
    ],
  },
  {
    provider: 'openai_compatible',
    fields: [
      { label: 'OpenAI Compatible URL', key: 'OPENAI_COMPAT_IMAGE_BASE_URL' },
      { label: 'OpenAI Compatible API Key', key: 'OPENAI_COMPAT_IMAGE_API_KEY', secret: true },
      { label: 'Image model id', key: 'OPENAI_COMPAT_IMAGE_MODEL', placeholder: 'e.g. dall-e-3, gpt-image-1' },
    ],
  },
]

describe('ImagesSection', () => {
  it('covers every provider row', () => {
    expect(CASES.map((c) => c.provider).sort()).toEqual(IMAGE_PROVIDERS.map((p) => p.value).sort())
  })

  it.each(CASES)('renders exactly the fields for $provider and emits the right keys', async (c) => {
    const w = mountSection({ LLM: 'openai', IMAGE_PROVIDER: c.provider })
    const expected = ['Generate images', 'Image provider', ...c.fields.map((f) => (f.label)), ...(c.quality ? [c.quality.label] : [])]
    expect(labels(w).sort()).toEqual(expected.sort())

    for (const f of c.fields) {
      const el = controlFor(w, f.label)
      expect(el.element.tagName).toBe(f.textarea ? 'TEXTAREA' : 'INPUT')
      if (f.secret) expect(el.attributes('type')).toBe('password')
      else if (!f.textarea) expect(el.attributes('type')).toBe('text')
      if (f.placeholder) expect(el.attributes('placeholder')).toBe(f.placeholder)
      await el.setValue(`value-for-${f.key}`)
      expect(w.emitted('set')!.at(-1)).toEqual([f.key, `value-for-${f.key}`])
    }

    expect(w.find('select').exists()).toBe(!!c.quality)
    expect(w.findAll('textarea').length).toBe(c.fields.filter((f) => f.textarea).length)
    const link = w.find('a[href]')
    expect(link.exists()).toBe(!!c.link)
    if (c.link) {
      expect(link.text()).toBe('Get an API key')
      expect(link.attributes('href')).toBe(key(c.provider).getApiKeyUrl)
      expect(link.attributes('rel')).toContain('noopener')
    }
  })

  it('never renders a secret as text', () => {
    const w = mountSection({
      LLM: 'openai',
      IMAGE_PROVIDER: 'openai_compatible',
      OPENAI_COMPAT_IMAGE_API_KEY: FAKE_KEY,
    })
    expect(w.get<HTMLInputElement>('input[type="password"]').element.value).toBe(FAKE_KEY)
    expect(w.text()).not.toContain(FAKE_KEY)
  })

  it('shows quality defaults without emitting them', () => {
    const dalle = mountSection({ IMAGE_PROVIDER: 'dall-e-3' })
    expect(dalle.get<HTMLSelectElement>('select').element.value).toBe('standard')
    expect(dalle.emitted('set')).toBeUndefined()
    dalle.unmount()
    const gpt = mountSection({ IMAGE_PROVIDER: 'gpt-image-1.5' })
    expect(gpt.get<HTMLSelectElement>('select').element.value).toBe('low')
    expect(gpt.emitted('set')).toBeUndefined()
  })

  it('shows and changes a stored quality', async () => {
    const w = mountSection({ IMAGE_PROVIDER: 'dall-e-3', DALL_E_3_QUALITY: 'hd' })
    expect(w.get<HTMLSelectElement>('select').element.value).toBe('hd')
    expect(w.findAll('option').map((o) => o.text())).toEqual(['Standard', 'HD'])
    await w.get('select').setValue('standard')
    expect(w.emitted('set')).toEqual([['DALL_E_3_QUALITY', 'standard']])
    w.unmount()
    const g = mountSection({ IMAGE_PROVIDER: 'gpt-image-1.5' })
    expect(g.findAll('option').map((o) => o.text())).toEqual(['Low', 'Medium', 'High'])
    await g.get('select').setValue('high')
    expect(g.emitted('set')).toEqual([['GPT_IMAGE_1_5_QUALITY', 'high']])
  })

  it('does not emit anything when merely viewed', async () => {
    const w = mountSection({ LLM: 'openai', IMAGE_PROVIDER: 'comfyui', COMFYUI_URL: 'http://x' })
    await nextTick()
    await w.setProps({ config: { LLM: 'openai', IMAGE_PROVIDER: 'pexels' } })
    expect(w.emitted('set')).toBeUndefined()
  })

  it('reflects the shared OpenAI and Google keys across providers', async () => {
    const w = mountSection({ IMAGE_PROVIDER: 'dall-e-3', OPENAI_API_KEY: FAKE_KEY })
    expect(controlFor(w, 'OpenAI API Key').element.value).toBe(FAKE_KEY)
    await w.setProps({ config: { IMAGE_PROVIDER: 'gpt-image-1.5', OPENAI_API_KEY: FAKE_KEY } })
    expect(controlFor(w, 'OpenAI API Key').element.value).toBe(FAKE_KEY)
    await w.setProps({ config: { IMAGE_PROVIDER: 'gemini_flash', GOOGLE_API_KEY: 'g-test-fake' } })
    expect(controlFor(w, 'Google API Key').element.value).toBe('g-test-fake')
    await w.setProps({ config: { IMAGE_PROVIDER: 'nanobanana_pro', GOOGLE_API_KEY: 'g-test-fake' } })
    expect(controlFor(w, 'Google API Key').element.value).toBe('g-test-fake')
  })

  it('keeps other providers values when switching A to B to A', async () => {
    const w = mountSection({ IMAGE_PROVIDER: 'pexels', PEXELS_API_KEY: FAKE_KEY })
    await openPicker(w)
    await pick('Pixabay')
    expect(w.emitted('set')).toEqual([['IMAGE_PROVIDER', 'pixabay']])
    await w.setProps({ config: { IMAGE_PROVIDER: 'pixabay', PEXELS_API_KEY: FAKE_KEY } })
    await openPicker(w)
    await pick('Pexels')
    expect(w.emitted('set')!.at(-1)).toEqual(['IMAGE_PROVIDER', 'pexels'])
    await w.setProps({ config: { IMAGE_PROVIDER: 'pexels', PEXELS_API_KEY: FAKE_KEY } })
    expect(controlFor(w, 'Pexels API Key').element.value).toBe(FAKE_KEY)
    expect(w.emitted('set')!.every(([f]) => f === 'IMAGE_PROVIDER')).toBe(true)
  })

  it('lists the nine providers in the picker', async () => {
    const w = mountSection({})
    await openPicker(w)
    expect(options().map((o) => o.textContent)).toEqual(
      expect.arrayContaining(IMAGE_PROVIDERS.map((p) => expect.stringContaining(p.label))),
    )
    expect(options()).toHaveLength(IMAGE_PROVIDERS.length)
  })

  it('renders an empty config with the picker placeholder and no provider fields', () => {
    const w = mountSection({})
    expect(w.get('button[role="combobox"]').text()).toContain('Select image provider')
    expect(w.find('input').exists()).toBe(false)
    expect(w.find('select').exists()).toBe(false)
    expect(w.find('textarea').exists()).toBe(false)
    expect(w.emitted('set')).toBeUndefined()
  })

  it('renders an unknown provider as the placeholder without crashing', () => {
    const w = mountSection({ IMAGE_PROVIDER: 'removed-provider' })
    expect(w.get('button[role="combobox"]').text()).toContain('Select image provider')
    expect(w.find('input').exists()).toBe(false)
  })

  it('selecting a provider emits only IMAGE_PROVIDER', async () => {
    const w = mountSection({})
    await openPicker(w)
    await pick('ComfyUI')
    expect(w.emitted('set')).toEqual([['IMAGE_PROVIDER', 'comfyui']])
  })

  it('has a labelled, keyboard operable switch that is on by default', async () => {
    const w = mountSection({ IMAGE_PROVIDER: 'pexels' })
    const sw = w.get('[role="switch"]')
    expect(sw.attributes('aria-checked')).toBe('true')
    expect(controlFor(w, 'Generate images').element).toBe(sw.element)
    await sw.trigger('click')
    expect(w.emitted('set')).toEqual([['DISABLE_IMAGE_GENERATION', true]])
  })

  it('switching off hides the provider controls and leaves only the switch', async () => {
    const w = mountSection({ IMAGE_PROVIDER: 'comfyui', DISABLE_IMAGE_GENERATION: true })
    const sw = w.get('[role="switch"]')
    expect(sw.attributes('aria-checked')).toBe('false')
    expect(w.find('button[role="combobox"]').exists()).toBe(false)
    expect(w.find('input').exists()).toBe(false)
    expect(w.find('textarea').exists()).toBe(false)
    await sw.trigger('click')
    expect(w.emitted('set')).toEqual([['DISABLE_IMAGE_GENERATION', false]])
  })

  it('shows only the managed notice for Presenton Cloud', () => {
    const w = mountSection({ LLM: 'presenton', IMAGE_PROVIDER: 'pexels', DISABLE_IMAGE_GENERATION: false })
    expect(w.text()).toContain('Managed by Presenton Cloud')
    expect(w.find('[role="switch"]').exists()).toBe(false)
    expect(w.find('button[role="combobox"]').exists()).toBe(false)
    expect(w.find('input').exists()).toBe(false)
    expect(w.find('select').exists()).toBe(false)
    expect(w.find('textarea').exists()).toBe(false)
    expect(w.emitted('set')).toBeUndefined()
  })
})
