import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ref } from 'vue'
import draggable from 'vuedraggable'
import type { Presentation } from '@/api/types'
import { MAX_OUTLINE_SLIDES } from '@/api/outlines'
import OutlineStep from '@/components/create/steps/OutlineStep.vue'

const mocks = vi.hoisted(() => ({
  saveOutline: vi.fn(),
  preparePresentation: vi.fn(),
  getTemplate: vi.fn(),
  listTemplates: vi.fn(),
  updatePresentation: vi.fn(),
  toastError: vi.fn(),
  stream: null as unknown,
}))
vi.mock('@/api/outlines', async (importActual) => ({
  ...(await importActual<typeof import('@/api/outlines')>()),
  saveOutline: mocks.saveOutline,
  preparePresentation: mocks.preparePresentation,
  getTemplate: mocks.getTemplate,
}))
vi.mock('@/api/templates', async (orig) => ({ ...(await orig<typeof import('@/api/templates')>()), listTemplates: mocks.listTemplates }))
vi.mock('@/api/presentations', async (orig) => ({ ...(await orig<typeof import('@/api/presentations')>()), updatePresentation: mocks.updatePresentation }))
vi.mock('@/components/ui/sonner', () => ({ toast: { error: mocks.toastError } }))
vi.mock('@/composables/useOutlineStream', () => ({
  useOutlineStream: () => mocks.stream,
}))
vi.mock('@/render/SlideView.vue', () => ({
  default: {
    props: ['slide'],
    template: '<div data-testid="slide-view" :data-slide="slide.id" />',
  },
}))

type Stream = {
  items: { value: { content: string }[] }
  streaming: { value: boolean }
  error: { value: string | null }
  retry: ReturnType<typeof vi.fn>
}
const stream = () => mocks.stream as Stream

const layout = (n: number) => ({ id: `l${n}` })
const deck = (slides = 0, group = 'modern') =>
  ({
    id: 'p1',
    n_slides: 3,
    slides: Array.from({ length: slides }, (_, i) => ({ id: `s${i}`, index: i, layout: 'l1', layout_group: group, content: {} })),
  }) as unknown as Presentation

async function mountStep(path = '/p/p1/create/outline?template=modern', presentation = deck(), extra: { pipelineRunning?: boolean } = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/p/:id/create/:step?', name: 'create', component: { template: '<div />' } },
      { path: '/p/:id', name: 'editor', component: { template: '<div />' } },
    ],
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  await router.push(path)
  await router.isReady()
  const wrapper = mount(OutlineStep, {
    props: { presentation, ...extra },
    global: { plugins: [router, [VueQueryPlugin, { queryClient }]] },
    attachTo: document.body,
  })
  await flushPromises()
  return { wrapper, router }
}

