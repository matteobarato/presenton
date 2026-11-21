import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import LanguagePicker from '@/components/create/LanguagePicker.vue'
import { LANGUAGES } from '@/lib/languages'

describe('LanguagePicker', () => {
  it('emits the chosen language', async () => {
    const w = mount(LanguagePicker, { props: { modelValue: LANGUAGES[0] } })
    await w.get('#opt-language').setValue(LANGUAGES[1])
    expect(w.emitted('update:modelValue')?.[0]).toEqual([LANGUAGES[1]])
  })
})
