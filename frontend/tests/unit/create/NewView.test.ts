import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
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
  listThemes: vi.fn(),
}))
vi.mock('@/api/templates', async (orig) => ({ ...(await orig<typeof import('@/api/templates')>()), listTemplates: m.listTemplates }))
vi.mock('@/api/themes', async (orig) => ({ ...(await orig<typeof import('@/api/themes')>()), listThemes: m.listThemes }))
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
async function visit(w: W, key: 'topic' | 'look' | 'details') {
  await w.get(`[data-testid="step-${key}"]`).trigger('click')
  await flushPromises()
}
async function typeTopic(w: W, text = 'Quarterly review') {
  await w.get('#create-prompt').setValue(text)
}
async function submit(w: W) {
  await w.get('form').trigger('submit')
  await flushPromises()
}

async function attach(w: W, name = 'brief.pdf') {
  const input = w.get('[data-testid="file-input"]')
  const file = new File(['x'], name, { type: 'application/pdf' })
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
  await input.trigger('change')
  return file
}

beforeEach(() => {
  Object.values(m).forEach((f) => f.mockReset())
  m.listTemplates.mockResolvedValue([{ id: 'c1', name: 'Pitch', kind: 'custom', layouts: [{}] }])
  m.listThemes.mockResolvedValue([{ id: 't1', name: 'Ocean', user: 'u', data: { colors: {} } }])
  document.body.innerHTML = ''
  sessionStorage.clear()
})

