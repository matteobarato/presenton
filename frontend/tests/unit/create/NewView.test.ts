import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ApiError } from '@/api/errors'
import { useSessionStore } from '@/stores/session'
import type { GenerationMode } from '@/api/next-routes'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'

vi.mock('@/render/SlideView.vue', () => ({
  default: { props: ['slide'], template: '<div data-testid="slide-view" :data-slide="slide.id" />' },
}))

import NewView from '@/views/NewView.vue'

const m = vi.hoisted(() => ({
  uploadFiles: vi.fn(),
  decomposeFiles: vi.fn(),
  createPresentation: vi.fn(),
  listTemplates: vi.fn(),
  uploadPortrait: vi.fn(),
  checkFonts: vi.fn(),
  prepareImport: vi.fn(),
  importPresentation: vi.fn(),
}))
vi.mock('@/api/videos', () => ({ uploadPortrait: m.uploadPortrait }))
vi.mock('@/api/templateImport', async (orig) => ({ ...(await orig<object>()), checkFonts: m.checkFonts, prepareImport: m.prepareImport }))
vi.mock('@/api/presentationImport', () => ({ importPresentation: m.importPresentation }))
vi.mock('@/api/templates', async (orig) => ({ ...(await orig<typeof import('@/api/templates')>()), listTemplates: m.listTemplates }))
vi.mock('@/api/files', async (orig) => ({ ...(await orig<typeof import('@/api/files')>()), uploadFiles: m.uploadFiles, decomposeFiles: m.decomposeFiles }))
vi.mock('@/api/generation', () => ({ createPresentation: m.createPresentation, getGenerationDefaults: vi.fn() }))

const view = { template: '<div />' }
const mounted: { unmount(): void }[] = []
afterEach(() => {
  // Layouts listen on window for Alt+Arrow; leaked ones would react to other tests' keys.
  for (const w of mounted.splice(0)) {
    try {
      w.unmount()
    } catch {
      // already torn down
    }
  }
})

// Most tests want a template already chosen; the Look tests pass '/new'.
async function mountView(generationMode: GenerationMode = 'both', config: Record<string, unknown> = {}, startPath = '/new?template=c1') {
  const pinia = createPinia()
  setActivePinia(pinia)
  useSessionStore().runtime = { configured: true, config, generationMode }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/new', name: 'new', component: NewView },
      { path: '/p/:id/create/:step?', name: 'create', component: view },
      { path: '/p/:id', name: 'editor', component: view },
    ],
  })
  await router.push(startPath)
  await router.isReady()
  const wrapper = mount(NewView, { global: { plugins: [pinia, router, [VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]] }, attachTo: document.body })
  await flushPromises()
  mounted.push(wrapper)
  return { wrapper, router }
}

type W = Awaited<ReturnType<typeof mountView>>['wrapper']
const submitBtn = (w: W) => w.get('button[type="submit"]')
const status = (w: W) => w.get('[role="status"]').text()
const chipText = (w: W, key: string) => w.get(`[data-testid="chip-${key}"]`).text()

/** Opens a setup chip; its controls render in a portal, so they are read from the document. */
async function openChip(w: W, key: 'language' | 'length' | 'style' | 'extras') {
  await w.get(`[data-testid="chip-${key}"]`).trigger('click')
  await flushPromises()
  const panel = document.body.querySelector(`[data-testid="chip-${key}-panel"]`)
  if (!panel) throw new Error(`chip ${key} did not open`)
  return new DOMWrapper(panel)
}
async function typeTopic(w: W, text = 'Quarterly review') {
  await w.get('#create-prompt').setValue(text)
}
/** Enter in the form: Next on the Topic step, Create outline on the Presenter step. This goes all the way. */
async function submit(w: W) {
  const fromTopic = w.get('[data-testid="wizard-primary"]').text().startsWith('Next')
  await w.get('form').trigger('submit')
  await flushPromises()
  if (fromTopic) {
    await w.get('form').trigger('submit')
    await flushPromises()
  }
}
async function goTo(w: W, key: 'topic' | 'presenter') {
  await w.get(`[data-testid="step-${key}"]`).trigger('click')
  await flushPromises()
}

async function addPhoto(w: W, name = 'me.png') {
  await goTo(w, 'presenter')
  await w.get('[data-testid="presenter-choice-photo"]').trigger('click')
  const input = w.get('[data-testid="portrait-input"]')
  const file = new File(['x'], name, { type: 'image/png' })
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
  await input.trigger('change')
  await flushPromises()
  await goTo(w, 'topic')
  return file
}

async function attach(w: W, name = 'brief.pdf') {
  const input = w.get('[data-testid="file-input"]')
  const file = new File(['x'], name, { type: 'application/pdf' })
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
  await input.trigger('change')
  return file
}

beforeEach(() => {
  localStorage.clear()
  Object.values(m).forEach((f) => f.mockReset())
  m.listTemplates.mockResolvedValue([{ id: 'c1', name: 'Pitch', kind: 'custom', layouts: [{}] }])
  m.checkFonts.mockResolvedValue([])
  document.body.innerHTML = ''
  sessionStorage.clear()
})

