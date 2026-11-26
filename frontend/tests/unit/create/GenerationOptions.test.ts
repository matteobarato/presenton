import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import GenerationOptions from '@/components/create/GenerationOptions.vue'
import type { CreateOptions } from '@/components/create/options'

const base: CreateOptions = {
  slides: '', images: '', videos: '', language: 'English', tone: 'default', verbosity: 'standard',
  instructions: '', includeTitleSlide: false, includeTableOfContents: false, webSearch: false, animate: true,
}
const videos = (w: ReturnType<typeof mount>) => w.get('[aria-label="Presenter video count"]')

describe('GenerationOptions videos', () => {
  it('is None and disabled without a photo', () => {
    const w = mount(GenerationOptions, { props: { modelValue: base, hasPhoto: false } })
    const radios = videos(w).findAll('[role="radio"]')
    expect(radios.find((r) => r.attributes('aria-checked') === 'true')?.text()).toBe('None')
    expect(radios.every((r) => r.attributes('disabled') !== undefined)).toBe(true)
    expect((w.get('#opt-videos').element as HTMLInputElement).disabled).toBe(true)
    expect(w.text()).toContain('Add a presenter photo to choose')
  })
  it('works as before with a photo', async () => {
    const w = mount(GenerationOptions, { props: { modelValue: base, hasPhoto: true } })
    const radios = videos(w).findAll('[role="radio"]')
    expect(radios[0]!.attributes('disabled')).toBeUndefined()
    await radios[2]!.trigger('click')
    expect((w.emitted('update:modelValue')![0]![0] as CreateOptions).videos).toBe('1')
  })
  it('has no language select', () => {
    expect(mount(GenerationOptions, { props: { modelValue: base, hasPhoto: true } }).find('#opt-language').exists()).toBe(false)
  })
  it('caps the count and hides presets above max-videos', async () => {
    const w = mount(GenerationOptions, { props: { modelValue: base, hasPhoto: true, maxVideos: 4 } })
    const labels = videos(w).findAll('[role="radio"]').map((r) => r.text())
    expect(labels).toEqual(['Auto', 'None', '1', '3'])
    await w.get('#opt-videos').setValue('9')
    expect((w.emitted('update:modelValue')!.at(-1)![0] as CreateOptions).videos).toBe('4')
  })
})