const contents = (w: VueWrapper) => w.findAll('textarea').map((t) => (t.element as HTMLTextAreaElement).value)
const button = (w: VueWrapper, re: RegExp) => w.findAll('button').find((b) => re.test(b.text()))
const generateBtn = (w: VueWrapper) => button(w, /Generate slides/)!
const status = (w: VueWrapper) => w.get('[data-testid="wizard-footer"] [role="status"]').text()

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  mocks.saveOutline.mockReset().mockResolvedValue(undefined)
  mocks.preparePresentation.mockReset().mockResolvedValue({})
  mocks.getTemplate.mockReset().mockResolvedValue({
    layouts: [layout(1), layout(2), layout(3), layout(4)],
  })
  mocks.updatePresentation.mockReset().mockResolvedValue({})
  mocks.toastError.mockReset()
  mocks.listTemplates.mockReset().mockResolvedValue([
    { id: 'modern', name: 'Modern', layouts: [layout(1), layout(2), layout(3), layout(4), layout(5)] },
    { id: 'custom-1', name: 'Mine', layouts: Array.from({ length: 4 }) },
  ])
  mocks.stream = {
    items: ref([{ content: 'A' }, { content: 'B' }, { content: 'C' }]),
    status: ref('Outline ready'),
    streaming: ref(false),
    error: ref(null),
    abort: vi.fn(),
    retry: vi.fn(),
  }
})
afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('OutlineStep', () => {
  it('edits items and saves once, debounced by 500ms', async () => {
    const { wrapper } = await mountStep()
    const first = wrapper.findAll('textarea')[0]!
    await first.setValue('A1')
    await first.setValue('A12')
    await vi.advanceTimersByTimeAsync(400)
    expect(mocks.saveOutline).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(150)
    expect(mocks.saveOutline).toHaveBeenCalledTimes(1)
    expect(mocks.saveOutline).toHaveBeenCalledWith('p1', [{ content: 'A12' }, { content: 'B' }, { content: 'C' }])
  })

  it('shows the save state: Saving…, Saved, then an error with Retry', async () => {
    let finish!: () => void
    mocks.saveOutline.mockImplementationOnce(() => new Promise<void>((r) => (finish = r)))
    const { wrapper } = await mountStep()
    await wrapper.findAll('textarea')[0]!.setValue('A1')
    await vi.advanceTimersByTimeAsync(600)
    expect(wrapper.get('[data-testid="outline-save"]').text()).toContain('Saving…')
    finish()
    await flushPromises()
    expect(wrapper.get('[data-testid="outline-save"]').text()).toContain('Saved')

    mocks.saveOutline.mockRejectedValueOnce(new Error('Disk full'))
    await wrapper.findAll('textarea')[0]!.setValue('A2')
    await vi.advanceTimersByTimeAsync(600)
    await flushPromises()
    const save = wrapper.get('[data-testid="outline-save"]')
    expect(save.text()).toContain('Disk full')
    await save.get('button').trigger('click')
    await flushPromises()
    expect(mocks.saveOutline).toHaveBeenCalledTimes(3)
    expect(mocks.saveOutline).toHaveBeenLastCalledWith('p1', [{ content: 'A2' }, { content: 'B' }, { content: 'C' }])
    expect(wrapper.get('[data-testid="outline-save"]').text()).toContain('Saved')
  })

  it('flushes the pending save on unmount instead of dropping it', async () => {
    const { wrapper } = await mountStep()
    await wrapper.findAll('textarea')[0]!.setValue('A!')
    expect(mocks.saveOutline).not.toHaveBeenCalled()
    wrapper.unmount()
    expect(mocks.saveOutline).toHaveBeenCalledTimes(1)
    expect(mocks.saveOutline).toHaveBeenCalledWith('p1', [{ content: 'A!' }, { content: 'B' }, { content: 'C' }])
  })

  it('shows a Retry button for a load error', async () => {
    stream().error.value = 'Bad gateway'
    const { wrapper } = await mountStep()
    await button(wrapper, /^Retry$/)!.trigger('click')
    expect(stream().retry).toHaveBeenCalledTimes(1)
  })

  it('does not save when nothing was edited', async () => {
    await mountStep()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(mocks.saveOutline).not.toHaveBeenCalled()
  })

  it('reorders with Alt+ArrowDown and Alt+ArrowUp', async () => {
    const { wrapper } = await mountStep()
    await wrapper.findAll('textarea')[0]!.trigger('keydown', { key: 'ArrowDown', altKey: true })
    await flushPromises()
    expect(contents(wrapper)).toEqual(['B', 'A', 'C'])
    await wrapper.findAll('textarea')[2]!.trigger('keydown', { key: 'ArrowUp', altKey: true })
    await flushPromises()
    expect(contents(wrapper)).toEqual(['B', 'C', 'A'])
    await vi.advanceTimersByTimeAsync(600)
    expect(mocks.saveOutline).toHaveBeenLastCalledWith('p1', [{ content: 'B' }, { content: 'C' }, { content: 'A' }])
  })

  it('ignores arrows without Alt and does not move past the ends', async () => {
    const { wrapper } = await mountStep()
    await wrapper.findAll('textarea')[0]!.trigger('keydown', { key: 'ArrowUp', altKey: true })
    await wrapper.findAll('textarea')[2]!.trigger('keydown', { key: 'ArrowDown' })
    expect(contents(wrapper)).toEqual(['A', 'B', 'C'])
  })

  it('reorders by drag', async () => {
    const { wrapper } = await mountStep()
    wrapper.getComponent(draggable).vm.$emit('update:modelValue', [{ content: 'C' }, { content: 'A' }, { content: 'B' }])
    await flushPromises()
    expect(contents(wrapper)).toEqual(['C', 'A', 'B'])
  })

  it('adds and deletes items', async () => {
    const { wrapper } = await mountStep()
    await wrapper.get('button[aria-label="Delete slide 2"]').trigger('click')
    expect(contents(wrapper)).toEqual(['A', 'C'])
    await button(wrapper, /Add slide/)!.trigger('click')
    expect(contents(wrapper)).toEqual(['A', 'C', ''])
  })

  it('shows the slide count against the limit', async () => {
    const { wrapper } = await mountStep()
    expect(wrapper.text()).toContain(`3 slides · max ${MAX_OUTLINE_SLIDES}`)
  })

  it('shows each card as a numbered title with the rest as a muted preview, and the source while editing', async () => {
    stream().items.value = [{ content: '# Intro\n- **One**\n- Two' }]
    const { wrapper } = await mountStep()
    const card = wrapper.get('[data-testid="outline-item"]')
    expect(card.get('[data-testid="outline-number"]').text()).toBe('1')
    expect(card.get('[data-testid="outline-title"]').text()).toBe('Intro')
    const preview = card.get('[data-testid="outline-preview"]')
    expect(preview.find('h1').exists()).toBe(false)
    expect(preview.findAll('li').map((l) => l.text())).toEqual(['One', 'Two'])
    expect(preview.find('strong').exists()).toBe(true)
    await wrapper.get('textarea').trigger('focus')
    expect(preview.isVisible()).toBe(false)
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('# Intro\n- **One**\n- Two')
    await wrapper.get('textarea').trigger('blur')
    expect(preview.isVisible()).toBe(true)
  })

  it('no template pickers on the outline step', async () => {
    const { wrapper } = await mountStep('/p/p1/create/outline?template=modern')
    expect(wrapper.find('[data-testid="template-modern"]').exists()).toBe(false)
    expect(wrapper.find('[role="radiogroup"]').exists()).toBe(false)
    const summary = wrapper.get('[data-testid="outline-look"]')
    expect(summary.text()).toContain('Modern')
    expect(summary.find('[data-testid="template-main-image"]').exists()).toBe(true)
    expect(summary.find('button').exists()).toBe(false)
  })

  it('with no template known anywhere, the picker asks for one and picking enables Generate', async () => {
    const { wrapper, router } = await mountStep('/p/p1/create/outline')
    expect(generateBtn(wrapper).attributes('disabled')).toBeDefined()
    expect(status(wrapper)).toBe('Pick a template to generate')
    expect(wrapper.find('[data-testid="new-template-none"]').exists()).toBe(false) // no "Decide later"
    await generateBtn(wrapper).trigger('click')
    expect(mocks.preparePresentation).not.toHaveBeenCalled()

    await wrapper.get('[data-testid="new-template-modern"]').trigger('click')
    await flushPromises()
    expect(JSON.parse(localStorage.getItem('slideshows.deckLook.p1')!)).toEqual({ template: 'modern' })
    expect(wrapper.find('[data-testid="outline-template-picker"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="outline-look"]').text()).toContain('Modern')
    expect(generateBtn(wrapper).attributes('disabled')).toBeUndefined()
    await generateBtn(wrapper).trigger('click')
    await flushPromises()
    expect(mocks.preparePresentation).toHaveBeenCalledWith(expect.objectContaining({ layout: 'modern' }))
    expect(router.currentRoute.value.query).toMatchObject({ stream: '1', template: 'modern' })
  })

  it('a template whose list failed to load and is unknown keeps Generate off, with the reason', async () => {
    mocks.listTemplates.mockRejectedValue(new Error('down'))
    const { wrapper } = await mountStep('/p/p1/create/outline')
    expect(generateBtn(wrapper).attributes('disabled')).toBeDefined()
    expect(wrapper.get('[role="alert"]').text()).toContain('No template chosen — start a new deck')
    // The alert carries the message; the status line only names the effect.
    expect(status(wrapper)).toBe('Generate unavailable')
  })

  it('reached without the query, an empty deck generates with its remembered template', async () => {
    localStorage.setItem('slideshows.deckLook.p1', JSON.stringify({ template: 'custom-1' }))
    const { wrapper, router } = await mountStep('/p/p1/create/outline')
    expect(wrapper.find('[data-testid="outline-template-picker"]').exists()).toBe(false)
    const look = wrapper.get('[data-testid="outline-look"]').text()
    expect(look).toContain('Mine')
    await generateBtn(wrapper).trigger('click')
    await flushPromises()
    expect(mocks.preparePresentation).toHaveBeenCalledWith(expect.objectContaining({ layout: 'custom-1' }))
    expect(router.currentRoute.value.query).toMatchObject({ stream: '1', template: 'custom-1' })
  })

  it('records the query look for the deck, so a later visit without it still knows it', async () => {
    await mountStep('/p/p1/create/outline?template=modern')
    expect(JSON.parse(localStorage.getItem('slideshows.deckLook.p1')!)).toEqual({ template: 'modern' })
  })

  it('a remembered template that no longer exists falls back to the picker', async () => {
    localStorage.setItem('slideshows.deckLook.p1', JSON.stringify({ template: 'gone' }))
    const { wrapper } = await mountStep('/p/p1/create/outline')
    expect(wrapper.find('[data-testid="outline-template-picker"]').exists()).toBe(true)
    expect(status(wrapper)).toBe('Pick a template to generate')
  })

  it('generate goes to preview with stream flag', async () => {
    const { wrapper, router } = await mountStep()
    expect(generateBtn(wrapper).attributes('disabled')).toBeUndefined()
    await generateBtn(wrapper).trigger('click')
    await flushPromises()
    expect(mocks.preparePresentation).toHaveBeenCalledWith({
      presentation_id: 'p1',
      outlines: [{ content: 'A' }, { content: 'B' }, { content: 'C' }],
      layout: 'modern',
    })
    expect(router.currentRoute.value.name).toBe('create')
    expect(router.currentRoute.value.params).toMatchObject({ id: 'p1', step: 'preview' })
    // The template stays in the query, so Back → Regenerate still knows it.
    expect(router.currentRoute.value.query).toMatchObject({ stream: '1', template: 'modern' })
  })

  it('flushes pending autosave before generating', async () => {
    const { wrapper } = await mountStep()
    await wrapper.findAll('textarea')[1]!.setValue('B edited')
    // Inside the debounce window: nothing saved yet.
    await vi.advanceTimersByTimeAsync(100)
    expect(mocks.saveOutline).not.toHaveBeenCalled()
    await generateBtn(wrapper).trigger('click')
    await flushPromises()
    expect(mocks.saveOutline).toHaveBeenCalledTimes(1)
    expect(mocks.saveOutline).toHaveBeenCalledWith('p1', [{ content: 'A' }, { content: 'B edited' }, { content: 'C' }])
    expect(mocks.saveOutline.mock.invocationCallOrder[0]).toBeLessThan(mocks.preparePresentation.mock.invocationCallOrder[0]!)
    // The debounce timer was consumed by the flush: no second save later.
    await vi.advanceTimersByTimeAsync(1_000)
    expect(mocks.saveOutline).toHaveBeenCalledTimes(1)
  })

  it('waits for a save already in flight before generating', async () => {
    let finish!: () => void
    mocks.saveOutline.mockImplementationOnce(() => new Promise<void>((r) => (finish = r)))
    const { wrapper } = await mountStep()
    await wrapper.findAll('textarea')[0]!.setValue('A1')
    await vi.advanceTimersByTimeAsync(600)
    expect(mocks.saveOutline).toHaveBeenCalledTimes(1)
    await generateBtn(wrapper).trigger('click')
    await flushPromises()
    expect(mocks.preparePresentation).not.toHaveBeenCalled()
    finish()
    await flushPromises()
    expect(mocks.preparePresentation).toHaveBeenCalledTimes(1)
  })

  it('locks the outline while generating', async () => {
    mocks.preparePresentation.mockReturnValue(new Promise(() => {}))
    const { wrapper } = await mountStep()
    await generateBtn(wrapper)?.trigger('click')
    await flushPromises()
    expect(mocks.preparePresentation).toHaveBeenCalled()
    expect(wrapper.findAll('textarea')[0]!.attributes('disabled')).toBeDefined()
    expect(wrapper.find('button[aria-label="Delete slide 1"]').attributes('disabled')).toBeDefined()
  })

  it('shows a prepare failure in the footer and stays', async () => {
    mocks.preparePresentation.mockRejectedValue(new Error('Model unavailable'))
    const { wrapper, router } = await mountStep()
    await generateBtn(wrapper).trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('Model unavailable')
    expect(router.currentRoute.value.params.step).toBe('outline')
    expect(generateBtn(wrapper).attributes('disabled')).toBeUndefined()
  })

  it('over the slide limit disables generate with reason', async () => {
    stream().items.value = Array.from({ length: MAX_OUTLINE_SLIDES + 1 }, (_, i) => ({ content: `S${i}` }))
    const { wrapper } = await mountStep()
    expect(generateBtn(wrapper).attributes('disabled')).toBeDefined()
    expect(status(wrapper)).toContain(`Remove 1 slide to continue (max ${MAX_OUTLINE_SLIDES})`)
    expect(wrapper.get('[data-testid="outline-limit"]').text()).toContain(`max ${MAX_OUTLINE_SLIDES}`)
    await wrapper.get('button[aria-label="Delete slide 1"]').trigger('click')
    expect(generateBtn(wrapper).attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[data-testid="outline-limit"]').exists()).toBe(false)
  })

  it('an empty outline disables generate with reason', async () => {
    stream().items.value = []
    const { wrapper } = await mountStep()
    expect(generateBtn(wrapper).attributes('disabled')).toBeDefined()
    expect(status(wrapper)).toContain('Add at least one slide')
  })

  it('shows progress and skeleton cards while the outline streams, with editing locked and a reason', async () => {
    stream().streaming.value = true
    const { wrapper } = await mountStep()
    expect(wrapper.get('[role="progressbar"]').attributes('aria-label')).toBe('Outline progress')
    expect(wrapper.text()).toContain('3 slides drafted')
    expect(wrapper.findAll('[data-testid="outline-skeleton"]').length).toBeGreaterThan(0)
    expect(wrapper.findAll('textarea')[0]!.attributes('disabled')).toBeDefined()
    expect(generateBtn(wrapper).attributes('disabled')).toBeDefined()
    expect(status(wrapper)).toContain('Writing your outline…')
  })

  it('emits the streaming state', async () => {
    stream().streaming.value = true
    const { wrapper } = await mountStep()
    expect(wrapper.emitted('streaming')?.at(-1)).toEqual([true])
    stream().streaming.value = false
    await flushPromises()
    expect(wrapper.emitted('streaming')?.at(-1)).toEqual([false])
  })

  describe('deck with slides', () => {
    it('deck with slides is read-only until regenerate is confirmed', async () => {
      const { wrapper, router } = await mountStep('/p/p1/create/outline?template=modern', deck(3))
      expect(generateBtn(wrapper)).toBeUndefined()
      expect(wrapper.findAll('textarea')[0]!.attributes('disabled')).toBeDefined()
      expect(button(wrapper, /Add slide/)!.attributes('disabled')).toBeDefined()

      await button(wrapper, /Regenerate slides from outline…/)!.trigger('click')
      await flushPromises()
      const dialog = document.body.querySelector('[role="dialog"]') as HTMLElement
      expect(dialog.textContent).toContain('Regenerating replaces every slide. Slide edits, narration and avatars will be lost.')
      // Cancel keeps it read-only.
      const cancel = [...dialog.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Cancel')!
      cancel.click()
      await flushPromises()
      expect(wrapper.findAll('textarea')[0]!.attributes('disabled')).toBeDefined()

      await button(wrapper, /Regenerate slides from outline…/)!.trigger('click')
      await flushPromises()
      const confirm = [...document.body.querySelectorAll('[role="dialog"] button')].find(
        (b) => b.textContent?.trim() === 'Regenerate slides',
      ) as HTMLButtonElement
      confirm.click()
      await flushPromises()
      expect(wrapper.findAll('textarea')[0]!.attributes('disabled')).toBeUndefined()
      expect(mocks.preparePresentation).not.toHaveBeenCalled()

      await generateBtn(wrapper).trigger('click')
      await flushPromises()
      expect(mocks.preparePresentation).toHaveBeenCalledTimes(1)
      expect(router.currentRoute.value.params.step).toBe('preview')
      expect(router.currentRoute.value.query.stream).toBe('1')
    })

    it('without the query, Regenerate uses the template the slides were built from', async () => {
      const { wrapper } = await mountStep('/p/p1/create/outline', deck(3))
      const regen = button(wrapper, /Regenerate slides from outline…/)!
      expect(regen.attributes('disabled')).toBeUndefined()
      await regen.trigger('click')
      await flushPromises()
      ;(
        [...document.body.querySelectorAll('[role="dialog"] button')].find(
          (b) => b.textContent?.trim() === 'Regenerate slides',
        ) as HTMLButtonElement
      ).click()
      await flushPromises()
      await generateBtn(wrapper).trigger('click')
      await flushPromises()
      expect(mocks.preparePresentation).toHaveBeenCalledWith(expect.objectContaining({ layout: 'modern' }))
    })

    it('Regenerate waits while voice and avatars are being made, with the reason', async () => {
      const { wrapper } = await mountStep('/p/p1/create/outline?template=modern', deck(3), { pipelineRunning: true })
      expect(button(wrapper, /Regenerate slides from outline…/)!.attributes('disabled')).toBeDefined()
      expect(status(wrapper)).toBe('Wait for voice and avatars to finish')
      await wrapper.setProps({ pipelineRunning: false })
      expect(button(wrapper, /Regenerate slides from outline…/)!.attributes('disabled')).toBeUndefined()
    })

    it('Continue to Preview works without a template', async () => {
      const { wrapper, router } = await mountStep('/p/p1/create/outline', deck(3, 'smart-html'))
      expect(wrapper.find('[role="alert"]').exists()).toBe(false)
      // Regenerating would need the template: it is not offered, and the status line says why.
      expect(button(wrapper, /Regenerate slides from outline…/)!.attributes('disabled')).toBeDefined()
      expect(status(wrapper)).toContain('No template chosen — start a new deck')
      const cont = button(wrapper, /Continue to Preview/)!
      expect(cont.attributes('disabled')).toBeUndefined()
      await cont.trigger('click')
      await flushPromises()
      expect(router.currentRoute.value.params.step).toBe('preview')
      expect(router.currentRoute.value.query.stream).toBeUndefined()
      expect(mocks.preparePresentation).not.toHaveBeenCalled()
    })
  })

  it('generating applies no theme: the deck keeps its template colours', async () => {
    const { wrapper, router } = await mountStep('/p/p1/create/outline?template=modern')
    await generateBtn(wrapper).trigger('click')
    await flushPromises()
    expect(mocks.updatePresentation).not.toHaveBeenCalled()
    expect(router.currentRoute.value.params.step).toBe('preview')
    expect(router.currentRoute.value.query.stream).toBe('1')
  })
})
