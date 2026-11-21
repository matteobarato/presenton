import { describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, ref } from 'vue'
import { mount } from '@vue/test-utils'
import PresenterSettings from '@/components/create/steps/PresenterSettings.vue'
import { provideDeckNarration, type DeckNarration } from '@/components/editor/inspector/narration/useDeckNarration'
import { provideDeckAvatars, type DeckAvatars } from '@/components/editor/inspector/video/useDeckAvatars'

function mountIt(portrait: unknown = null) {
  const setLanguage = vi.fn()
  const mutate = vi.fn()
  const narration = { languages: ref([{ code: 'en-US', name: 'English' }]), language: ref('en-US'), setLanguage }
  const avatars = { videos: ref({ portrait, videos: [] }), portraitMut: { isPending: ref(false), mutate } }
  const Host = defineComponent({
    setup() {
      provideDeckNarration(narration as unknown as DeckNarration)
      provideDeckAvatars(avatars as unknown as DeckAvatars)
      return () => h(PresenterSettings, { running: false, languageOk: true, avatarWork: true })
    },
  })
  void computed
  return { wrapper: mount(Host), setLanguage, mutate }
}

describe('PresenterSettings', () => {
  it('shows the language and portrait controls and saves a new portrait', async () => {
    const { wrapper, mutate } = mountIt()
    expect(wrapper.find('[data-testid="setup-language"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="setup-portrait"]').exists()).toBe(true)
    const input = wrapper.get('[data-testid="portrait-input"]')
    const file = new File(['x'], 'p.png', { type: 'image/png' })
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    await input.trigger('change')
    expect(mutate).toHaveBeenCalledWith(file)
  })
})