describe('NewView', () => {
  it('prefills web search from the runtime config', async () => {
    const { wrapper } = await mountView('both', { WEB_GROUNDING: true })
    await visit(wrapper, 'details')
    expect(wrapper.get('#opt-web').attributes('aria-checked')).toBe('true')
  })

  it('disables submit with no prompt and no files, and says why with a way back to Topic', async () => {
    const { wrapper } = await mountView()
    await visit(wrapper, 'details')
    expect(submitBtn(wrapper).attributes('disabled')).toBeDefined()
    expect(status(wrapper)).toContain('Add a topic or a document')
    await wrapper.get('[data-testid="fix-topic"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('#create-prompt').exists()).toBe(true)
    await typeTopic(wrapper)
    await visit(wrapper, 'details')
    expect(submitBtn(wrapper).attributes('disabled')).toBeUndefined()
  })

  it('clamps the slide count to 1-50', async () => {
    const { wrapper } = await mountView()
    await visit(wrapper, 'details')
    const input = wrapper.get('#opt-slides')
    await input.setValue('99')
    expect((input.element as HTMLInputElement).value).toBe('50')
    await input.setValue('0')
    expect((input.element as HTMLInputElement).value).toBe('')
  })

  it('clamps the image count to 0-50, keeping 0 as "none"', async () => {
    const { wrapper } = await mountView()
    await visit(wrapper, 'details')
    const input = wrapper.get('#opt-images')
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
    await visit(wrapper, 'details')
    if (label) {
      const chip = wrapper.findAll('[aria-label="Image count"] [role="radio"]').find((b) => b.text() === label)!
      await chip.trigger('click')
      expect(chip.attributes('aria-checked')).toBe('true')
    }
    if (typed) await wrapper.get('#opt-images').setValue(typed)
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
    await visit(wrapper, 'details')
    if (label) {
      const chip = wrapper.findAll('[aria-label="Presenter video count"] [role="radio"]').find((b) => b.text() === label)!
      await chip.trigger('click')
      expect(chip.attributes('aria-checked')).toBe('true')
    }
    if (typed) await wrapper.get('#opt-videos').setValue(typed)
    await submit(wrapper)
    expect(m.createPresentation).toHaveBeenCalledWith(expect.objectContaining({ n_videos: expected, n_images: null }))
  })

  it('says presenter slots wait for avatar generation', async () => {
    const { wrapper } = await mountView()
    await visit(wrapper, 'details')
    expect(wrapper.text()).toContain('Slots show a placeholder until you generate avatars in the Avatars panel')
  })

  it('renders no mode switch, creates a standard presentation and routes to the outline, without file calls', async () => {
    m.createPresentation.mockResolvedValue({ id: 'abc' })
    const { wrapper, router } = await mountView()
    expect(wrapper.text()).not.toMatch(/smart/i)
    await typeTopic(wrapper)
    await visit(wrapper, 'details')
    await wrapper.get('#opt-slides').setValue('8')
    await submit(wrapper)
    expect(m.uploadFiles).not.toHaveBeenCalled()
    expect(m.decomposeFiles).not.toHaveBeenCalled()
    expect(m.createPresentation).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Quarterly review', n_slides: 8, file_paths: [], generation_mode: 'standard', tone: 'default', verbosity: 'standard' }),
    )
    expect(router.currentRoute.value.fullPath).toBe('/p/abc/create/outline?template=c1')
  })

  it('animate is off by default: nothing is handed to the editor', async () => {
    m.createPresentation.mockResolvedValue({ id: 'abc' })
    const { wrapper } = await mountView()
    await typeTopic(wrapper)
    await visit(wrapper, 'details')
    expect(wrapper.get('#opt-animate').attributes('aria-checked')).toBe('false')
    await submit(wrapper)
    expect(m.createPresentation.mock.calls[0]![0]).not.toHaveProperty('animate')
    expect(sessionStorage.getItem('slideshows.animate.abc')).toBeNull()
  })

  it('with animate on, flags the new deck so the editor plans its motion after generation', async () => {
    m.createPresentation.mockResolvedValue({ id: 'abc' })
    const { wrapper, router } = await mountView()
    await typeTopic(wrapper)
    await visit(wrapper, 'details')
    await wrapper.get('#opt-animate').trigger('click')
    expect(wrapper.get('#opt-animate').attributes('aria-checked')).toBe('true')
    await submit(wrapper)
    expect(sessionStorage.getItem('slideshows.animate.abc')).toBe('1')
    expect(router.currentRoute.value.name).toBe('create')
  })

  it('uploads, decomposes and sends the extracted paths', async () => {
    m.uploadFiles.mockResolvedValue(['up/1'])
    m.decomposeFiles.mockResolvedValue(['/doc/1.txt'])
    m.createPresentation.mockResolvedValue({ id: 'f1' })
    const { wrapper } = await mountView()
    const file = await attach(wrapper)
    await visit(wrapper, 'details')
    await wrapper.get('#opt-language').setValue('English')
    await submit(wrapper)
    expect(m.uploadFiles).toHaveBeenCalledWith([file])
    expect(m.decomposeFiles).toHaveBeenCalledWith(['up/1'], 'English')
    expect(m.createPresentation).toHaveBeenCalledWith(expect.objectContaining({ file_paths: ['/doc/1.txt'], language: 'English' }))
  })

  it('asks for a language before processing documents', async () => {
    const { wrapper } = await mountView()
    await attach(wrapper)
    await visit(wrapper, 'details')
    await submit(wrapper)
    expect(wrapper.get('[role="alert"]').text()).toContain('language')
    expect(m.uploadFiles).not.toHaveBeenCalled()
  })

  it('stays pending until navigation settles, and recovers from failures with the server message', async () => {
    let resolve!: (v: { id: string }) => void
    m.createPresentation.mockReturnValueOnce(new Promise((r) => (resolve = r)))
    const { wrapper } = await mountView()
    await typeTopic(wrapper, 'Topic')
    await visit(wrapper, 'details')
    await submit(wrapper)
    expect(submitBtn(wrapper).attributes('disabled')).toBeDefined()
    expect(submitBtn(wrapper).text()).toContain('Working')
    expect(status(wrapper)).toContain('Preparing outline')
    resolve({ id: 'p1' })
    await flushPromises()

    m.uploadFiles.mockRejectedValue(new ApiError('Unsupported file', 422))
    const second = await mountView()
    await attach(second.wrapper)
    await visit(second.wrapper, 'details')
    await second.wrapper.get('#opt-language').setValue('English')
    await submit(second.wrapper)
    expect(second.wrapper.get('[role="alert"]').text()).toBe('Unsupported file')
    expect(submitBtn(second.wrapper).attributes('disabled')).toBeUndefined()

    m.createPresentation.mockRejectedValue(new ApiError('Generation is disabled', 400))
    const third = await mountView()
    await typeTopic(third.wrapper, 'Topic')
    await visit(third.wrapper, 'details')
    await submit(third.wrapper)
    expect(third.wrapper.get('[role="alert"]').text()).toBe('Generation is disabled')
  })

  describe('wizard shell', () => {
    it('shows the deck steps locked, with the avatar badge following the videos option', async () => {
      const { wrapper } = await mountView()
      for (const k of ['outline', 'preview', 'avatar', 'export']) {
        const b = wrapper.get(`[data-testid="step-${k}"]`)
        expect(b.attributes('data-state')).toBe('locked')
        expect(b.attributes('title')).toBe('Create the outline first')
      }
      await wrapper.get('[data-testid="step-outline"]').trigger('click')
      expect(wrapper.find('#create-prompt').exists()).toBe(true)
    })

    it.each([
      ['0', 'Optional'],
      ['2', 'Required'],
      ['', 'Decided after Preview'],
    ])('avatar badge follows videos option %j', async (videos, badge) => {
      const { wrapper } = await mountView()
      await visit(wrapper, 'details')
      if (videos) await wrapper.get('#opt-videos').setValue(videos)
      expect(wrapper.get('[data-testid="step-avatar"]').text()).toContain(badge)
    })

    it('Alt+ArrowRight acts like Continue (Topic to Look to Details) and never submits', async () => {
      const { wrapper } = await mountView()
      const press = async (key: string) => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key, altKey: true }))
        await flushPromises()
      }
      await press('ArrowRight')
      expect(wrapper.find('[data-testid="new-template-c1"]').exists()).toBe(true)
      await press('ArrowRight')
      expect(wrapper.find('#opt-slides').exists()).toBe(true)
      await press('ArrowRight')
      expect(m.createPresentation).not.toHaveBeenCalled()
      await press('ArrowLeft')
      expect(wrapper.find('[data-testid="new-template-c1"]').exists()).toBe(true)
    })

    it('Alt+ArrowRight on Look without a template stays put', async () => {
      const { wrapper } = await mountView('both', {}, '/new')
      await visit(wrapper, 'look')
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true }))
      await flushPromises()
      expect(wrapper.find('#opt-slides').exists()).toBe(false)
    })
  })

  describe('look', () => {
    it('requires a template: primary disabled with the reason in the footer', async () => {
      const { wrapper } = await mountView('both', {}, '/new')
      await visit(wrapper, 'look')
      const primary = wrapper.get('[data-testid="wizard-primary"]')
      expect(primary.attributes('disabled')).toBeDefined()
      expect(status(wrapper)).toContain('Pick a template to continue')
      await wrapper.get('[data-testid="new-template-c1"]').trigger('click')
      await flushPromises()
      expect(wrapper.get('[data-testid="wizard-primary"]').attributes('disabled')).toBeUndefined()
      await wrapper.get('[data-testid="wizard-primary"]').trigger('click')
      await flushPromises()
      expect(wrapper.find('#opt-slides').exists()).toBe(true)
    })

    it('Details names the missing template and jumps to Look', async () => {
      const { wrapper } = await mountView('both', {}, '/new')
      await typeTopic(wrapper)
      await visit(wrapper, 'details')
      expect(submitBtn(wrapper).attributes('disabled')).toBeDefined()
      expect(status(wrapper)).toContain('Pick a template')
      await wrapper.get('[data-testid="fix-look"]').trigger('click')
      await flushPromises()
      expect(wrapper.find('[data-testid="new-template-c1"]').exists()).toBe(true)
    })
  })

  describe('submit', () => {
    it('submit navigates to create outline with template and theme', async () => {
      m.createPresentation.mockResolvedValue({ id: 'abc' })
      const { wrapper, router } = await mountView('both', {}, '/new?template=c1&theme=t1')
      await typeTopic(wrapper)
      await visit(wrapper, 'details')
      await submit(wrapper)
      expect(router.currentRoute.value.name).toBe('create')
      expect(router.currentRoute.value.params).toMatchObject({ id: 'abc', step: 'outline' })
      expect(router.currentRoute.value.query).toEqual({ template: 'c1', theme: 't1' })
      const payload = m.createPresentation.mock.calls[0][0]
      expect(payload).not.toHaveProperty('template')
      expect(payload).not.toHaveProperty('layout')
    })

    it('still submits when themes fail to load', async () => {
      m.listThemes.mockRejectedValue(new Error('boom'))
      m.createPresentation.mockResolvedValue({ id: 'abc' })
      const { wrapper, router } = await mountView()
      await typeTopic(wrapper)
      await visit(wrapper, 'details')
      await submit(wrapper)
      expect(router.currentRoute.value.query.theme).toBeUndefined()
      expect(router.currentRoute.value.name).toBe('create')
    })
  })

  describe('draft', () => {
    it('draft survives remount', async () => {
      const first = await mountView()
      await typeTopic(first.wrapper, 'Octopuses')
      await visit(first.wrapper, 'details')
      await first.wrapper.get('#opt-slides').setValue('7')
      first.wrapper.unmount()
      const second = await mountView()
      expect((second.wrapper.get('#create-prompt').element as HTMLTextAreaElement).value).toBe('Octopuses')
      await visit(second.wrapper, 'details')
      expect((second.wrapper.get('#opt-slides').element as HTMLInputElement).value).toBe('7')
    })

    it('draft cleared after create', async () => {
      m.createPresentation.mockResolvedValue({ id: 'abc' })
      const { wrapper } = await mountView()
      await typeTopic(wrapper, 'Octopuses')
      expect(sessionStorage.getItem('slideshows.newDraft')).toContain('Octopuses')
      await visit(wrapper, 'details')
      await submit(wrapper)
      expect(sessionStorage.getItem('slideshows.newDraft')).toBeNull()
    })

    it('asks to re-add documents when a restored draft had files', async () => {
      const first = await mountView()
      await attach(first.wrapper)
      expect(JSON.parse(sessionStorage.getItem('slideshows.newDraft')!).hadFiles).toBe(true)
      first.wrapper.unmount()
      const second = await mountView()
      expect(second.wrapper.text()).toContain("Re-add your documents; files aren't kept after a reload.")
    })

    it('survives unusable storage', async () => {
      sessionStorage.setItem('slideshows.newDraft', '{not json')
      const { wrapper } = await mountView()
      expect((wrapper.get('#create-prompt').element as HTMLTextAreaElement).value).toBe('')
    })
  })

  describe('template selector', () => {
    it('defaults to "Decide later" with no ?template', async () => {
      const { wrapper } = await mountView('both', {}, '/new')
      await visit(wrapper, 'look')
      expect(wrapper.get('[data-testid="new-template-none"]').attributes('aria-checked')).toBe('true')
      expect(wrapper.get('[data-testid="new-template-c1"]').attributes('aria-checked')).toBe('false')
    })

    it('preselects from ?template', async () => {
      const { wrapper } = await mountView()
      await visit(wrapper, 'look')
      expect(wrapper.get('[data-testid="new-template-c1"]').attributes('aria-checked')).toBe('true')
      expect(wrapper.get('[data-testid="new-template-c1"]').text()).toContain('Pitch')
      expect(wrapper.get('[data-testid="step-look"]').text()).toContain('Pitch')
    })

    it('picking a template writes ?template, and "Decide later" removes it', async () => {
      const { wrapper, router } = await mountView('both', {}, '/new')
      await visit(wrapper, 'look')
      await wrapper.get('[data-testid="new-template-c1"]').trigger('click')
      await flushPromises()
      expect(router.currentRoute.value.query.template).toBe('c1')
      await wrapper.get('[data-testid="new-template-none"]').trigger('click')
      await flushPromises()
      expect(router.currentRoute.value.query.template).toBeUndefined()
    })

    it('blocks creating when templates fail to load, with the reason', async () => {
      m.listTemplates.mockRejectedValue(new Error('boom'))
      const { wrapper } = await mountView('both', {}, '/new')
      await visit(wrapper, 'look')
      expect(wrapper.text()).toContain('Templates couldn’t load')
      expect(status(wrapper)).toContain('Pick a template to continue')
    })

    it('drops an unknown template id', async () => {
      const { wrapper, router } = await mountView('both', {}, '/new?template=zzz')
      await visit(wrapper, 'look')
      expect(router.currentRoute.value.query.template).toBeUndefined()
      expect(wrapper.get('[data-testid="new-template-none"]').attributes('aria-checked')).toBe('true')
    })
  })

  describe('theme picker', () => {
    it('shows a Theme row on the Look step with Template colours selected', async () => {
      const { wrapper } = await mountView()
      await visit(wrapper, 'look')
      expect(wrapper.get('[data-testid="theme-option-none"] button').attributes('aria-pressed')).toBe('true')
      expect(wrapper.find('[data-testid="theme-option-t1"]').exists()).toBe(true)
    })
  })
})
