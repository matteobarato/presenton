import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { QueryClient, useQuery, VueQueryPlugin } from '@tanstack/vue-query'
import { defineComponent, h, ref, type Ref } from 'vue'
import { useTtsLanguage } from '@/composables/useTtsLanguage'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ApiError } from '@/api/errors'
import CreateDeckView from '@/views/CreateDeckView.vue'
import OutlineStep from '@/components/create/steps/OutlineStep.vue'

const m = vi.hoisted(() => ({
  getPresentation: vi.fn(),
  listTtsLanguages: vi.fn(),
  getTtsStatus: vi.fn(),
  getVideos: vi.fn(),
  getAvatarGeneration: vi.fn(),
  getAvatarPreview: vi.fn(),
  listTemplates: vi.fn(),
  outlineStream: vi.fn(),
  outlineStreaming: false,
  /** The slide stream fails at once (fatal), instead of never ending. */
  streamFails: false,
  toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() },
}))
// The hooks call their fetchers inside their own module, so the hooks themselves are swapped for
// ones that read the mocks under the real query keys.
vi.mock('@/api/presentations', async (orig) => {
  const real = await orig<typeof import('@/api/presentations')>()
  return {
    ...real,
    usePresentation: (id: Ref<string>) =>
      useQuery({ queryKey: () => real.presentationKeys.one(id.value), queryFn: () => m.getPresentation(id.value) }),
  }
})
vi.mock('@/api/tts', async (orig) => {
  const real = await orig<typeof import('@/api/tts')>()
  return {
    ...real,
    listTtsLanguages: m.listTtsLanguages,
    useTts: (id: Ref<string>, language: Ref<string>) =>
      useQuery({
        queryKey: () => real.ttsKeys.status(id.value, language.value),
        queryFn: () => m.getTtsStatus(id.value, language.value),
        enabled: () => Boolean(id.value && language.value),
      }),
  }
})
vi.mock('@/api/videos', async (orig) => ({
  ...(await orig<typeof import('@/api/videos')>()),
  getVideos: m.getVideos,
  getAvatarGeneration: m.getAvatarGeneration,
  getAvatarPreview: m.getAvatarPreview,
}))
vi.mock('@/api/templates', async (orig) => ({
  ...(await orig<typeof import('@/api/templates')>()),
  listTemplates: m.listTemplates,
}))
vi.mock('@/components/ui/sonner', () => ({ toast: m.toast }))
// The preview step streams the slides from the server; here that stream never ends (so `?stream=1` stays put),
// or fails at once when `m.streamFails` is set.
vi.mock('@/api/sse', () => ({
  streamEvents: async function* (_url: string, { signal }: { signal?: AbortSignal } = {}) {
    if (m.streamFails) {
      yield { type: 'error', detail: 'Boom', retryable: false }
      return
    }
    await new Promise<void>((resolve) => signal?.addEventListener('abort', () => resolve(), { once: true }))
    yield* []
  },
}))
// The outline step streams from the server; here it only needs a finished outline.
vi.mock('@/composables/useOutlineStream', async () => {
  const { ref } = await import('vue')
  return {
    useOutlineStream: (...args: unknown[]) => {
      m.outlineStream(...args)
      return {
        items: ref([{ content: 'One' }, { content: 'Two' }, { content: 'Three' }]),
        status: ref('Outline ready'),
        streaming: ref(m.outlineStreaming),
        error: ref(null),
        abort: () => {},
        retry: () => {},
      }
    },
  }
})

const slide = (i: number, placeholder: boolean) => ({
  id: `s${i}`,
  index: i,
  layout_group: 'modern',
  layout: 'l1',
  speaker_note: `Note ${i}`,
  content: {},
  ui: placeholder ? { layers: [{ video_placeholder: true }] } : {},
})

