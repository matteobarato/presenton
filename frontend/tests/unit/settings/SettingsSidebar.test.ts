import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import SettingsSidebar from '@/components/settings/SettingsSidebar.vue'
import { SETTINGS_SECTIONS, type SettingsSection } from '@/settings/types'

let wrapper: VueWrapper | null = null

function mountSidebar(narrow: boolean, section: SettingsSection = 'images') {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: narrow && q.includes('max-width: 760px'),
    media: q,
    addEventListener() {},
    removeEventListener() {},
  }))
  wrapper = mount(SettingsSidebar, { props: { section, config: { LLM: 'openai', OPENAI_MODEL: 'gpt-4.1' } }, attachTo: document.body })
  return wrapper
}

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

describe('SettingsSidebar wide list', () => {
  it('is a nav of ordinary buttons, all in the natural tab order', () => {
    const w = mountSidebar(false)
    const nav = w.get('nav[aria-label="Settings sections"]')
    expect(w.find('[role="tablist"]').exists()).toBe(false)
    const buttons = nav.findAll('button')
    expect(buttons).toHaveLength(SETTINGS_SECTIONS.length)
    for (const b of buttons) {
      expect(b.attributes('tabindex')).toBeUndefined()
      expect(b.attributes('role')).toBeUndefined()
    }
    expect(buttons.map((b) => b.attributes('aria-current'))).toEqual([undefined, 'page', undefined, undefined])
    expect(nav.text()).toContain('OpenAI (gpt-4.1)')
  })

  it('emits select on click', async () => {
    const w = mountSidebar(false)
    await w.findAll('button')[3]!.trigger('click')
    expect(w.emitted('select')).toEqual([['account']])
  })
})

describe('SettingsSidebar narrow tablist', () => {
  it('exposes a horizontal tablist with roving tabindex', () => {
    const w = mountSidebar(true)
    const list = w.get('[role="tablist"]')
    expect(list.attributes('aria-orientation')).toBe('horizontal')
    const tabs = list.findAll('[role="tab"]')
    expect(tabs.map((t) => t.attributes('tabindex'))).toEqual(['-1', '0', '-1', '-1'])
    expect(tabs.map((t) => t.attributes('aria-selected'))).toEqual(['false', 'true', 'false', 'false'])
    expect(w.find('nav').exists()).toBe(false)
  })

  it('moves focus and selection with the arrow, Home and End keys', async () => {
    const w = mountSidebar(true)
    const tabs = w.findAll('[role="tab"]')
    const cases: Array<[SettingsSection, string, number, SettingsSection]> = [
      ['images', 'ArrowRight', 2, 'web-search'],
      ['images', 'ArrowLeft', 0, 'text'],
      ['images', 'Home', 0, 'text'],
      ['images', 'End', 3, 'account'],
      ['account', 'ArrowRight', 0, 'text'],
      ['text', 'ArrowLeft', 3, 'account'],
    ]
    for (const [from, key, focusIndex, expected] of cases) {
      await w.setProps({ section: from })
      w.emitted('select')?.splice(0)
      await tabs[SETTINGS_SECTIONS.indexOf(from)]!.trigger('keydown', { key })
      expect(w.emitted('select')).toEqual([[expected]])
      expect(document.activeElement).toBe(tabs[focusIndex]!.element)
    }
  })

  it('ignores other keys', async () => {
    const w = mountSidebar(true)
    await w.findAll('[role="tab"]')[1]!.trigger('keydown', { key: 'a' })
    expect(w.emitted('select')).toBeUndefined()
  })
})