describe('NewView', () => {
  describe('one step: topic, look and a row of setting chips', () => {
    it('is six steps; the old Avatar & language and Details steps are gone, Presenter is its own step', async () => {
      const { wrapper } = await mountView()
      expect(wrapper.findAll('nav[aria-label="Wizard steps"] ol > li')).toHaveLength(6)
      expect(wrapper.get('[data-testid="steps-compact"]').text()).toContain('1/6')
      expect(wrapper.get('[data-testid="step-presenter"]').text()).toContain('Presenter')
      expect(wrapper.get('[data-testid="step-presenter"]').attributes('data-state')).toBe('available')
      for (const k of ['details', 'look']) expect(wrapper.find(`[data-testid="step-${k}"]`).exists()).toBe(false)
      for (const k of ['outline', 'preview', 'avatar', 'export']) {
        const b = wrapper.get(`[data-testid="step-${k}"]`)
        expect(b.attributes('data-state')).toBe('locked')
        expect(b.attributes('title')).toBe('Create the outline first')
      }
      expect(wrapper.get('[data-testid="step-avatar"]').text()).toContain('Narration')
      expect(wrapper.get('[data-testid="step-avatar"]').text()).not.toMatch(/Required|Optional|Decided/)
      expect(wrapper.text()).not.toContain('Fine-tune details')
    })

    it('shows the chip row directly under the composer, with a summary of the defaults', async () => {
      const { wrapper } = await mountView()
      const chips = wrapper.get('[data-testid="setup-chips"]')
      const composer = wrapper.get('[data-testid="dropzone"]')
      expect(composer.element.compareDocumentPosition(chips.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(chipText(wrapper, 'language')).toBe('Auto (English)')
      expect(wrapper.find('[data-testid="chip-presenter"]').exists()).toBe(false)
      expect(chipText(wrapper, 'length')).toBe('Auto length · Auto images')
      expect(chipText(wrapper, 'style')).toBe('Tone: Default')
      expect(chipText(wrapper, 'extras')).toBe('Extras: Animated')
    })

    it('chip summaries follow the values', async () => {
      const { wrapper } = await mountView()
      let panel = await openChip(wrapper, 'length')
      await panel.get('#opt-slides').setValue('5')
      await panel.get('#opt-images').setValue('0')
      expect(chipText(wrapper, 'length')).toBe('5 slides · No images')
      panel = await openChip(wrapper, 'style')
      await panel.findAll('[aria-label="Tone"] [role="radio"]').find((b) => b.text() === 'Casual')!.trigger('click')
      await panel.findAll('[aria-label="Text per slide"] [role="radio"]').find((b) => b.text().includes('Concise'))!.trigger('click')
      expect(chipText(wrapper, 'style')).toBe('Tone: Casual · Text per slide: Concise')
      panel = await openChip(wrapper, 'extras')
      await panel.get('#opt-title').trigger('click')
      await panel.get('#opt-animate').trigger('click')
      expect(chipText(wrapper, 'extras')).toBe('Extras: Title slide')
      panel = await openChip(wrapper, 'language')
      await panel.get('#opt-language').setValue('Spanish (Español)')
      expect(chipText(wrapper, 'language')).toBe('Spanish (Español)')
    })

    it('opens a chip into a popover with its controls, and closes it again', async () => {
      const { wrapper } = await mountView()
      expect(document.body.querySelector('[data-testid="chip-length-panel"]')).toBeNull()
      const chip = wrapper.get('[data-testid="chip-length"]')
      expect(chip.attributes('aria-expanded')).toBe('false')
      const panel = await openChip(wrapper, 'length')
      expect(chip.attributes('aria-expanded')).toBe('true')
      expect(panel.text()).toContain('Length & media')
      expect(panel.find('#opt-slides').exists()).toBe(true)
      // The groups the chip does not own are not in it.
      expect(panel.find('[aria-label="Tone"]').exists()).toBe(false)
      await chip.trigger('click')
      await flushPromises()
      expect(document.body.querySelector('[data-testid="chip-length-panel"]')).toBeNull()
    })

    it('holds the controls without their own cards: one group per chip, extras with instructions', async () => {
      const { wrapper } = await mountView()
      const extras = await openChip(wrapper, 'extras')
      for (const id of ['#opt-title', '#opt-toc', '#opt-web', '#opt-animate', '#opt-instructions']) expect(extras.find(id).exists()).toBe(true)
      expect(extras.find('#opt-slides').exists()).toBe(false)
    })

    it('becomes a bottom sheet below 560px', async () => {
      const original = window.matchMedia
      window.matchMedia = ((query: string) => ({
        matches: query.includes('max-width: 559px'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
      })) as unknown as typeof window.matchMedia
      try {
        const { wrapper } = await mountView()
        const panel = await openChip(wrapper, 'length')
        const sheet = panel.element.closest('[role="dialog"]')
        expect(sheet?.classList.contains('anim-sheet-bottom')).toBe(true)
        expect(panel.find('#opt-slides').exists()).toBe(true)
      } finally {
        window.matchMedia = original
      }
    })
  })

  describe('Presenter step', () => {
    it('is a step of its own with a clear voice-only choice, selected by default', async () => {
      const { wrapper } = await mountView()
      await goTo(wrapper, 'presenter')
      expect(wrapper.get('h2').text()).toBe('Who presents?')
      expect(wrapper.get('[data-testid="presenter-choice-voice"]').attributes('aria-checked')).toBe('true')
      expect(wrapper.get('[data-testid="presenter-choice-voice"]').text()).toContain('No presenter — voice only')
      expect(wrapper.get('[data-testid="presenter-choice-photo"]').attributes('aria-checked')).toBe('false')
      expect(wrapper.find('[data-testid="portrait-input"]').exists()).toBe(false)
      // Language is not here: it is a chip on the Topic step.
      expect(wrapper.find('#opt-language').exists()).toBe(false)
    })

    it('Topic has Next: Presenter as its primary, Presenter has Create outline', async () => {
      const { wrapper } = await mountView()
      const primary = () => wrapper.get('[data-testid="wizard-primary"]')
      expect(primary().text()).toBe('Next: Presenter')
      expect(primary().attributes('disabled')).toBeDefined()
      await typeTopic(wrapper)
      expect(primary().attributes('disabled')).toBeUndefined()
      await primary().trigger('click')
      await flushPromises()
      expect(m.createPresentation).not.toHaveBeenCalled()
      expect(wrapper.get('h2').text()).toBe('Who presents?')
      expect(primary().text()).toBe('Create outline')
      expect(primary().classes().join(' ')).toContain('bg-accent')
      await wrapper.get('[data-testid="wizard-back"]').trigger('click')
      expect(wrapper.find('#create-prompt').exists()).toBe(true)
    })

    it('adds a photo; a wrong type is refused and keeps no photo', async () => {
      const { wrapper } = await mountView()
      await goTo(wrapper, 'presenter')
      await wrapper.get('[data-testid="presenter-choice-photo"]').trigger('click')
      const input = wrapper.get('[data-testid="portrait-input"]')
      Object.defineProperty(input.element, 'files', { value: [new File(['x'], 'a.gif', { type: 'image/gif' })], configurable: true })
      await input.trigger('change')
      expect(wrapper.get('[role="alert"]').text()).toMatch(/JPEG, PNG or WebP/)
      expect(wrapper.find('img[alt="Presenter portrait"]').exists()).toBe(false)
      // Chosen, but no photo yet: the step bar and the helper say so instead of "Voice only".
      expect(wrapper.get('[data-testid="step-presenter"]').text()).toContain('Photo needed')
      expect(wrapper.get('[data-testid="presenter-picker-help"]').text()).toBe('Add a photo to continue with a presenter, or choose voice only.')

      await addPhoto(wrapper)
      expect(wrapper.get('[data-testid="step-presenter"]').text()).toContain('Photo set')
    })

    it('says what Create outline will do: its scope, and voice only when no photo came', async () => {
      const { wrapper } = await mountView()
            await goTo(wrapper, 'presenter')
      await wrapper.get('[data-testid="presenter-choice-photo"]').trigger('click')
      const status = () => wrapper.get('[data-testid="wizard-footer"] [role="status"]').text()
      // Either a missing-topic link or the voice-only line; never a silent change of plan.
      expect(status()).toMatch(/Add a topic|voice only/)
    })

    it('clicking a locked step shows why in the footer', async () => {
      const { wrapper } = await mountView()
      await wrapper.get('[data-testid="step-outline"]').trigger('click')
      expect(wrapper.get('[data-testid="wizard-footer"] [role="status"]').text()).toContain('Create the outline first')
    })

    it('choosing voice only drops the photo', async () => {
      const { wrapper } = await mountView()
      await addPhoto(wrapper)
      await goTo(wrapper, 'presenter')
      expect(wrapper.find('img[alt="Presenter portrait"]').exists()).toBe(true)
      await wrapper.get('[data-testid="presenter-choice-voice"]').trigger('click')
      expect(wrapper.find('img[alt="Presenter portrait"]').exists()).toBe(false)
      expect(wrapper.get('[data-testid="presenter-choice-voice"]').attributes('aria-checked')).toBe('true')
    })

    it('says presenter videos are rendered at the Narration step when the count is Auto', async () => {
      const { wrapper } = await mountView()
      await addPhoto(wrapper)
      await goTo(wrapper, 'presenter')
      expect(wrapper.get('[data-testid="presenter-note"]').text()).toContain('Presenter videos are rendered at the Narration step')
    })

    it('chooses how many slides get a presenter video, here and not in Length & media', async () => {
      const { wrapper } = await mountView()
      await goTo(wrapper, 'presenter')
      // Voice only: no count to choose.
      expect(wrapper.find('#opt-videos').exists()).toBe(false)
      await addPhoto(wrapper)
      expect((await openChip(wrapper, 'length')).find('#opt-videos').exists()).toBe(false)
      expect(chipText(wrapper, 'length')).not.toContain('presenter')
      await goTo(wrapper, 'presenter')
      expect(wrapper.get('#opt-videos').element).toHaveProperty('disabled', false)
      await wrapper.get('#opt-videos').setValue('3')
      expect(wrapper.get('[data-testid="presenter-note"]').text()).toBe('Adds 3 presenter videos at the Narration step')
      await wrapper.get('#opt-videos').setValue('1')
      expect(wrapper.get('[data-testid="presenter-note"]').text()).toBe('Adds 1 presenter video at the Narration step')
      await wrapper.findAll('[aria-label="Presenter video count"] [role="radio"]').find((b) => b.text() === 'None')!.trigger('click')
      expect(wrapper.get('[data-testid="presenter-note"]').text()).toContain('No presenter videos requested')
    })

    it('the count is locked until a photo is added', async () => {
      const { wrapper } = await mountView()
      await goTo(wrapper, 'presenter')
      await wrapper.get('[data-testid="presenter-choice-photo"]').trigger('click')
      expect(wrapper.get('#opt-videos').element).toHaveProperty('disabled', true)
      expect(wrapper.text()).toContain('Add a presenter photo to choose')
    })

    it('Length & media no longer carries the presenter slots hint', async () => {
      const { wrapper } = await mountView()
      await addPhoto(wrapper)
      const length = await openChip(wrapper, 'length')
      expect(length.text()).not.toContain('Slots show a placeholder')
      await goTo(wrapper, 'presenter')
      expect(wrapper.text()).toContain('Shown as placeholders until rendered at the Narration step')
    })
  })

  it('prefills web search from the runtime config', async () => {
    const { wrapper } = await mountView('both', { WEB_GROUNDING: true })
    expect(chipText(wrapper, 'extras')).toContain('Web search')
    const panel = await openChip(wrapper, 'extras')
    expect(panel.get('#opt-web').attributes('aria-checked')).toBe('true')
  })

  it('clamps the slide count to 1-50', async () => {
    const { wrapper } = await mountView()
    const input = (await openChip(wrapper, 'length')).get('#opt-slides')
    await input.setValue('99')
    expect((input.element as HTMLInputElement).value).toBe('50')
    await input.setValue('0')
    expect((input.element as HTMLInputElement).value).toBe('')
  })

  it('clamps the image count to 0-50, keeping 0 as "none"', async () => {
    const { wrapper } = await mountView()
    const input = (await openChip(wrapper, 'length')).get('#opt-images')
    await input.setValue('99')
    expect((input.element as HTMLInputElement).value).toBe('50')
    await input.setValue('0')
    expect((input.element as HTMLInputElement).value).toBe('0')
    await input.setValue('')
    expect((input.element as HTMLInputElement).value).toBe('')
  })

  it.each([
    ['Auto', null, null],
    ['None', null, 0],
    [null, '4', 4],
  ] as const)('sends n_images for chip %s / typed %s as %s', async (label, typed, expected) => {
    m.createPresentation.mockResolvedValue({ id: 'abc' })
    const { wrapper } = await mountView()
    await typeTopic(wrapper)
    const panel = await openChip(wrapper, 'length')
    if (label) {
      const chip = panel.findAll('[aria-label="Image count"] [role="radio"]').find((b) => b.text() === label)!
      await chip.trigger('click')
      expect(chip.attributes('aria-checked')).toBe('true')
    }
    if (typed) await panel.get('#opt-images').setValue(typed)
    await submit(wrapper)
    expect(m.createPresentation).toHaveBeenCalledWith(expect.objectContaining({ n_images: expected }))
  })

  it.each([
    ['Auto', null, null],
    ['None', null, 0],
    [null, '2', 2],
  ] as const)('sends n_videos for chip %s / typed %s as %s', async (label, typed, expected) => {
    m.createPresentation.mockResolvedValue({ id: 'abc' })
    const { wrapper } = await mountView()
    await typeTopic(wrapper)
    await addPhoto(wrapper)
    await goTo(wrapper, 'presenter')
    if (label) {
      const chip = wrapper.findAll('[aria-label="Presenter video count"] [role="radio"]').find((b) => b.text() === label)!
      await chip.trigger('click')
      expect(chip.attributes('aria-checked')).toBe('true')
    }
    if (typed) await wrapper.get('#opt-videos').setValue(typed)
    await submit(wrapper)
    expect(m.createPresentation).toHaveBeenCalledWith(expect.objectContaining({ n_videos: expected, n_images: null }))
  })

  it('without a presenter photo the videos count is None and disabled, and n_videos is 0', async () => {
    m.createPresentation.mockResolvedValue({ id: 'abc' })
    const { wrapper } = await mountView()
    await typeTopic(wrapper)
    await submit(wrapper)
    expect(m.createPresentation).toHaveBeenCalledWith(expect.objectContaining({ n_videos: 0 }))
  })

  it('uploads the presenter photo to the new deck before routing on, and survives an upload failure', async () => {
    m.createPresentation.mockResolvedValue({ id: 'abc' })
    m.uploadPortrait.mockResolvedValueOnce({})
    const first = await mountView()
    await typeTopic(first.wrapper)
    const file = await addPhoto(first.wrapper)
    await submit(first.wrapper)
    expect(m.uploadPortrait).toHaveBeenCalledWith('abc', file)
    expect(first.router.currentRoute.value.name).toBe('create')

    m.uploadPortrait.mockRejectedValueOnce(new Error('boom'))
    const second = await mountView()
    await typeTopic(second.wrapper)
    await addPhoto(second.wrapper)
    await submit(second.wrapper)
    expect(second.router.currentRoute.value.name).toBe('create')
  })

  it('renders no mode switch, creates a standard presentation and routes to the outline, without file calls', async () => {
    m.createPresentation.mockResolvedValue({ id: 'abc' })
    const { wrapper, router } = await mountView()
    expect(wrapper.text()).not.toMatch(/smart/i)
    await typeTopic(wrapper)
    await (await openChip(wrapper, 'length')).get('#opt-slides').setValue('8')
    await submit(wrapper)
    expect(m.uploadFiles).not.toHaveBeenCalled()
    expect(m.decomposeFiles).not.toHaveBeenCalled()
    expect(m.createPresentation).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Quarterly review', n_slides: 8, file_paths: [], generation_mode: 'standard', tone: 'default', verbosity: 'standard' }),
    )
    expect(router.currentRoute.value.fullPath).toBe('/p/abc/create/outline?template=c1')
  })

  it('animate is on by default (as the chip says) and is handed to the editor as a one-shot flag; off hands nothing', async () => {
    m.createPresentation.mockResolvedValue({ id: 'abc' })
    const on = await mountView()
    await typeTopic(on.wrapper)
    const panel = await openChip(on.wrapper, 'extras')
    expect(panel.get('#opt-animate').attributes('aria-checked')).toBe('true')
    await submit(on.wrapper)
    expect(m.createPresentation.mock.calls[0]![0]).not.toHaveProperty('animate')
    expect(sessionStorage.getItem('slideshows.animate.abc')).toBe('1')
    expect(on.router.currentRoute.value.name).toBe('create')

    sessionStorage.clear()
    m.createPresentation.mockResolvedValue({ id: 'def' })
    const off = await mountView()
    await typeTopic(off.wrapper)
    await (await openChip(off.wrapper, 'extras')).get('#opt-animate').trigger('click')
    await submit(off.wrapper)
    expect(sessionStorage.getItem('slideshows.animate.def')).toBeNull()
  })

  it('uploads, decomposes and sends the extracted paths', async () => {
    m.uploadFiles.mockResolvedValue(['up/1'])
    m.decomposeFiles.mockResolvedValue(['/doc/1.txt'])
    m.createPresentation.mockResolvedValue({ id: 'f1' })
    const { wrapper } = await mountView()
    const file = await attach(wrapper)
    await (await openChip(wrapper, 'language')).get('#opt-language').setValue('English')
    await submit(wrapper)
    expect(m.uploadFiles).toHaveBeenCalledWith([file])
    expect(m.decomposeFiles).toHaveBeenCalledWith(['up/1'], 'English')
    expect(m.createPresentation).toHaveBeenCalledWith(expect.objectContaining({ file_paths: ['/doc/1.txt'], language: 'English' }))
  })

  it('asks for a language before processing documents, opening the Language chip', async () => {
    const { wrapper } = await mountView()
    await attach(wrapper)
    expect(wrapper.text()).toContain('Documents need a language')
    await submit(wrapper)
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('language')
    expect(document.body.querySelector('[data-testid="chip-language-panel"]')).not.toBeNull()
    expect(document.activeElement?.id).toBe('opt-language')
    expect(m.uploadFiles).not.toHaveBeenCalled()
  })

  it('stays pending until navigation settles, and recovers from failures with the server message', async () => {
    let resolve!: (v: { id: string }) => void
    m.createPresentation.mockReturnValueOnce(new Promise((r) => (resolve = r)))
    const { wrapper } = await mountView()
    await typeTopic(wrapper, 'Topic')
    await submit(wrapper)
    expect(submitBtn(wrapper).attributes('disabled')).toBeDefined()
    expect(submitBtn(wrapper).text()).toContain('Working')
    expect(status(wrapper)).toContain('Preparing outline')
    // The choices are not editable while the deck is being created.
    expect(wrapper.get('[data-testid="presenter-choice-photo"]').attributes('disabled')).toBeDefined()
    resolve({ id: 'p1' })
    await flushPromises()

    m.uploadFiles.mockRejectedValue(new ApiError('Unsupported file', 422))
    const second = await mountView()
    await attach(second.wrapper)
    await (await openChip(second.wrapper, 'language')).get('#opt-language').setValue('English')
    await submit(second.wrapper)
    expect(second.wrapper.get('[role="alert"]').text()).toContain('Unsupported file')
    expect(submitBtn(second.wrapper).attributes('disabled')).toBeUndefined()

    m.createPresentation.mockRejectedValue(new ApiError('Generation is disabled', 400))
    const third = await mountView()
    await typeTopic(third.wrapper, 'Topic')
    await submit(third.wrapper)
    expect(third.wrapper.get('[role="alert"]').text()).toContain('Generation is disabled')
  })

  describe('Create outline', () => {
    const primary = (w: W) => w.get('[data-testid="wizard-primary"]')

    it('the Topic step primary is the solid Next: Presenter, enabled with a topic and a template; it creates nothing', async () => {
      const { wrapper } = await mountView()
      expect(primary(wrapper).text()).toBe('Next: Presenter')
      expect(primary(wrapper).attributes('type')).toBe('submit')
      expect(primary(wrapper).classes().join(' ')).toContain('bg-accent')
      expect(primary(wrapper).attributes('disabled')).toBeDefined()
      await typeTopic(wrapper)
      expect(primary(wrapper).attributes('disabled')).toBeUndefined()
      await primary(wrapper).trigger('click')
      await flushPromises()
      expect(m.createPresentation).not.toHaveBeenCalled()
    })

    it('Create outline on the Presenter step is disabled while something is missing, and the footer sends you back to fix it', async () => {
      const { wrapper } = await mountView('both', {}, '/new')
      await goTo(wrapper, 'presenter')
      expect(primary(wrapper).text()).toBe('Create outline')
      expect(primary(wrapper).attributes('disabled')).toBeDefined()
      expect(status(wrapper)).toBe('Add a topic or a document · Pick a template')
      await wrapper.get('[data-testid="fix-topic"]').trigger('click')
      await flushPromises()
      expect(document.activeElement?.id).toBe('create-prompt')
    })

    it('a document counts as a topic', async () => {
      const { wrapper } = await mountView()
      await attach(wrapper)
      expect(primary(wrapper).attributes('disabled')).toBeUndefined()
    })

    it('names what is missing in the footer, each a button that takes you there', async () => {
      const { wrapper } = await mountView('both', {}, '/new')
      expect(primary(wrapper).attributes('disabled')).toBeDefined()
      expect(status(wrapper)).toBe('Add a topic or a document · Pick a template')
      expect(wrapper.get('[data-testid="fix-topic"]').element.tagName).toBe('BUTTON')

      // Focus is somewhere else first, so the move is visible.
      ;(wrapper.get('[data-testid="chip-style"]').element as HTMLElement).focus()
      await wrapper.get('[data-testid="fix-topic"]').trigger('click')
      expect(document.activeElement?.id).toBe('create-prompt')

      await typeTopic(wrapper)
      expect(status(wrapper)).toBe('Pick a template')
      expect(wrapper.find('[data-testid="fix-topic"]').exists()).toBe(false)
      const scroll = vi.fn()
      ;(wrapper.get('[aria-labelledby="new-look-h"]').element as HTMLElement).scrollIntoView = scroll
      await wrapper.get('[data-testid="fix-look"]').trigger('click')
      await flushPromises()
      expect(scroll).toHaveBeenCalled()
      expect(document.activeElement).toBe(wrapper.get('[data-testid="new-template-c1"]').element)
    })

    it('with a template picked and no topic, only the topic is named', async () => {
      const { wrapper } = await mountView()
      expect(status(wrapper)).toBe('Add a topic or a document')
      await typeTopic(wrapper)
      expect(status(wrapper)).toBe('')
    })

    it('Enter in the form goes to what is missing before anything else', async () => {
      m.createPresentation.mockResolvedValue({ id: 'abc' })
      const { wrapper } = await mountView('both', {}, '/new')
      await typeTopic(wrapper)
      ;(document.activeElement as HTMLElement | null)?.blur()
      await wrapper.get('form').trigger('submit')
      await flushPromises()
      expect(m.createPresentation).not.toHaveBeenCalled()
      expect(document.activeElement).toBe(wrapper.get('[data-testid="new-template-c1"]').element.closest('[role="radiogroup"]')?.querySelector('[role="radio"]'))
    })
  })

  describe('topic step', () => {
    it('focuses the composer on arrival', async () => {
      await mountView()
      await flushPromises()
      expect(document.activeElement?.id).toBe('create-prompt')
    })

    const ctrlEnter = (w: W) => w.get('#create-prompt').trigger('keydown', { key: 'Enter', ctrlKey: true })

    it('says what the shortcut does', async () => {
      const { wrapper } = await mountView()
      expect(wrapper.get('[data-testid="dropzone"]').text()).toMatch(/Enter\s*for next: Presenter/)
    })

    it('Ctrl+Enter goes on to the Presenter step when it can', async () => {
      const { wrapper } = await mountView()
      await typeTopic(wrapper)
      await ctrlEnter(wrapper)
      await flushPromises()
      expect(wrapper.get('h2').text()).toBe('Who presents?')
      expect(m.createPresentation).not.toHaveBeenCalled()
    })

    it('Cmd+Enter works too', async () => {
      const { wrapper } = await mountView()
      await typeTopic(wrapper)
      await wrapper.get('#create-prompt').trigger('keydown', { key: 'Enter', metaKey: true })
      await flushPromises()
      expect(wrapper.get('h2').text()).toBe('Who presents?')
    })

    it('Ctrl+Enter without a template focuses the template grid and creates nothing', async () => {
      const { wrapper } = await mountView('both', {}, '/new')
      await typeTopic(wrapper)
      await ctrlEnter(wrapper)
      await flushPromises()
      expect(m.createPresentation).not.toHaveBeenCalled()
      expect(document.activeElement?.getAttribute('role')).toBe('radio')
      expect(document.activeElement?.getAttribute('data-testid')).toBe('new-template-c1')
    })

    it('Ctrl+Enter with nothing typed keeps the cursor in the composer', async () => {
      const { wrapper } = await mountView()
      ;(wrapper.get('[data-testid="chip-style"]').element as HTMLElement).focus()
      await ctrlEnter(wrapper)
      await flushPromises()
      expect(m.createPresentation).not.toHaveBeenCalled()
      expect(document.activeElement?.id).toBe('create-prompt')
    })
  })

  describe('submit', () => {
    it('submit navigates to create outline with the template', async () => {
      m.createPresentation.mockResolvedValue({ id: 'abc' })
      const { wrapper, router } = await mountView('both', {}, '/new?template=c1')
      await typeTopic(wrapper)
      await submit(wrapper)
      expect(router.currentRoute.value.name).toBe('create')
      expect(router.currentRoute.value.params).toMatchObject({ id: 'abc', step: 'outline' })
      expect(router.currentRoute.value.query).toEqual({ template: 'c1' })
      // The deck remembers its look: the Outline step finds it even when reached without the query.
      expect(JSON.parse(localStorage.getItem('slideshows.deckLook.abc')!)).toEqual({ template: 'c1' })
      const payload = m.createPresentation.mock.calls[0][0]
      expect(payload).not.toHaveProperty('template')
      expect(payload).not.toHaveProperty('layout')
    })

    it('still submits when the look cannot be remembered', async () => {
      const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('quota')
      })
      try {
        m.createPresentation.mockResolvedValue({ id: 'abc' })
        const { wrapper, router } = await mountView()
        await typeTopic(wrapper)
        await submit(wrapper)
        expect(router.currentRoute.value.name).toBe('create')
      } finally {
        setItem.mockRestore()
      }
    })
  })

  describe('draft', () => {
    it('draft survives remount, chip values included', async () => {
      const first = await mountView()
      await typeTopic(first.wrapper, 'Octopuses')
      await (await openChip(first.wrapper, 'length')).get('#opt-slides').setValue('7')
      first.wrapper.unmount()
      document.body.innerHTML = ''
      const second = await mountView()
      expect((second.wrapper.get('#create-prompt').element as HTMLTextAreaElement).value).toBe('Octopuses')
      expect(chipText(second.wrapper, 'length')).toContain('7 slides')
      expect((await openChip(second.wrapper, 'length')).get('#opt-slides').element).toHaveProperty('value', '7')
    })

    it('draft cleared after create', async () => {
      m.createPresentation.mockResolvedValue({ id: 'abc' })
      const { wrapper } = await mountView()
      await typeTopic(wrapper, 'Octopuses')
      expect(localStorage.getItem('slideshows.newDraft.v1')).toContain('Octopuses')
      await submit(wrapper)
      expect(localStorage.getItem('slideshows.newDraft.v1')).toBeNull()
    })

    it('asks to re-add documents when a restored draft had files', async () => {
      const first = await mountView()
      await attach(first.wrapper)
      expect(JSON.parse(localStorage.getItem('slideshows.newDraft.v1')!).hadFiles).toBe(true)
      first.wrapper.unmount()
      const second = await mountView()
      expect(second.wrapper.text()).toContain("Re-add your documents; files aren't kept after a reload.")
    })

    it('a failed create keeps the draft and keeps saving', async () => {
      m.createPresentation.mockRejectedValue(new ApiError('Generation is disabled', 400))
      const { wrapper } = await mountView()
      await typeTopic(wrapper, 'Octopuses')
      await submit(wrapper)
      expect(localStorage.getItem('slideshows.newDraft.v1')).toContain('Octopuses')
      await goTo(wrapper, 'topic')
      await typeTopic(wrapper, 'Squids')
      expect(localStorage.getItem('slideshows.newDraft.v1')).toContain('Squids')
    })

    it('restores a draft left in localStorage by a killed tab (sessionStorage is empty)', async () => {
      sessionStorage.clear()
      localStorage.setItem('slideshows.newDraft.v1', JSON.stringify({ prompt: 'Kraken', options: { slides: '9' }, hadFiles: true, hadPhoto: false, savedAt: Date.now() }))
      const { wrapper } = await mountView()
      expect((wrapper.get('#create-prompt').element as HTMLTextAreaElement).value).toBe('Kraken')
      expect(wrapper.text()).toContain("Re-add your documents; files aren't kept after a reload.")
    })

    it('drops a draft older than two weeks', async () => {
      localStorage.setItem('slideshows.newDraft.v1', JSON.stringify({ prompt: 'Stale', options: {}, hadFiles: false, hadPhoto: false, savedAt: Date.now() - 15 * 24 * 3600 * 1000 }))
      const { wrapper } = await mountView()
      expect((wrapper.get('#create-prompt').element as HTMLTextAreaElement).value).toBe('')
    })

    it('survives unusable storage', async () => {
      localStorage.setItem('slideshows.newDraft.v1', '{not json')
      const { wrapper } = await mountView()
      expect((wrapper.get('#create-prompt').element as HTMLTextAreaElement).value).toBe('')
    })
  })

  describe('template selector', () => {
    it('has nothing chosen with no ?template, and offers no "Decide later"', async () => {
      const { wrapper } = await mountView('both', {}, '/new')
      expect(wrapper.find('[data-testid="new-template-none"]').exists()).toBe(false)
      expect(wrapper.get('[data-testid="new-template-c1"]').attributes('aria-checked')).toBe('false')
    })

    it('preselects from ?template', async () => {
      const { wrapper } = await mountView()
      expect(wrapper.get('[data-testid="new-template-c1"]').attributes('aria-checked')).toBe('true')
      expect(wrapper.get('[data-testid="new-template-c1"]').text()).toContain('Pitch')
      expect(wrapper.get('[data-testid="step-topic"]').text()).toContain('Pitch')
    })

    it('picking a template writes ?template', async () => {
      const { wrapper, router } = await mountView('both', {}, '/new')
      await wrapper.get('[data-testid="new-template-c1"]').trigger('click')
      await flushPromises()
      expect(router.currentRoute.value.query.template).toBe('c1')
    })

    it('explains an empty template list', async () => {
      m.listTemplates.mockResolvedValue([])
      const { wrapper } = await mountView('both', {}, '/new')
      expect(wrapper.text()).toContain('No templates are available yet')
      expect(status(wrapper)).toContain('Pick a template')
    })

    it('blocks creating when templates fail to load, with the reason', async () => {
      m.listTemplates.mockRejectedValue(new Error('boom'))
      const { wrapper } = await mountView('both', {}, '/new')
      expect(wrapper.text()).toContain('Templates couldn’t load')
      expect(status(wrapper)).toContain('Pick a template')
    })

    it('drops an unknown template id', async () => {
      const { wrapper, router } = await mountView('both', {}, '/new?template=zzz')
      expect(router.currentRoute.value.query.template).toBeUndefined()
      expect(wrapper.get('[data-testid="new-template-c1"]').attributes('aria-checked')).toBe('false')
    })
  })
})