function deck(placeholders: boolean) {
  return {
    id: 'p1',
    content: 'Why octopuses are smarter than you think',
    n_slides: 3,
    language: 'English',
    tone: 'casual',
    verbosity: 'concise',
    generation_mode: 'standard',
    slides: [0, 1, 2].map((i) => slide(i, placeholders)),
  }
}

const audios = (n: number) => Array.from({ length: n }, (_, i) => ({ slide_id: `s${i}`, slide_index: i, text: `Note ${i}` }))
const videos = (n: number) => Array.from({ length: n }, (_, i) => ({ slide_id: `s${i}`, slide_index: i, url: `/v${i}.mp4` }))

async function mountView(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/p/:id/create/:step?', name: 'create', component: CreateDeckView },
      { path: '/p/:id', name: 'editor', component: { template: '<div />' } },
      { path: '/p/:id/present', name: 'present', component: { template: '<div />' } },
      { path: '/', name: 'library', component: { template: '<div />' } },
      { path: '/new', name: 'new', component: { template: '<div />' } },
    ],
  })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await router.push(path)
  await router.isReady()
  const wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [router, [VueQueryPlugin, { queryClient }]] } })
  await flushPromises()
  await flushPromises()
  return { wrapper, router }
}

enableAutoUnmount(afterEach)

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  localStorage.clear()
  sessionStorage.clear()
  Object.values(m).forEach((f) => typeof f === 'function' && f.mockReset())
  Object.values(m.toast).forEach((f) => f.mockReset())
  m.getPresentation.mockResolvedValue(deck(false))
  m.listTtsLanguages.mockResolvedValue([{ code: 'en-US', name: 'English' }])
  m.getTtsStatus.mockResolvedValue({ presentation_id: 'p1', language: 'en-US', audios: [] })
  m.getVideos.mockResolvedValue({ presentation_id: 'p1', generation_available: true, portrait: null, videos: [] })
  m.getAvatarGeneration.mockResolvedValue(null)
  m.getAvatarPreview.mockResolvedValue({ language: 'en-US', languages: ['en-US'], slides: [] })
  m.listTemplates.mockResolvedValue([{ id: 'modern', name: 'Modern', layouts: [], kind: 'builtin' }])
  m.outlineStreaming = false
  m.streamFails = false
})

const panel = (key: string) => `[data-testid="step-body-${key}"]`
// A step body behind a summary stays mounted, hidden with v-show.
const shown = (w: { element: Element }) => (w.element as HTMLElement).style.display !== 'none'

