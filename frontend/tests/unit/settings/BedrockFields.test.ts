import { afterEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import BedrockFields from '@/components/settings/BedrockFields.vue'
import type { ProviderConfig } from '@/settings/types'

let wrapper: VueWrapper | null = null
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

function make(config: ProviderConfig = {}) {
  wrapper = mount(BedrockFields, { attachTo: document.body, props: { config } })
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

describe('BedrockFields', () => {
  it.each([
    ['Model', 'BEDROCK_MODEL'],
    ['Region', 'BEDROCK_REGION'],
    ['Bedrock API key (optional)', 'BEDROCK_API_KEY'],
    ['AWS Access Key ID', 'BEDROCK_AWS_ACCESS_KEY_ID'],
    ['AWS Secret Access Key', 'BEDROCK_AWS_SECRET_ACCESS_KEY'],
    ['AWS Session Token', 'BEDROCK_AWS_SESSION_TOKEN'],
    ['AWS Profile Name', 'BEDROCK_PROFILE_NAME'],
  ])('%s emits set with %s', async (label, key) => {
    const w = make()
    await type(w, label, 'abc')
    expect(w.emitted('set')).toEqual([[key, 'abc']])
  })

  it('uses the ported placeholders', () => {
    const w = make()
    expect(inputFor(w, 'Model').placeholder).toBe('e.g. us.anthropic.claude-3-5-haiku-20241022-v1:0')
    expect(inputFor(w, 'Region').placeholder).toBe('e.g. us-east-1')
    expect(inputFor(w, 'Bedrock API key (optional)').placeholder).toBe('Use this OR AWS access keys below')
    expect(inputFor(w, 'AWS Access Key ID').placeholder).toBe('Use with AWS Secret Access Key')
    expect(inputFor(w, 'AWS Secret Access Key').placeholder).toBe('Use with AWS Access Key ID')
    expect(inputFor(w, 'AWS Session Token').placeholder).toBe('Optional')
    expect(inputFor(w, 'AWS Profile Name').placeholder).toBe('Optional')
  })

  it('keeps every secret field a password input and the others plain text', () => {
    const w = make({
      BEDROCK_API_KEY: 'sk-test-fake',
      BEDROCK_AWS_SECRET_ACCESS_KEY: 'sk-test-fake',
      BEDROCK_AWS_SESSION_TOKEN: 'sk-test-fake',
    })
    for (const label of ['Bedrock API key (optional)', 'AWS Secret Access Key', 'AWS Session Token']) {
      expect(inputFor(w, label).type).toBe('password')
    }
    for (const label of ['Model', 'Region', 'AWS Access Key ID', 'AWS Profile Name']) {
      expect(inputFor(w, label).type).toBe('text')
    }
  })

  it('explains the authentication choice', () => {
    expect(make().text()).toContain('Authentication: set either Bedrock API key, or AWS access key ID + secret key.')
  })

  it('hides session token and profile name in collapsed Advanced settings', () => {
    const w = make()
    const details = w.get('details')
    expect(details.text()).toContain('Advanced settings')
    expect((details.element as HTMLDetailsElement).open).toBe(false)
    expect(details.element.contains(inputFor(w, 'AWS Session Token'))).toBe(true)
    expect(details.element.contains(inputFor(w, 'AWS Profile Name'))).toBe(true)
    expect(details.element.contains(inputFor(w, 'AWS Secret Access Key'))).toBe(false)
  })

  it.each([['BEDROCK_AWS_SESSION_TOKEN'], ['BEDROCK_PROFILE_NAME']])('opens Advanced settings when %s has a value', (key) => {
    const w = make({ [key]: 'something' })
    expect((w.get('details').element as HTMLDetailsElement).open).toBe(true)
  })

  it('opens Advanced settings when a value arrives later', async () => {
    const w = make({})
    await w.setProps({ config: { BEDROCK_PROFILE_NAME: 'default' } })
    expect((w.get('details').element as HTMLDetailsElement).open).toBe(true)
  })
})