describe('From PowerPoint', () => {
  const primary = (w: W) => w.get('[data-testid="wizard-primary"]')
  const previewOf = (n: number, extra: Record<string, unknown> = {}) => ({
    slide_image_urls: Array.from({ length: n }, (_, i) => `/app_data/q3/slide_${i + 1}.png`),
    pptx_url: '/app_data/q3.pptx',
    modified_pptx_url: '/app_data/q3-modified.pptx',
    fonts: { Inter: '/fonts/inter.ttf' },
    original_slide_count: null,
    ...extra,
  })
  async function switchMode(w: W, to: 'topic' | 'pptx') {
    await w.get(`[data-testid="start-mode-${to}"]`).trigger('click')
    await flushPromises()
  }
  async function uploadDeck(w: W, name = 'Q3 Review.pptx') {
    const input = w.get('[data-testid="import-file-input"]')
    const file = new File(['x'], name)
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    await input.trigger('change')
    await flushPromises()
    return file
  }
  async function chooseLanguage(w: W, language = 'English') {
    await w.get('#opt-language').setValue(language)
    await flushPromises()
  }
  /** A deck uploaded, English chosen, on the Presenter step. */
  async function readyToImport(path = '/new?start=pptx', withPhoto = true) {
    const mountedView = await mountView('both', {}, path)
    await uploadDeck(mountedView.wrapper)
    await chooseLanguage(mountedView.wrapper)
    const photo = withPhoto ? await addPhoto(mountedView.wrapper) : null
    await goTo(mountedView.wrapper, 'presenter')
    return { ...mountedView, photo }
  }

  beforeEach(() => {
    m.prepareImport.mockResolvedValue(previewOf(12))
    m.importPresentation.mockResolvedValue({ id: 'new-id' })
    m.uploadPortrait.mockResolvedValue({})
  })

  it('shows the topic view by default and the PowerPoint view on ?start=pptx', async () => {
    const topic = await mountView()
    expect(topic.wrapper.get('[data-testid="start-mode-topic"]').attributes('aria-checked')).toBe('true')
    expect(topic.wrapper.get('[data-testid="start-mode-pptx"]').attributes('aria-checked')).toBe('false')
    expect(topic.wrapper.find('#create-prompt').exists()).toBe(true)
    expect(topic.wrapper.find('[data-testid="import-dropzone"]').exists()).toBe(false)
    topic.wrapper.unmount()

    const pptx = await mountView('both', {}, '/new?start=pptx')
    expect(pptx.wrapper.get('[data-testid="start-mode-pptx"]').attributes('aria-checked')).toBe('true')
    expect(pptx.wrapper.get('[role="radiogroup"]').text()).toContain('From a topic')
    expect(pptx.wrapper.find('[data-testid="import-dropzone"]').exists()).toBe(true)
    expect(pptx.wrapper.find('#create-prompt').exists()).toBe(false)
  })

  it('switching modes keeps the typed topic and the uploaded deck', async () => {
    const { wrapper, router } = await mountView()
    await typeTopic(wrapper, 'Octopuses')
    await switchMode(wrapper, 'pptx')
    expect(router.currentRoute.value.query).toEqual({ template: 'c1', start: 'pptx' })
    await uploadDeck(wrapper)
    expect(wrapper.findAll('[data-testid="pptx-thumbs"] img')).toHaveLength(12)

    await switchMode(wrapper, 'topic')
    expect(router.currentRoute.value.query).toEqual({ template: 'c1' })
    expect((wrapper.get('#create-prompt').element as HTMLTextAreaElement).value).toBe('Octopuses')

    await switchMode(wrapper, 'pptx')
    expect(wrapper.findAll('[data-testid="pptx-thumbs"] img')).toHaveLength(12)
    expect(wrapper.text()).toContain('Q3 Review.pptx')
    expect(m.prepareImport).toHaveBeenCalledTimes(1)
  })

  it('hides the template grid and setup chips in PowerPoint mode', async () => {
    const { wrapper } = await mountView('both', {}, '/new?start=pptx')
    await uploadDeck(wrapper)
    expect(wrapper.find('[data-testid="setup-chips"]').exists()).toBe(false)
    expect(wrapper.find('[aria-labelledby="new-look-h"]').exists()).toBe(false)
    expect(wrapper.find('#create-prompt').exists()).toBe(false)
    // The step bar sums the deck up instead of a prompt and a template.
    expect(wrapper.get('[data-testid="step-topic"]').text()).toContain('Q3 Review.pptx · 12 slides')
  })

  it('shows the first-50 note', async () => {
    m.prepareImport.mockResolvedValue(previewOf(50, { original_slide_count: 70 }))
    const { wrapper } = await mountView('both', {}, '/new?start=pptx')
    await uploadDeck(wrapper)
    const note = wrapper.get('[data-testid="pptx-limit-note"]').text()
    expect(note).toContain('50')
    expect(note).toContain('70')
  })

  it('missing fonts show a warning whose Fix applies replacements', async () => {
    m.checkFonts.mockResolvedValue([{ name: 'Brand Sans' }])
    const { wrapper } = await mountView('both', {}, '/new?start=pptx')
    const deck = await uploadDeck(wrapper)
    const warning = wrapper.get('[data-testid="pptx-fonts-note"]')
    expect(warning.attributes('role')).toBe('note')
    expect(warning.text()).toContain('Brand Sans')
    await wrapper.get('[data-testid="pptx-fonts-fix"]').trigger('click')
    await flushPromises()
    const dialog = new DOMWrapper(document.body.querySelector('[role="dialog"]')!)
    const input = dialog.get('input[type="file"]')
    const font = new File(['f'], 'brand.ttf')
    Object.defineProperty(input.element, 'files', { value: [font], configurable: true })
    await input.trigger('change')
    await flushPromises()
    expect(dialog.text()).toContain('brand.ttf')
    await dialog.get('[data-testid="pptx-fonts-apply"]').trigger('click')
    await flushPromises()
    expect(m.prepareImport).toHaveBeenLastCalledWith(deck, [{ name: 'Brand Sans', file: font }])
    expect(wrapper.findAll('[data-testid="pptx-thumbs"] img')).toHaveLength(12)
  })

  it('Next needs a deck and a language', async () => {
    const { wrapper } = await mountView('both', {}, '/new?start=pptx')
    expect(primary(wrapper).attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="fix-deck"]').text()).toBe('Upload a PowerPoint')
    await wrapper.get('[data-testid="fix-deck"]').trigger('click')
    await flushPromises()
    expect(document.activeElement?.getAttribute('data-testid')).toBe('import-file-input')

    await uploadDeck(wrapper)
    expect(wrapper.find('[data-testid="fix-deck"]').exists()).toBe(false)
    expect(primary(wrapper).attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="fix-language"]').text()).toBe('Choose the narration language')
    await wrapper.get('[data-testid="fix-language"]').trigger('click')
    await flushPromises()
    expect(document.activeElement?.id).toBe('opt-language')
    // Enter goes to the language too; nothing is imported.
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('h2').text()).not.toBe('Who presents?')
    expect(m.importPresentation).not.toHaveBeenCalled()

    await chooseLanguage(wrapper)
    expect(primary(wrapper).attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[data-testid="fix-language"]').exists()).toBe(false)
  })

  it('no upload blocker while the first deck is being read', async () => {
    let finish!: (p: unknown) => void
    m.prepareImport.mockReturnValue(new Promise((r) => (finish = r)))
    const { wrapper } = await mountView('both', {}, '/new?start=pptx')
    expect(wrapper.get('[data-testid="fix-deck"]').text()).toBe('Upload a PowerPoint')
    await uploadDeck(wrapper)
    expect(wrapper.find('[data-testid="import-dropzone"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="fix-deck"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="fix-language"]').text()).toBe('Choose the narration language')
    finish(previewOf(12))
    await flushPromises()
    expect(wrapper.find('[data-testid="fix-deck"]').exists()).toBe(false)
  })

  it('Import slides creates the deck and lands on Preview', async () => {
    const { wrapper, router, photo } = await readyToImport()
    expect(primary(wrapper).text()).toBe('Import slides')
    await wrapper.get('#opt-videos').setValue('3')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(m.importPresentation).toHaveBeenCalledTimes(1)
    expect(m.importPresentation).toHaveBeenCalledWith({
      pptx_url: '/app_data/q3-modified.pptx',
      language: 'English',
      n_videos: 3,
      fonts: { Inter: '/fonts/inter.ttf' },
      title: 'Q3 Review',
      source_name: 'Q3 Review.pptx',
    })
    expect(m.uploadPortrait).toHaveBeenCalledWith('new-id', photo)
    expect(m.createPresentation).not.toHaveBeenCalled()
    expect(router.currentRoute.value.fullPath).toBe('/p/new-id/create/preview')
    // No template look, no animation flag; the draft is done.
    expect(localStorage.getItem('slideshows.deckLook.new-id')).toBeNull()
    expect(Object.keys(sessionStorage).filter((k) => k.includes('new-id'))).toEqual([])
    expect(localStorage.getItem('slideshows.newDraft.v1')).toBeNull()
  })

  it('Automatic presenter count is sent as null', async () => {
    const { wrapper } = await readyToImport()
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(m.importPresentation).toHaveBeenCalledWith(expect.objectContaining({ n_videos: null }))
  })

  it('no photo sends 0', async () => {
    const { wrapper } = await readyToImport('/new?start=pptx', false)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(m.importPresentation).toHaveBeenCalledWith(expect.objectContaining({ n_videos: 0 }))
    expect(m.uploadPortrait).not.toHaveBeenCalled()
  })

  it('a presenter count above the slide count is sent as the slide count', async () => {
    const { wrapper } = await mountView()
    await addPhoto(wrapper)
    await goTo(wrapper, 'presenter')
    await wrapper.get('#opt-videos').setValue('30')
    await goTo(wrapper, 'topic')
    await switchMode(wrapper, 'pptx')
    await uploadDeck(wrapper)
    await chooseLanguage(wrapper)
    await goTo(wrapper, 'presenter')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(m.importPresentation).toHaveBeenCalledWith(expect.objectContaining({ n_videos: 12 }))
  })

  it('a failed import keeps everything and says why', async () => {
    m.importPresentation.mockRejectedValue(new ApiError('The deck could not be read', 422))
    const { wrapper, router } = await readyToImport()
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('new')
    expect(wrapper.text()).toContain('The deck could not be read')
    expect(primary(wrapper).attributes('disabled')).toBeUndefined()
  })

  it('a .pptx attached in topic mode offers to switch, moving the file over', async () => {
    const { wrapper, router } = await mountView()
    expect(wrapper.find('[data-testid="pptx-hint"]').exists()).toBe(false)
    const input = wrapper.get('[data-testid="file-input"]')
    const deck = new File(['x'], 'Q3 Review.pptx')
    Object.defineProperty(input.element, 'files', { value: [deck], configurable: true })
    await input.trigger('change')
    await flushPromises()
    const hint = wrapper.get('[data-testid="pptx-hint"]')
    expect(hint.attributes('role')).toBe('note')
    expect(hint.text()).toContain('Keep its design?')
    const button = hint.get('button')
    expect(button.text()).toBe('Switch to From PowerPoint')
    expect(button.attributes('type')).toBe('button')
    await button.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.start).toBe('pptx')
    expect(m.prepareImport).toHaveBeenCalledWith(deck, [])
    expect(wrapper.findAll('[data-testid="pptx-thumbs"] img')).toHaveLength(12)

    await switchMode(wrapper, 'topic')
    expect(wrapper.find('[data-testid="pptx-hint"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Q3 Review.pptx')
  })
})