describe('CreateDeckView', () => {
  it('missing step resumes', async () => {
    const { wrapper, router } = await mountView('/p/p1/create')
    // Slides exist, no narration yet: the first step not done is Avatar.
    expect(router.currentRoute.value.fullPath).toBe('/p/p1/create/avatar')
    expect(wrapper.find(panel('avatar')).exists()).toBe(true)
    expect(m.toast.info).not.toHaveBeenCalled()
  })

  it('mounts the narration step with the wizard-owned pipeline', async () => {
    const { wrapper } = await mountView('/p/p1/create/avatar')
    const body = wrapper.get(panel('avatar'))
    // Language and presenter are no longer set here: they are chips on the Topic step.
    expect(body.find('[data-testid="avatar-setup"]').exists()).toBe(false)
    expect(body.find('[data-testid="pipeline-voice"]').attributes('data-state')).toBe('pending')
    const footerButtons = wrapper.findAll('[data-testid="wizard-footer"] button').map((b) => b.text())
    expect(footerButtons.some((t) => /^Narrate 3 slides$/.test(t))).toBe(true)
    // Narration is recommended, not required: it can be skipped.
    expect(footerButtons).toContain('Skip to Export')
  })

  it('a pipeline interrupted by a reload resumes in the wizard', async () => {
    sessionStorage.setItem('slideshows.pipeline.p1', JSON.stringify({ phase: 'voice', startedAt: 1, confirmed: false }))
    const { wrapper } = await mountView('/p/p1/create/avatar')
    expect(wrapper.get('[data-testid="pipeline-voice"]').attributes('data-state')).toBe('failed')
    expect(wrapper.get('[data-testid="pipeline-voice"]').text()).toContain('Interrupted, retry to continue')
    const retry = wrapper.findAll('[data-testid="wizard-footer"] button').find((b) => /^Retry Voice$/.test(b.text()))
    expect(retry!.attributes('disabled')).toBeUndefined()
  })

  it('unknown step resumes', async () => {
    const { router } = await mountView('/p/p1/create/bogus')
    expect(router.currentRoute.value.fullPath).toBe('/p/p1/create/avatar')
  })

  it('a deck without slides resumes on the outline', async () => {
    m.getPresentation.mockResolvedValue({ ...deck(false), slides: [] })
    const { wrapper, router } = await mountView('/p/p1/create')
    expect(router.currentRoute.value.fullPath).toBe('/p/p1/create/outline')
    expect(wrapper.find(panel('outline')).exists()).toBe(true)
  })

  it('a locked step redirects to the resume step, and says why', async () => {
    m.getPresentation.mockResolvedValue({ ...deck(false), slides: [] })
    const { wrapper, router } = await mountView('/p/p1/create/export')
    expect(router.currentRoute.value.fullPath).toBe('/p/p1/create/outline')
    expect(m.toast.info).toHaveBeenCalledWith('Slides must finish generating first')
    expect(wrapper.find(panel('export')).exists()).toBe(false)
    expect(wrapper.find(panel('outline')).exists()).toBe(true)
  })

  it('Export is open even when presenter videos and narration are missing, and warns inline', async () => {
    m.getPresentation.mockResolvedValue(deck(true))
    const { wrapper, router } = await mountView('/p/p1/create/export')
    expect(router.currentRoute.value.fullPath).toBe('/p/p1/create/export')
    expect(m.toast.info).not.toHaveBeenCalled()
    expect(wrapper.find(panel('export')).exists()).toBe(true)
    expect(wrapper.get('[data-testid="step-export"]').attributes('data-state')).toBe('available')
    const gaps = wrapper.get('[data-testid="export-gaps"]')
    expect(gaps.text()).toContain('3 presenter slides have no video · 3 slides have no narration')
    await gaps.get('a').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/p/p1/create/avatar')
  })

  it('waits for narration and videos before judging: a fully narrated deck shows no warning', async () => {
    m.getPresentation.mockResolvedValue(deck(true))
    m.getTtsStatus.mockResolvedValue({ presentation_id: 'p1', language: 'en-US', audios: audios(3) })
    m.getVideos.mockResolvedValue({ presentation_id: 'p1', generation_available: true, portrait: null, videos: videos(3) })
    const { wrapper, router } = await mountView('/p/p1/create/export')
    expect(router.currentRoute.value.fullPath).toBe('/p/p1/create/export')
    expect(m.toast.info).not.toHaveBeenCalled()
    expect(wrapper.find(panel('export')).exists()).toBe(true)
    expect(wrapper.find('[data-testid="export-gaps"]').exists()).toBe(false)
  })

  it('a stale generated avatar counts as a missing presenter video on Export', async () => {
    m.getPresentation.mockResolvedValue(deck(true))
    m.getTtsStatus.mockResolvedValue({ presentation_id: 'p1', language: 'en-US', audios: audios(3) })
    const stale = videos(3).map((v, i) => (i === 1 ? { ...v, source: 'heygen', stale: true } : v))
    m.getVideos.mockResolvedValue({ presentation_id: 'p1', generation_available: true, portrait: null, videos: stale })
    const { wrapper, router } = await mountView('/p/p1/create/export')
    expect(router.currentRoute.value.fullPath).toBe('/p/p1/create/export')
    expect(wrapper.get('[data-testid="export-gaps"]').text()).toContain('1 presenter slide has no video')
    expect(wrapper.get('[data-testid="step-avatar"]').attributes('data-state')).not.toBe('done')
  })

  it('a streaming preview stays open before any slide exists', async () => {
    m.getPresentation.mockResolvedValue({ ...deck(false), slides: [] })
    const { wrapper, router } = await mountView('/p/p1/create/preview?stream=1')
    expect(router.currentRoute.value.fullPath).toBe('/p/p1/create/preview?stream=1')
    expect(m.toast.info).not.toHaveBeenCalled()
    expect(wrapper.find(panel('preview')).exists()).toBe(true)
  })

  it('keeps a streaming preview open: other deck steps and Back wait, summaries still open', async () => {
    m.getPresentation.mockResolvedValue({ ...deck(false), slides: [] })
    const { wrapper, router } = await mountView('/p/p1/create/preview?stream=1')
    await wrapper.get('[data-testid="step-outline"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/p/p1/create/preview?stream=1')
    expect(m.toast.info).toHaveBeenCalledWith('Wait for the slides to finish generating')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true }))
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/p/p1/create/preview?stream=1')
    expect(m.toast.info).toHaveBeenCalledTimes(2)
    const back = wrapper.findAll('[data-testid="wizard-footer"] button').find((b) => /^Back$/.test(b.text()))!
    expect(back.attributes('disabled')).toBeDefined()
    await wrapper.get('[data-testid="step-topic"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/p/p1/create/topic?stream=1')
    expect(wrapper.find('[data-testid="summary-topic"]').exists()).toBe(true)
    expect(wrapper.find(panel('preview')).exists()).toBe(true)
    // Presenter -> Outline would unmount the streaming Preview, so it is held too.
    await wrapper.get('[data-testid="step-presenter"]').trigger('click')
    await flushPromises()
    await wrapper.findAll('[data-testid="wizard-footer"] button').find((b) => /^Next: Outline/.test(b.text()))!.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/p/p1/create/presenter?stream=1')
  })

  it('going from the outline to a streaming preview stays on the preview', async () => {
    m.getPresentation.mockResolvedValue({ ...deck(false), slides: [] })
    const { wrapper, router } = await mountView('/p/p1/create/outline?template=modern')
    expect(wrapper.find(panel('outline')).exists()).toBe(true)
    await router.replace({ name: 'create', params: { id: 'p1', step: 'preview' }, query: { template: 'modern', stream: '1' } })
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/p/p1/create/preview?template=modern&stream=1')
    expect(m.toast.info).not.toHaveBeenCalled()
    expect(wrapper.find(panel('preview')).exists()).toBe(true)
  })

  it('shows one footer, the outline step’s own on the outline', async () => {
    m.getPresentation.mockResolvedValue({ ...deck(false), slides: [] })
    const { wrapper } = await mountView('/p/p1/create/outline?template=modern')
    expect(wrapper.findAll('[data-testid="wizard-footer"]')).toHaveLength(1)
    expect(wrapper.findAll('button').filter((b) => b.text().includes('Generate slides'))).toHaveLength(1)
    expect(wrapper.findAll('button').some((b) => b.text() === 'Next')).toBe(false)
  })

  it('a summary opened mid-stream keeps the outline step (and its stream) alive, with only the summary footer', async () => {
    m.getPresentation.mockResolvedValue({ ...deck(false), slides: [] })
    m.outlineStreaming = true
    const { wrapper } = await mountView('/p/p1/create/outline?template=modern')
    expect(m.outlineStream).toHaveBeenCalledTimes(1)

    await wrapper.get('[data-testid="step-topic"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="summary-topic"]').exists()).toBe(true)
    expect(shown(wrapper.get(panel('outline')))).toBe(false)
    const footers = wrapper.findAll('[data-testid="wizard-footer"]')
    expect(footers).toHaveLength(1)
    expect(footers[0]!.text()).toContain('Next: Presenter')
    expect(footers[0]!.text()).not.toContain('Generate slides')

    await wrapper.get('[data-testid="step-outline"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="summary-topic"]').exists()).toBe(false)
    expect(shown(wrapper.get(panel('outline')))).toBe(true)
    expect(m.outlineStream).toHaveBeenCalledTimes(1)
    const back = wrapper.findAll('[data-testid="wizard-footer"]')
    expect(back).toHaveLength(1)
    expect(back[0]!.text()).toContain('Generate slides')
  })

  it('shows one footer on other steps', async () => {
    const { wrapper } = await mountView('/p/p1/create/avatar')
    expect(wrapper.findAll('[data-testid="wizard-footer"]')).toHaveLength(1)
  })

  it('leaving preview drops the stream flag', async () => {
    // A failed stream keeps `?stream=1` (for Retry) but no longer holds the user on Preview.
    m.streamFails = true
    m.getPresentation.mockResolvedValue({ ...deck(false), slides: [] })
    const { router } = await mountView('/p/p1/create/preview?stream=1&template=modern')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true }))
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/p/p1/create/outline?template=modern')
  })

  it('keeps the current step when narration state refetches', async () => {
    m.getPresentation.mockResolvedValue(deck(true))
    m.getTtsStatus.mockImplementation(async (_id: string, lang: string) => ({
      presentation_id: 'p1',
      language: lang,
      audios: lang === 'en-US' ? audios(3) : [],
    }))
    m.getVideos.mockResolvedValue({ presentation_id: 'p1', generation_available: true, portrait: null, videos: videos(3) })
    const { wrapper, router } = await mountView('/p/p1/create/export')
    expect(wrapper.find(panel('export')).exists()).toBe(true)

    let resolveFr!: () => void
    m.getTtsStatus.mockImplementation(
      (_id: string, lang: string) =>
        new Promise((done) => {
          resolveFr = () => done({ presentation_id: 'p1', language: lang, audios: [] })
        }),
    )
    // The language is module state shared by every user of the deck; any instance can change it.
    let setLanguage!: (code: string) => void
    mount(
      defineComponent({
        setup() {
          setLanguage = useTtsLanguage(ref('p1'), ref(undefined)).setLanguage
          return () => h('div')
        },
      }),
      { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] } },
    )
    setLanguage('fr-FR')
    await flushPromises()
    // Still fetching the new language's narration: the body stays.
    expect(wrapper.find(panel('export')).exists()).toBe(true)
    resolveFr()
    await flushPromises()
    // Now nothing is narrated in French (export would be locked), but the user is not thrown out.
    expect(router.currentRoute.value.fullPath).toBe('/p/p1/create/export')
    expect(wrapper.find(panel('export')).exists()).toBe(true)
    expect(m.toast.info).not.toHaveBeenCalled()
    setLanguage('en-US') // module state: hand the next test the default back
  })

  it('Topic summary: the step bar names the topic and look, six steps in all', async () => {
    const { wrapper } = await mountView('/p/p1/create/avatar')
    expect(wrapper.findAll('nav[aria-label="Wizard steps"] ol > li')).toHaveLength(6)
    expect(wrapper.find('[data-testid="step-topic"]').text()).toContain('Why octopuses')
    expect(wrapper.find('[data-testid="step-topic"]').text()).toContain('Modern')
    expect(wrapper.find('[data-testid="step-look"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="step-presenter"]').text()).toContain('Voice only')
    expect(wrapper.find('[data-testid="step-details"]').exists()).toBe(false)
  })

  it('Topic summary: read-only topic, look and settings chips', async () => {
    const { wrapper, router } = await mountView('/p/p1/create/avatar')
    await wrapper.get('[data-testid="step-topic"]').trigger('click')
    await flushPromises()
    const summary = wrapper.get('[data-testid="summary-topic"]')
    expect(summary.text()).toContain('Why octopuses are smarter than you think')
    expect(summary.find('textarea, input').exists()).toBe(false)
    // The narration body stays mounted behind the summary, hidden.
    expect(shown(wrapper.get(panel('avatar')))).toBe(false)
    expect(router.currentRoute.value.fullPath).toBe('/p/p1/create/topic')
    // Fixed when the deck was created: plain text, not buttons.
    for (const [k, text] of [['language', 'English'], ['length', '3 slides'], ['style', 'Tone: Casual · Text per slide: Concise']]) {
      const chip = wrapper.get(`[data-testid="chip-${k}-fixed"]`)
      expect(chip.element.tagName).toBe('SPAN')
      expect(chip.text()).toBe(text)
    }
    expect(wrapper.find('[data-testid="chip-presenter"]').exists()).toBe(false)

    // Picking a deck step leaves the summary.
    await wrapper.get('[data-testid="step-preview"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/p/p1/create/preview')
    expect(wrapper.find('[data-testid="summary-topic"]').exists()).toBe(false)
    expect(wrapper.find(panel('preview')).exists()).toBe(true)
  })

  it('Presenter summary: narration language and presenter photo stay editable', async () => {
    m.getPresentation.mockResolvedValue(deck(true))
    const { wrapper, router } = await mountView('/p/p1/create/avatar')
    await wrapper.get('[data-testid="step-presenter"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('h2').text()).toBe('Presenter and language')
    expect(wrapper.find('[data-testid="setup-language"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="setup-portrait"]').exists()).toBe(true)
    expect(shown(wrapper.get(panel('avatar')))).toBe(false)
    expect(router.currentRoute.value.fullPath).toBe('/p/p1/create/presenter')
  })

  it('Presenter summary: a deck without presenter slides says it is voice only', async () => {
    const { wrapper } = await mountView('/p/p1/create/avatar')
    await wrapper.findAll('button').find((b) => /Presenter and language/.test(b.text()))!.trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="setup-portrait"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="setup-voice-only"]').text()).toContain('narrated with a voice only')
  })

  it.each([['presenter', 'Presenter and language'], ['topic', 'Topic and look']])('/create/%s is its own step, with the resume step mounted behind it', async (key, heading) => {
    const { wrapper, router } = await mountView(`/p/p1/create/${key}`)
    expect(router.currentRoute.value.fullPath).toBe(`/p/p1/create/${key}`)
    expect(wrapper.get('h2').text()).toBe(heading)
    expect(shown(wrapper.get(panel('avatar')))).toBe(false)
  })

  it('Topic and Presenter have the same Back/Next footer and Alt+arrows as the other steps', async () => {
    const { wrapper, router } = await mountView('/p/p1/create/topic')
    const buttons = () => wrapper.findAll('[data-testid="wizard-footer"] button').map((b) => b.text())
    expect(wrapper.findAll('[data-testid="wizard-footer"]')).toHaveLength(1)
    expect(buttons()).toEqual(['Next: Presenter'])
    await wrapper.findAll('[data-testid="wizard-footer"] button').find((b) => /^Next: Presenter/.test(b.text()))!.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/p/p1/create/presenter')
    expect(buttons()).toEqual(['Back', 'Next: Outline'])
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true }))
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/p/p1/create/topic')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true }))
    await flushPromises()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true }))
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/p/p1/create/outline')
    // The outline step's Back goes to Presenter.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true }))
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/p/p1/create/presenter')
  })

  it('the Narration step reaches the Presenter step through Presenter and language', async () => {
    const { wrapper } = await mountView('/p/p1/create/avatar')
    await wrapper.findAll('button').find((b) => /Presenter and language/.test(b.text()))!.trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="setup-language"]').exists()).toBe(true)
  })

  it('Alt+arrows move between unlocked deck steps', async () => {
    const { router } = await mountView('/p/p1/create/avatar')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true }))
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/p/p1/create/preview')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true }))
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/p/p1/create/avatar')
    // Export is open as soon as the slides are in.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true }))
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/p/p1/create/export')
  })

  it('Alt+ArrowRight onto a locked step says why', async () => {
    m.getPresentation.mockResolvedValue({ ...deck(false), slides: [] })
    const { router } = await mountView('/p/p1/create/outline')
    m.toast.info.mockClear()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true }))
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/p/p1/create/outline')
    expect(m.toast.info).toHaveBeenCalledWith('Generate slides from the outline first')
  })

  it('not found shows message', async () => {
    m.getPresentation.mockRejectedValue(new ApiError('Not found', 404))
    const { wrapper } = await mountView('/p/p1/create/outline')
    expect(wrapper.text()).toContain('Presentation not found')
  })
})

