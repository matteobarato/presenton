import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { computed, nextTick, ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import type { AnimationTween, Presentation, Slide, SlideAnimation } from '@/api/types'
import { constrainTween } from '@/motion/plan'
import { useEditorStore } from '@/stores/editor'
import MotionTab from '@/components/editor/inspector/MotionTab.vue'

const h = vi.hoisted(() => ({ fake: null as unknown, getTask: vi.fn(), read: null as unknown }))
vi.mock('@/composables/useSlideAnimation', () => ({ useSlideAnimation: () => h.fake, useAnimations: () => h.read }))
vi.mock('@/api/tasks', () => ({ getTask: h.getTask }))

const TARGETS = [
  { id: 'e0', kind: 'title', text: 'Quarterly results for the whole team' },
  { id: 'e1', kind: 'image', text: '' },
]
const tween = (target: string, extra: Partial<AnimationTween> = {}): AnimationTween => ({
  target, from_values: { opacity: 0 }, duration: 0.6, delay: 0, ease: 'power2.out', ...extra,
})
const entry = (over: Partial<SlideAnimation> = {}): SlideAnimation => ({
  slide_id: 's1', index: 0, status: 'fresh', source: 'llm', reset_from_user: false,
  tweens: [tween('e0')], targets: TARGETS, ...over,
})

function makeFake(a: SlideAnimation | undefined) {
  const anim = ref(a)
  const draft = ref<AnimationTween[]>((a?.tweens ?? []).map((t) => ({ ...t })))
  const fake = {
    anim,
    animation: computed(() => anim.value),
    draft,
    dirty: computed(() => false),
    error: ref<string | null>(null),
    busy: computed(() => false),
    staleRef: ref(a?.status === 'stale_layout'),
    stale: computed((): boolean => fake.staleRef.value),
    setEffect: vi.fn(),
    patchTween: vi.fn((target: string, patch: Partial<AnimationTween>) => {
      draft.value = draft.value.map((t) => (t.target === target ? constrainTween(t, patch) : t))
    }),
    applyPreset: vi.fn(),
    generate: vi.fn(async () => {}),
    generateAll: vi.fn(async () => ({ id: 'task-1', status: 'pending' })),
    clear: vi.fn(async () => {}),
    save: vi.fn(async () => {}),
  }
  h.fake = fake
  h.read = { isPending: ref(false), isError: ref(false) }
  return fake
}

const slide = (id = 's1') => ({ id, index: 0, layout: 'x', content: {} }) as unknown as Slide
const presentation = { id: 'p1', slides: [slide()] } as unknown as Presentation
let queryClient: QueryClient
const mounted: { unmount(): void }[] = []

async function mountTab(a: SlideAnimation | undefined = entry()) {
  const fake = makeFake(a)
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const editor = useEditorStore()
  editor.inspectorTab = 'motion'
  const w = mount(MotionTab, {
    attachTo: document.body,
    props: { presentationId: 'p1', presentation, activeSlide: slide() },
    global: { plugins: [[VueQueryPlugin, { queryClient }]] },
  })
  mounted.push(w)
  await flushPromises()
  return { w, fake, editor }
}

const button = (name: string) =>
  [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === name) as HTMLButtonElement | undefined

afterEach(() => {
  // Unmounting removes each tab's window listener; a leaked one would answer the next test's ⌘K.
  mounted.splice(0).forEach((w) => w.unmount())
})

beforeEach(() => {
  setActivePinia(createPinia())
  document.body.innerHTML = ''
  sessionStorage.clear()
  h.getTask.mockReset()
})

describe('MotionTab', () => {
  it('names elements "Kind – first words" and defaults to the first target without a request', async () => {
    const { w, fake, editor } = await mountTab()
    const options = w.findAll('select#motion-element option').map((o) => o.text())
    expect(options[0]).toMatch(/^Title – Quarterly results for/)
    expect(options[1]).toBe('Image')
    expect((w.find('select#motion-element').element as HTMLSelectElement).value).toBe('e0')
    expect(editor.motionTarget).toBeNull()
    expect(fake.patchTween).not.toHaveBeenCalled()
    await w.find('select#motion-element').setValue('e1')
    expect(editor.motionTarget).toBe('e1')
  })

  it('choosing Rise applies it to the selected element', async () => {
    const { w, fake, editor } = await mountTab()
    editor.motionTarget = 'e1'
    await nextTick()
    await w.findAll('.motion-effects button').find((b) => b.text() === 'Rise')!.trigger('click')
    expect(fake.setEffect).toHaveBeenCalledWith('e1', 'rise')
  })

  it('marks the current effect and filters the palette by search', async () => {
    const { w } = await mountTab()
    expect(w.find('.motion-effects button[aria-pressed="true"]').text()).toBe('Fade')
    await w.find('input[aria-label="Search motion effects"]').setValue('focus')
    expect(w.findAll('.motion-effects button').map((b) => b.text())).toEqual(['Blur'])
    await w.find('input[aria-label="Search motion effects"]').setValue('zzz')
    expect(w.text()).toContain('No effects found.')
  })

  it('shows the clamped value after blur (Duration 99 → 1.2, 0 → 0.2)', async () => {
    const { w, fake } = await mountTab()
    const input = w.find('input[aria-label="Duration"]')
    await input.setValue('99')
    await input.trigger('blur')
    await flushPromises()
    expect(fake.patchTween).toHaveBeenCalledWith('e0', { duration: 99 })
    expect((input.element as HTMLInputElement).value).toBe('1.2')
    await input.setValue('0')
    await input.trigger('blur')
    await flushPromises()
    expect((input.element as HTMLInputElement).value).toBe('0.2')
  })

  it('edits the ease and custom from-values', async () => {
    const { w, fake } = await mountTab()
    await w.find('select[aria-label="Ease"]').setValue('expo.out')
    expect(fake.patchTween).toHaveBeenCalledWith('e0', { ease: 'expo.out' })
    await w.find('button[aria-controls="motion-custom"]').trigger('click')
    const y = w.find('input[aria-label="From y"]')
    await y.setValue('40')
    await y.trigger('blur')
    expect(fake.patchTween).toHaveBeenCalledWith('e0', { from_values: { opacity: 0, y: 40 } })
  })

  it('applies a preset', async () => {
    const { w, fake } = await mountTab()
    await w.find('select#motion-preset').setValue('clear')
    expect(fake.applyPreset).toHaveBeenCalledWith('clear')
  })

  it('asks before regenerating a hand-edited plan; cancel does not generate', async () => {
    const { fake } = await mountTab(entry({ source: 'user' }))
    button('Regenerate')!.click()
    await flushPromises()
    expect(document.body.textContent).toContain('Replace your edits?')
    button('Cancel')!.click()
    await flushPromises()
    expect(fake.generate).not.toHaveBeenCalled()
    button('Regenerate')!.click()
    await flushPromises()
    button('Replace')!.click()
    await flushPromises()
    expect(fake.generate).toHaveBeenCalledWith({ force: true })
  })

  it('regenerates an AI plan without asking', async () => {
    const { fake } = await mountTab()
    button('Regenerate')!.click()
    await flushPromises()
    expect(fake.generate).toHaveBeenCalledWith({ force: true })
  })

  it('missing plan shows the empty state with Generate with AI', async () => {
    const { w, fake } = await mountTab(entry({ status: 'missing', source: null, tweens: [] }))
    expect(w.text()).toContain('No motion yet')
    expect(w.find('.motion-effects').exists()).toBe(false)
    button('Generate with AI')!.click()
    await flushPromises()
    expect(fake.generate).toHaveBeenCalledWith({ force: false })
  })

  it('shows the reset banner and dismisses it locally, per slide', async () => {
    const { w } = await mountTab(entry({ reset_from_user: true, status: 'fresh' }))
    expect(w.text()).toContain('Your edits were reset because the layout changed')
    await w.find('button[aria-label="Dismiss"]').trigger('click')
    expect(w.text()).not.toContain('Your edits were reset')
    ;(h.fake as ReturnType<typeof makeFake>).anim.value = entry({ slide_id: 's2', reset_from_user: true })
    await w.setProps({ activeSlide: slide('s2') })
    expect(w.text()).toContain('Your edits were reset because the layout changed')
  })

  it('unsupported slide shows the note and no controls', async () => {
    const { w } = await mountTab(entry({ status: 'unsupported', targets: [], tweens: [] }))
    expect(w.text()).toContain("This slide can't be animated")
    expect(w.find('.motion-effects').exists()).toBe(false)
    expect(w.find('select#motion-element').exists()).toBe(false)
    expect(button('Generate with AI')).toBeUndefined()
  })

  it('no targets shows the empty state', async () => {
    const { w } = await mountTab(entry({ targets: [], tweens: [], status: 'missing' }))
    expect(w.text()).toContain('Nothing to animate on this slide.')
    expect(w.find('select#motion-element').exists()).toBe(false)
  })

  it('says so when the deck motion cannot be loaded', async () => {
    makeFake(undefined)
    const read = h.read as { isError: { value: boolean } }
    read.isError.value = true
    const w = mount(MotionTab, {
      attachTo: document.body,
      props: { presentationId: 'p1', presentation, activeSlide: slide() },
      global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] },
    })
    mounted.push(w)
    await flushPromises()
    expect(w.find('[role="alert"]').text()).toContain("Could not load this deck's motion.")
    expect(w.find('.skeleton-shimmer').exists()).toBe(false)
  })

  it('shows errors inline as an alert', async () => {
    const { w, fake } = await mountTab()
    fake.error.value = 'Could not save the animation.'
    await nextTick()
    expect(w.find('[role="alert"]').text()).toContain('Could not save the animation.')
  })

  it('⌘K / Ctrl+K focuses the search only while the Motion tab is open', async () => {
    const { w, editor } = await mountTab()
    const search = w.find('input[aria-label="Search motion effects"]').element as HTMLInputElement
    const ev = new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true, cancelable: true })
    window.dispatchEvent(ev)
    expect(document.activeElement).toBe(search)
    expect(ev.defaultPrevented).toBe(true)
    search.blur()
    editor.inspectorTab = 'layers'
    const ev2 = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true })
    window.dispatchEvent(ev2)
    expect(document.activeElement).not.toBe(search)
    expect(ev2.defaultPrevented).toBe(false)
    editor.inspectorTab = 'motion'
    mounted.splice(mounted.indexOf(w), 1)
    w.unmount()
    const ev3 = new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true, cancelable: true })
    window.dispatchEvent(ev3)
    expect(ev3.defaultPrevented).toBe(false)
  })

  it('Generate for all slides tracks the task and refreshes animations when it finishes', async () => {
    h.getTask.mockResolvedValue({ id: 'task-1', status: 'completed' })
    const { fake } = await mountTab()
    const spy = vi.spyOn(queryClient, 'invalidateQueries')
    button('Generate for all slides')!.click()
    await flushPromises()
    expect(fake.generateAll).toHaveBeenCalled()
    await vi.waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: ['animations', 'p1'] }))
  })

  it('Clear plan deletes the stored plan', async () => {
    const { fake } = await mountTab()
    button('Clear plan')!.click()
    await flushPromises()
    expect(fake.clear).toHaveBeenCalled()
  })

  it('a stale layout shows "Layout changed — re-plan" instead of the editor; re-plan asks first for hand edits', async () => {
    const { w, fake } = await mountTab(entry({ status: 'stale_layout', source: 'user' }))
    expect(w.text()).toContain('Layout changed — re-plan')
    expect(w.find('.motion-effects').exists()).toBe(false)
    expect(w.find('select#motion-preset').exists()).toBe(false)
    expect(button('Regenerate')).toBeUndefined()
    button('Re-plan this slide')!.click()
    await flushPromises()
    expect(document.body.textContent).toContain('Replace your edits?')
    button('Replace')!.click()
    await flushPromises()
    expect(fake.generate).toHaveBeenCalledWith({ force: true })
  })

  it('a stale AI plan re-plans without asking', async () => {
    const { fake } = await mountTab(entry({ status: 'stale_layout' }))
    button('Re-plan this slide')!.click()
    await flushPromises()
    expect(fake.generate).toHaveBeenCalledWith({ force: true })
  })

  it('a draft naming a missing element is stale too', async () => {
    const { w, fake } = await mountTab()
    fake.staleRef.value = true
    await nextTick()
    expect(w.text()).toContain('Layout changed — re-plan')
  })

  it('locks every edit while the deck run plans every slide, and says why', async () => {
    sessionStorage.setItem('slideshows.task.animations.p1', 'task-1')
    h.getTask.mockResolvedValue({ id: 'task-1', status: 'pending' })
    const { w, fake } = await mountTab()
    await vi.waitFor(() => expect(w.text()).toContain('Planning motion for every slide'))
    const reason = 'Unavailable while motion is planned for every slide'
    const effects = w.find('fieldset.motion-effects')
    expect((effects.element as HTMLFieldSetElement).disabled).toBe(true)
    expect(effects.attributes('title')).toBe(reason)
    const rise = w.findAll('.motion-effects button').find((b) => b.text() === 'Rise')!
    expect((rise.element as HTMLButtonElement).matches(':disabled')).toBe(true)
    const timing = w.findAll('fieldset')[1]!
    expect((timing.element as HTMLFieldSetElement).disabled).toBe(true)
    expect((w.find('select#motion-preset').element as HTMLSelectElement).disabled).toBe(true)
    for (const name of ['Regenerate', 'Generate for all slides', 'Clear plan']) {
      expect(button(name)!.disabled).toBe(true)
      expect(button(name)!.title).toBe(reason)
    }
    // Enter in the search does not apply an effect either.
    await w.find('input[aria-label="Search motion effects"]').trigger('keydown', { key: 'Enter' })
    expect(fake.setEffect).not.toHaveBeenCalled()
  })
})
