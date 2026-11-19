import { beforeEach, describe, expect, it, vi } from 'vitest'
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

async function mountView(generationMode: GenerationMode = 'both', config: Record<string, unknown> = {}, startPath = '/new') {
  const pinia = createPinia()
  setActivePinia(pinia)
  useSessionStore().runtime = { configured: true, config, generationMode }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/new', name: 'new', component: NewView },
      { path: '/new/:id/outline', name: 'outline', component: view },
      { path: '/p/:id', name: 'editor', component: view },
    ],
  })
  await router.push(startPath)
  await router.isReady()
  const wrapper = mount(NewView, { global: { plugins: [pinia, router, [VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]] }, attachTo: document.body })
  return { wrapper, router }
}

type W = Awaited<ReturnType<typeof mountView>>['wrapper']
const submitBtn = (w: W) => w.get('button[type="submit"]')

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
    await flushPromises()
    expect(wrapper.get('#opt-web').attributes('aria-checked')).toBe('true')
  })

  it('disables submit with no prompt and no files', async () => {
    const { wrapper } = await mountView()
    expect(submitBtn(wrapper).attributes('disabled')).toBeDefined()
    await wrapper.get('#create-prompt').setValue('Quarterly review')
    expect(submitBtn(wrapper).attributes('disabled')).toBeUndefined()
  })

  it('clamps the slide count to 1-50', async () => {
    const { wrapper } = await mountView()
    const input = wrapper.get('#opt-slides')
    await input.setValue('99')
    expect((input.element as HTMLInputElement).value).toBe('50')
    await input.setValue('0')
    expect((input.element as HTMLInputElement).value).toBe('')
  })

  it('clamps the image count to 0-50, keeping 0 as "none"', async () => {
    const { wrapper } = await mountView()
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
    await wrapper.get('#create-prompt').setValue('Quarterly review')
    if (label) {
      const chip = wrapper.findAll('[aria-label="Image count"] [role="radio"]').find((b) => b.text() === label)!
      await chip.trigger('click')
      expect(chip.attributes('aria-checked')).toBe('true')
    }
    if (typed) await wrapper.get('#opt-images').setValue(typed)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(m.createPresentation).toHaveBeenCalledWith(expect.objectContaining({ n_images: expected }))
  })

  it.each([
    ['Auto', null, null],
    ['None', null, 0],
    [null, '2', 2],
  ] as const)('sends n_videos for chip %s / typed %s as %s', async (label, typed, expected) => {
    m.createPresentation.mockResolvedValue({ id: 'abc' })
    const { wrapper } = await mountView()
    await wrapper.get('#create-prompt').setValue('Quarterly review')
    if (label) {
      const chip = wrapper.findAll('[aria-label="Presenter video count"] [role="radio"]').find((b) => b.text() === label)!
      await chip.trigger('click')
      expect(chip.attributes('aria-checked')).toBe('true')
    }
    if (typed) await wrapper.get('#opt-videos').setValue(typed)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(m.createPresentation).toHaveBeenCalledWith(expect.objectContaining({ n_videos: expected, n_images: null }))
  })

  it('says presenter slots wait for avatar generation', async () => {
    const { wrapper } = await mountView()
    expect(wrapper.text()).toContain('Slots show a placeholder until you generate avatars in the Avatars panel')
  })

  it('renders no mode switch, creates a standard presentation and routes to the outline, without file calls', async () => {
    m.createPresentation.mockResolvedValue({ id: 'abc' })
    const { wrapper, router } = await mountView()
    expect(wrapper.text()).not.toMatch(/smart/i)
    await wrapper.get('#create-prompt').setValue('Quarterly review')
    await wrapper.get('#opt-slides').setValue('8')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(m.uploadFiles).not.toHaveBeenCalled()
    expect(m.decomposeFiles).not.toHaveBeenCalled()
    expect(m.createPresentation).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Quarterly review', n_slides: 8, file_paths: [], generation_mode: 'standard', tone: 'default', verbosity: 'standard' }),
    )
    expect(router.currentRoute.value.fullPath).toBe('/new/abc/outline')
  })

  it('animate is off by default: nothing is handed to the editor', async () => {
    m.createPresentation.mockResolvedValue({ id: 'abc' })
    const { wrapper } = await mountView()
    expect(wrapper.get('#opt-animate').attributes('aria-checked')).toBe('false')
    await wrapper.get('#create-prompt').setValue('Quarterly review')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(m.createPresentation.mock.calls[0]![0]).not.toHaveProperty('animate')
    expect(sessionStorage.getItem('presenton.animate.abc')).toBeNull()
  })

  it('with animate on, flags the new deck so the editor plans its motion after generation', async () => {
    m.createPresentation.mockResolvedValue({ id: 'abc' })
    const { wrapper, router } = await mountView()
    await wrapper.get('#create-prompt').setValue('Quarterly review')
    await wrapper.get('#opt-animate').trigger('click')
    expect(wrapper.get('#opt-animate').attributes('aria-checked')).toBe('true')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(sessionStorage.getItem('presenton.animate.abc')).toBe('1')
    expect(router.currentRoute.value.fullPath).toBe('/new/abc/outline')
  })

  it('uploads, decomposes and sends the extracted paths', async () => {
    m.uploadFiles.mockResolvedValue(['up/1'])
    m.decomposeFiles.mockResolvedValue(['/doc/1.txt'])
    m.createPresentation.mockResolvedValue({ id: 'f1' })
    const { wrapper } = await mountView()
    const file = await attach(wrapper)
    await wrapper.get('#opt-language').setValue('English')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(m.uploadFiles).toHaveBeenCalledWith([file])
    expect(m.decomposeFiles).toHaveBeenCalledWith(['up/1'], 'English')
    expect(m.createPresentation).toHaveBeenCalledWith(expect.objectContaining({ file_paths: ['/doc/1.txt'], language: 'English' }))
  })

  it('asks for a language before processing documents', async () => {
    const { wrapper } = await mountView()
    await attach(wrapper)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('language')
    expect(m.uploadFiles).not.toHaveBeenCalled()
  })

  it('stays pending until navigation settles, and recovers from failures with the server message', async () => {
    let resolve!: (v: { id: string }) => void
    m.createPresentation.mockReturnValueOnce(new Promise((r) => (resolve = r)))
    const { wrapper } = await mountView()
    await wrapper.get('#create-prompt').setValue('Topic')
    await wrapper.get('form').trigger('submit')
    expect(submitBtn(wrapper).attributes('disabled')).toBeDefined()
    expect(submitBtn(wrapper).text()).toContain('Working')
    resolve({ id: 'p1' })
    await flushPromises()

    m.uploadFiles.mockRejectedValue(new ApiError('Unsupported file', 422))
    const second = await mountView()
    await attach(second.wrapper)
    await second.wrapper.get('#opt-language').setValue('English')
    await second.wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(second.wrapper.get('[role="alert"]').text()).toBe('Unsupported file')
    expect(submitBtn(second.wrapper).attributes('disabled')).toBeUndefined()

    m.createPresentation.mockRejectedValue(new ApiError('Generation is disabled', 400))
    const third = await mountView()
    await third.wrapper.get('#create-prompt').setValue('Topic')
    await third.wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(third.wrapper.get('[role="alert"]').text()).toBe('Generation is disabled')
  })

  describe('template selector', () => {
    it('defaults to "Decide later" with no ?template', async () => {
      const { wrapper } = await mountView()
      await flushPromises()
      expect(wrapper.get('[data-testid="new-template-none"]').attributes('aria-checked')).toBe('true')
      expect(wrapper.get('[data-testid="new-template-c1"]').attributes('aria-checked')).toBe('false')
    })

    it('preselects from ?template', async () => {
      const { wrapper } = await mountView('both', {}, '/new?template=c1')
      await flushPromises()
      expect(wrapper.get('[data-testid="new-template-c1"]').attributes('aria-checked')).toBe('true')
      expect(wrapper.get('[data-testid="new-template-c1"]').text()).toContain('Pitch')
    })

    it('picking a template writes ?template, and "Decide later" removes it', async () => {
      const { wrapper, router } = await mountView()
      await flushPromises()
      await wrapper.get('[data-testid="new-template-c1"]').trigger('click')
      await flushPromises()
      expect(router.currentRoute.value.query.template).toBe('c1')
      await wrapper.get('[data-testid="new-template-none"]').trigger('click')
      await flushPromises()
      expect(router.currentRoute.value.query.template).toBeUndefined()
    })

    it('still allows submitting when templates fail to load', async () => {
      m.listTemplates.mockRejectedValue(new Error('boom'))
      const { wrapper } = await mountView()
      await flushPromises()
      expect(wrapper.text()).toContain('pick one on the outline step')
      await wrapper.get('#create-prompt').setValue('Topic')
      expect(submitBtn(wrapper).attributes('disabled')).toBeUndefined()
    })

    it('drops an unknown template id', async () => {
      const { wrapper, router } = await mountView('both', {}, '/new?template=zzz')
      await flushPromises()
      expect(router.currentRoute.value.query.template).toBeUndefined()
      expect(wrapper.get('[data-testid="new-template-none"]').attributes('aria-checked')).toBe('true')
    })

    it('forwards the template to the outline step', async () => {
      m.createPresentation.mockResolvedValue({ id: 'abc' })
      const { wrapper, router } = await mountView('both', {}, '/new?template=c1')
      await flushPromises()
      await wrapper.get('#create-prompt').setValue('Topic')
      await wrapper.get('form').trigger('submit')
      await flushPromises()
      expect(router.currentRoute.value.name).toBe('outline')
      expect(router.currentRoute.value.query.template).toBe('c1')
      const payload = m.createPresentation.mock.calls[0][0]
      expect(payload).not.toHaveProperty('template')
      expect(payload).not.toHaveProperty('layout')
    })
  })

  describe('theme picker', () => {
    it('shows a Theme row on the Look step with Template colours selected', async () => {
      const { wrapper } = await mountView()
      await flushPromises()
      expect(wrapper.get('[data-testid="theme-option-none"] button').attributes('aria-pressed')).toBe('true')
      expect(wrapper.find('[data-testid="theme-option-t1"]').exists()).toBe(true)
    })

    it('carries ?template and ?theme to the outline', async () => {
      m.createPresentation.mockResolvedValue({ id: 'abc' })
      const { wrapper, router } = await mountView('both', {}, '/new?template=c1&theme=t1')
      await flushPromises()
      await wrapper.get('#create-prompt').setValue('Quarterly review')
      await wrapper.get('form').trigger('submit')
      await flushPromises()
      expect(router.currentRoute.value.name).toBe('outline')
      expect(router.currentRoute.value.query).toEqual({ template: 'c1', theme: 't1' })
    })

    it('still submits when themes fail to load', async () => {
      m.listThemes.mockRejectedValue(new Error('boom'))
      m.createPresentation.mockResolvedValue({ id: 'abc' })
      const { wrapper, router } = await mountView()
      await flushPromises()
      await wrapper.get('#create-prompt').setValue('Quarterly review')
      await wrapper.get('form').trigger('submit')
      await flushPromises()
      expect(router.currentRoute.value.query.theme).toBeUndefined()
      expect(router.currentRoute.value.fullPath).toBe('/new/abc/outline')
    })
  })
})