describe('imported deck', () => {
  // A deck read from a PowerPoint: its slides keep the file's design, so the AI outline must never run.
  const imported = () => ({
    ...deck(false),
    content: '',
    title: 'Quarterly review',
    source: 'pptx',
    source_name: 'Q3 review.pptx',
  })
  beforeEach(() => m.getPresentation.mockResolvedValue(imported()))

  it('resumes on Preview until narration exists', async () => {
    const { wrapper, router } = await mountView('/p/p1/create')
    expect(router.currentRoute.value.fullPath).toBe('/p/p1/create/preview')
    expect(wrapper.find(panel('preview')).exists()).toBe(true)
    expect(m.toast.info).not.toHaveBeenCalled()
  })

  it('Outline shows the imported slides read-only, never the AI outline step', async () => {
    const { wrapper, router } = await mountView('/p/p1/create/outline')
    expect(router.currentRoute.value.fullPath).toBe('/p/p1/create/outline')
    const outline = wrapper.get('[data-testid="imported-outline"]')
    expect(outline.text()).toContain('From PowerPoint · 3 slides')
    expect(outline.findAll('ol > li')).toHaveLength(3)
    expect(wrapper.findComponent(OutlineStep).exists()).toBe(false)
    expect(m.outlineStream).not.toHaveBeenCalled()
    // One footer (the summary's own), with no AI actions: the only primary is Next: Preview.
    expect(wrapper.findAll('[data-testid="wizard-footer"]')).toHaveLength(1)
    const footerButtons = wrapper.findAll('[data-testid="wizard-footer"] button').map((b) => b.text())
    expect(footerButtons.some((t) => /generate|regenerate/i.test(t))).toBe(false)
    const next = wrapper.findAll('[data-testid="wizard-footer"] button').find((b) => /^Next: Preview$/.test(b.text()))
    await next!.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/p/p1/create/preview')
    expect(m.outlineStream).not.toHaveBeenCalled()
  })

  it('Topic summary names the file and slide count, with no template card and no setup chips', async () => {
    const { wrapper } = await mountView('/p/p1/create/topic')
    expect(wrapper.get('[data-testid="step-topic"]').text()).toContain('Q3 review.pptx · 3 slides')
    const summary = wrapper.get('[data-testid="summary-topic"]')
    expect(summary.text()).toContain('From PowerPoint')
    expect(summary.text()).toContain('Q3 review.pptx')
    expect(summary.text()).toContain('3 slides')
    expect(wrapper.find('[data-testid="summary-look"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="setup-chips"]').exists()).toBe(false)
    expect(wrapper.findComponent(OutlineStep).exists()).toBe(false)
    expect(m.outlineStream).not.toHaveBeenCalled()
  })

  it('falls back to the title when the file name is missing', async () => {
    m.getPresentation.mockResolvedValue({ ...imported(), source_name: null })
    const { wrapper } = await mountView('/p/p1/create/topic')
    expect(wrapper.get('[data-testid="step-topic"]').text()).toContain('Quarterly review · 3 slides')
    expect(wrapper.get('[data-testid="summary-topic"]').text()).toContain('Quarterly review')
  })
})
