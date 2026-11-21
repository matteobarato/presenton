import { beforeAll, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PresenterPicker from '@/components/create/PresenterPicker.vue'

beforeAll(() => {
  URL.createObjectURL = () => 'blob:x'
  URL.revokeObjectURL = () => {}
})

const png = () => new File(['x'], 'me.png', { type: 'image/png' })
async function pick(w: ReturnType<typeof mount>, file: File) {
  const input = w.get('[data-testid="portrait-input"]')
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
  await input.trigger('change')
}

describe('PresenterPicker', () => {
  it('sets the model for a valid photo', async () => {
    const w = mount(PresenterPicker, { props: { modelValue: null } })
    const f = png()
    await pick(w, f)
    expect(w.emitted('update:modelValue')?.[0]).toEqual([f])
  })
  it('emits error and keeps the model for an invalid file', async () => {
    const w = mount(PresenterPicker, { props: { modelValue: null } })
    await pick(w, new File(['x'], 'a.gif', { type: 'image/gif' }))
    expect(w.emitted('error')?.[0]?.[0]).toMatch(/JPEG, PNG or WebP/)
    expect(w.emitted('update:modelValue')).toBeUndefined()
  })
  it('shows the preview and clears on remove', async () => {
    const w = mount(PresenterPicker, { props: { modelValue: png() } })
    expect(w.find('img[alt="Presenter portrait"]').exists()).toBe(true)
    await w.get('button[aria-label="Remove portrait"]').trigger('click')
    expect(w.emitted('update:modelValue')?.[0]).toEqual([null])
  })
})
