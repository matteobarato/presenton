import { afterEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import SecretInput from '@/components/settings/SecretInput.vue'

let wrapper: VueWrapper | null = null
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})
const make = (props: Record<string, unknown> = {}) => {
  wrapper = mount(SecretInput, { attachTo: document.body, props: { modelValue: 'sk-test-fake', label: 'OpenAI API key', ...props } })
  return wrapper
}

describe('SecretInput', () => {
  it('is a password field with autocomplete off by default', () => {
    const input = make().get('input')
    expect(input.attributes('type')).toBe('password')
    expect(input.attributes('autocomplete')).toBe('off')
    expect((input.element as HTMLInputElement).value).toBe('sk-test-fake')
  })

  it('toggles between password and text and updates the aria-label', async () => {
    const w = make()
    const btn = w.get('button')
    expect(btn.attributes('type')).toBe('button')
    expect(btn.attributes('aria-label')).toBe('Show API key')
    await btn.trigger('click')
    expect(w.get('input').attributes('type')).toBe('text')
    expect(w.get('button').attributes('aria-label')).toBe('Hide API key')
    await w.get('button').trigger('click')
    expect(w.get('input').attributes('type')).toBe('password')
    expect(w.get('button').attributes('aria-label')).toBe('Show API key')
  })

  it('emits the typed value', async () => {
    const w = make({ modelValue: '' })
    await w.get('input').setValue('sk-ant-test-fake')
    expect(w.emitted('update:modelValue')).toEqual([['sk-ant-test-fake']])
  })

  it('shows (optional) only when asked and not already present', () => {
    expect(make().get('label').text()).toBe('OpenAI API key')
    wrapper!.unmount()
    expect(make({ optional: true }).get('label').text()).toBe('OpenAI API key (optional)')
    wrapper!.unmount()
    expect(make({ optional: true, label: 'Token (optional)' }).get('label').text()).toBe('Token (optional)')
  })

  it('associates the label with the input, generating a unique id per instance', () => {
    const a = make()
    const id = a.get('input').attributes('id')
    expect(id).toBeTruthy()
    expect(a.get('label').attributes('for')).toBe(id)
    // Two instances in one app (as in a settings section) must not share an id.
    const both = mount({
      components: { SecretInput },
      template: '<div><SecretInput model-value="" label="A" /><SecretInput model-value="" label="B" /></div>',
    })
    const ids = both.findAll('input').map((i) => i.attributes('id'))
    expect(new Set(ids).size).toBe(2)
    both.unmount()
  })

  it('uses a passed id', () => {
    const w = make({ id: 'my-key' })
    expect(w.get('input').attributes('id')).toBe('my-key')
    expect(w.get('label').attributes('for')).toBe('my-key')
  })

  it('never renders the value outside the input value', () => {
    const w = make()
    expect(w.html()).not.toContain('sk-test-fake')
    expect(w.text()).not.toContain('sk-test-fake')
  })
})
