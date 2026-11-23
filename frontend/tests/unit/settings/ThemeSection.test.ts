import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import ThemeSection from '@/components/settings/ThemeSection.vue'
import { initTheme, useTheme } from '@/composables/useTheme'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.className = ''
  initTheme()
  useTheme().setPreference('system')
})

describe('ThemeSection', () => {
  it('renders Dark, Light and System and marks the current one', () => {
    const w = mount(ThemeSection)
    const radios = w.findAll('[role="radio"]')
    expect(radios.map((r) => r.text())).toEqual(['Dark', 'Light', 'System'])
    expect(radios.map((r) => r.attributes('aria-checked'))).toEqual(['false', 'false', 'true'])
  })

  it('calls setPreference when an option is clicked', async () => {
    const w = mount(ThemeSection)
    await w.findAll('[role="radio"]')[1]!.trigger('click')
    expect(useTheme().preference.value).toBe('light')
    expect(document.documentElement.classList.contains('light')).toBe(true)
    expect(w.findAll('[role="radio"]')[1]!.attributes('aria-checked')).toBe('true')
  })
})
