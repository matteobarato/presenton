import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, ref, type Ref } from 'vue'
import { QueryClient, useQuery, VueQueryPlugin } from '@tanstack/vue-query'
import type { Presentation } from '@/api/types'
import { createPinia, setActivePinia } from 'pinia'
import { useTtsLanguage } from '@/composables/useTtsLanguage'
import SlideStatusDots from '@/components/editor/SlideStatusDots.vue'

const m = vi.hoisted(() => ({ ttsLanguages: [] as string[] }))
// The real list starts with Italian.
vi.mock('@/api/tts', async (orig) => ({
  ...(await orig<typeof import('@/api/tts')>()),
  listTtsLanguages: async () => [
    { code: 'it-IT', name: 'Italian' },
    { code: 'en-US', name: 'English' },
    { code: 'fr-FR', name: 'French' },
  ],
  useTts: (_id: Ref<string>, lang: Ref<string>) =>
    useQuery({
      queryKey: () => ['tts-probe', lang.value],
      queryFn: async () => (m.ttsLanguages.push(lang.value), { audios: [] }),
      enabled: () => Boolean(lang.value),
    }),
}))
vi.mock('@/api/presentations', () => ({
  usePresentation: (id: Ref<string>) =>
    useQuery({ queryKey: () => ['presentation', id.value], queryFn: async () => ({ id: id.value, language: 'English', slides: [] }) }),
}))
vi.mock('@/api/videos', async (orig) => ({ ...(await orig<typeof import('@/api/videos')>()), getVideos: async () => ({ videos: [] }) }))

const deckOf = (language: string) => ({ id: 'x', language, slides: [] }) as unknown as Presentation
const plugin = () => [[VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]] as never

function useIn(id: string, language: string) {
  let api!: ReturnType<typeof useTtsLanguage>
  const wrapper = mount(
    defineComponent({
      setup() {
        api = useTtsLanguage(ref(id), ref(deckOf(language)))
        return () => h('div')
      },
    }),
    { global: { plugins: plugin() } },
  )
  return { api, wrapper }
}

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  m.ttsLanguages.length = 0
})

describe('useTtsLanguage', () => {
  it('defaults an English deck to English, not the first (Italian) list entry', async () => {
    const { api } = useIn('deck-en', 'English')
    await flushPromises()
    expect(api.language.value).toBe('en-US')
  })

  it('matches the deck language by code too, case-insensitively', async () => {
    const { api } = useIn('deck-fr', 'fr-fr')
    await flushPromises()
    expect(api.language.value).toBe('fr-FR')
  })

  it('falls back to the last language used anywhere, then to English', async () => {
    localStorage.setItem('presenton.tts.lang', 'fr-FR')
    const a = useIn('deck-x2', 'Klingon')
    await flushPromises()
    expect(a.api.language.value).toBe('fr-FR')
    localStorage.clear()
    const b = useIn('deck-x3', 'Klingon')
    await flushPromises()
    expect(b.api.language.value).toBe('en-US')
  })

  it('keeps a separate language per deck and also records the last used one', async () => {
    const one = useIn('deck-1', 'English')
    const two = useIn('deck-2', 'English')
    await flushPromises()
    one.api.setLanguage('fr-FR')
    two.api.setLanguage('it-IT')
    expect(one.api.language.value).toBe('fr-FR')
    expect(two.api.language.value).toBe('it-IT')
    expect(localStorage.getItem('presenton.tts.lang.deck-1')).toBe('fr-FR')
    expect(localStorage.getItem('presenton.tts.lang.deck-2')).toBe('it-IT')
    expect(localStorage.getItem('presenton.tts.lang')).toBe('it-IT')
  })

  it('makes the slide status dots follow a change made elsewhere on the page', async () => {
    const dots = mount(SlideStatusDots, { props: { presentationId: 'deck-dots', slideIndex: 0 }, global: { plugins: plugin() } })
    await flushPromises()
    expect(m.ttsLanguages).toEqual(['en-US'])
    const other = useIn('deck-dots', 'English')
    other.api.setLanguage('fr-FR')
    await flushPromises()
    expect(m.ttsLanguages).toEqual(['en-US', 'fr-FR'])
    dots.unmount()
  })
})
