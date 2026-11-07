import { afterEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import ColorField from '@/components/editor/inspector/controls/ColorField.vue'
import NumberField from '@/components/editor/inspector/controls/NumberField.vue'
import SliderField from '@/components/editor/inspector/controls/SliderField.vue'
import ToggleRow from '@/components/editor/inspector/controls/ToggleRow.vue'
import SegmentedControl from '@/components/editor/inspector/controls/SegmentedControl.vue'

let wrapper: VueWrapper | null = null
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

async function openColor(modelValue: string | null = '#112233') {
  wrapper = mount(ColorField, { attachTo: document.body, props: { modelValue, palette: ['#ff0000', '#00ff00'], label: 'Fill' } })
  await wrapper.get('button[aria-label="Fill"]').trigger('click')
  await nextTick()
  await nextTick()
}
const body = () => document.body

describe('ColorField', () => {
  it('emits open, then commit once on swatch click', async () => {
    await openColor()
    expect(wrapper!.emitted('open')).toHaveLength(1)
    ;(body().querySelector('button[aria-label="#ff0000"]') as HTMLElement).click()
    await nextTick()
    await nextTick()
    expect(wrapper!.emitted('commit')).toEqual([['#ff0000']])
  })

  it('emits once on close after a hex edit', async () => {
    await openColor()
    const hex = body().querySelector('input[aria-label="Fill hex"]') as HTMLInputElement
    hex.value = '#abcdef'
    hex.dispatchEvent(new Event('input'))
    expect(wrapper!.emitted('commit')).toBeUndefined()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick()
    await nextTick()
    expect(wrapper!.emitted('commit')).toEqual([['#abcdef']])
  })

  it('emits nothing when closed unchanged', async () => {
    await openColor()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick()
    await nextTick()
    expect(wrapper!.emitted('commit')).toBeUndefined()
  })
})

describe('NumberField', () => {
  const mk = (props = {}) => (wrapper = mount(NumberField, { props: { modelValue: 5, label: 'Size', min: 0, max: 20, step: 2, ...props } }))
  it('commits typed values only on Enter', async () => {
    const w = mk()
    const input = w.get('input')
    await input.setValue('12')
    expect(w.emitted('commit')).toBeUndefined()
    await input.trigger('keydown', { key: 'Enter' })
    expect(w.emitted('commit')).toEqual([[12]])
  })
  it('Shift+ArrowUp adds ten steps and clamps', async () => {
    const w = mk({ max: 100 })
    await w.get('input').trigger('keydown', { key: 'ArrowUp', shiftKey: true })
    expect(w.emitted('commit')).toEqual([[25]])
  })
  it('clamps to max and does not emit when unchanged', async () => {
    const w = mk()
    await w.get('input').setValue('99')
    await w.get('input').trigger('blur')
    expect(w.emitted('commit')).toEqual([[20]])
    await w.setProps({ modelValue: 20 })
    await w.get('input').trigger('blur')
    expect(w.emitted('commit')).toHaveLength(1)
  })
  it('emits focus', async () => {
    const w = mk()
    await w.get('input').trigger('focus')
    expect(w.emitted('focus')).toHaveLength(1)
  })
})

describe('SliderField', () => {
  it('emits on change only, not input', async () => {
    wrapper = mount(SliderField, { props: { modelValue: 10, label: 'Opacity', min: 0, max: 100 } })
    const range = wrapper.get('input[type="range"]')
    ;(range.element as HTMLInputElement).value = '40'
    await range.trigger('input')
    expect(wrapper.emitted('commit')).toBeUndefined()
    await range.trigger('change')
    expect(wrapper.emitted('commit')).toEqual([[40]])
  })
})

describe('SliderField focus', () => {
  it('emits focus on native focus (keyboard) and on pointerdown', async () => {
    wrapper = mount(SliderField, { props: { modelValue: 10, label: 'Opacity', min: 0, max: 100 } })
    const range = wrapper.get('input[type="range"]')
    await range.trigger('focus')
    await range.trigger('pointerdown')
    expect(wrapper.emitted('focus')).toHaveLength(2)
  })
})

describe('ToggleRow', () => {
  it('renders the slot only when on and toggles', async () => {
    wrapper = mount(ToggleRow, { props: { modelValue: false, label: 'Shadow' }, slots: { default: '<p id="s">x</p>' } })
    expect(wrapper.find('#s').exists()).toBe(false)
    expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe('false')
    await wrapper.get('[role="switch"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([[true]])
    await wrapper.setProps({ modelValue: true })
    expect(wrapper.find('#s').exists()).toBe(true)
  })
})

describe('SegmentedControl', () => {
  it('marks the active option and emits', async () => {
    wrapper = mount(SegmentedControl, { props: { modelValue: 'a', label: 'Mode', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] } })
    expect(wrapper.get('[role="group"]').attributes('aria-label')).toBe('Mode')
    expect(wrapper.get('button[aria-label="A"]').attributes('aria-pressed')).toBe('true')
    await wrapper.get('button[aria-label="B"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([['b']])
  })
})
