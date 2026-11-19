import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { computed, nextTick, ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import type { AnimationTween, Slide, SlideAnimation } from '@/api/types'
import { constrainTween } from '@/motion/plan'
import { useEditorStore } from '@/stores/editor'
import MotionTimeline from '@/components/editor/MotionTimeline.vue'

const h = vi.hoisted(() => ({ fake: null as unknown }))
vi.mock('@/composables/useSlideAnimation', () => ({ useSlideAnimation: () => h.fake }))
const run = vi.hoisted(() => ({ running: { value: false } }))
vi.mock('@/composables/useDeckAnimationRun', async () => {
  const { computed, ref } = await import('vue')
  const running = ref(false)
  run.running = running
  return { useDeckAnimationRun: () => ({ running: computed(() => running.value), error: ref(null), run: vi.fn(), dismiss: vi.fn() }) }
})

const TARGETS = [
  { id: 'e0', kind: 'title', text: 'Quarterly results for the whole team' },
  { id: 'e1', kind: 'image', text: '' },
]
const tween = (target: string, extra: Partial<AnimationTween> = {}): AnimationTween => ({
  target, from_values: { opacity: 0 }, duration: 1, delay: 0.5, ease: 'power2.out', ...extra,
})
const entry = (over: Partial<SlideAnimation> = {}): SlideAnimation => ({
  slide_id: 's1', index: 0, status: 'fresh', source: 'llm', reset_from_user: false,
  tweens: [tween('e0')], targets: TARGETS, ...over,
})

function makeFake(a: SlideAnimation | undefined) {
  const anim = ref(a)
  const draft = ref<AnimationTween[]>((a?.tweens ?? []).map((t) => ({ ...t })))
  const fake = {
    animation: computed(() => anim.value),
    draft,
    dirty: computed(() => false),
    error: ref<string | null>(null),
    busy: computed(() => false),
    staleRef: ref(a?.status === 'stale_layout'),
    stale: computed((): boolean => fake.staleRef.value),
    setEffect: vi.fn(),
    // The real composable constrains every patch; the fake does the same.
    patchTween: vi.fn((target: string, patch: Partial<AnimationTween>) => {
      draft.value = draft.value.map((t) => (t.target === target ? constrainTween(t, patch) : t))
    }),
    applyPreset: vi.fn(),
    generate: vi.fn(async () => {}),
    generateAll: vi.fn(),
    clear: vi.fn(),
    save: vi.fn(),
  }
  h.fake = fake
  return fake
}

const slide = { id: 's1', index: 0, layout: 'x', content: {} } as unknown as Slide
let wrapper: VueWrapper | null = null

async function mountTimeline(a: SlideAnimation | undefined = entry()) {
  const fake = makeFake(a)
  const editor = useEditorStore()
  editor.footerOpen = true
  editor.footerTab = 'motion'
  wrapper = mount(MotionTimeline, { attachTo: document.body, props: { presentationId: 'p1', slide } })
  await flushPromises()
  return { w: wrapper, fake, editor }
}

// The lane is 250 px wide on screen: 100 px is one second.
function stubLane() {
  return vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, width: 250, height: 28, right: 250, bottom: 28, toJSON: () => ({}),
  } as DOMRect)
}
const pointer = (el: Element, type: string, clientX: number) =>
  el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerId: 1, clientX }))

let frames: FrameRequestCallback[] = []
let now = 0
beforeEach(() => {
  setActivePinia(createPinia())
  run.running.value = false
  frames = []
  now = 0
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.spyOn(performance, 'now').mockImplementation(() => now)
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** Runs the queued animation frames at time `t` (ms). */
async function frameAt(t: number) {
  now = t
  const queued = frames.splice(0)
  queued.forEach((cb) => cb(t))
  await nextTick()
}

describe('MotionTimeline', () => {
  it('places a clip at delay/2.5 with width duration/2.5 (0.5 s, 1 s → 20%, 40%)', async () => {
    const { w } = await mountTimeline()
    const clip = w.get('[data-motion-clip="e0"]').element as HTMLElement
    expect(clip.style.left).toBe('20%')
    expect(clip.style.width).toBe('40%')
  })

  it('names one track per element and shows the time out of 2.5 s', async () => {
    const { w } = await mountTimeline()
    const names = w.findAll('[data-motion-track] .motion-track-name').map((n) => n.text())
    expect(names[0]).toMatch(/^Title – Quarterly results for/)
    expect(names[1]).toBe('Image')
    expect(w.get('output').text().replace(/\s+/g, ' ')).toBe('0.0 / 2.5 s')
  })

  it('arrow keys nudge by 0.1 s and stop at the window end (2.5 − duration)', async () => {
    const { w, fake } = await mountTimeline()
    const clip = w.get('[data-motion-clip="e0"]')
    await clip.trigger('keydown', { key: 'ArrowRight' })
    expect(fake.patchTween).toHaveBeenLastCalledWith('e0', { delay: 0.6 })
    for (let i = 0; i < 15; i++) await clip.trigger('keydown', { key: 'ArrowRight' })
    expect(fake.draft.value[0]!.delay).toBe(1.5)
    await clip.trigger('keydown', { key: 'ArrowLeft' })
    expect(fake.patchTween).toHaveBeenLastCalledWith('e0', { delay: 1.4 })
  })

  it('dragging a clip moves its start, rounded to 0.1 s and clamped to the lane', async () => {
    const { w, fake } = await mountTimeline()
    stubLane()
    const clip = w.get('[data-motion-clip="e0"]').element
    pointer(clip, 'pointerdown', 50)
    pointer(clip, 'pointermove', 73) // +0.23 s
    pointer(clip, 'pointerup', 73)
    await nextTick()
    expect(fake.patchTween).toHaveBeenLastCalledWith('e0', { delay: 0.7 })

    pointer(clip, 'pointerdown', 70)
    pointer(clip, 'pointermove', 2000) // far past the end
    await nextTick()
    expect((clip as HTMLElement).style.left).toBe('60%') // 1.5 s while dragging
    pointer(clip, 'pointerup', 2000)
    expect(fake.patchTween).toHaveBeenLastCalledWith('e0', { delay: 1.5 })

    pointer(clip, 'pointerdown', 150)
    pointer(clip, 'pointermove', -900) // far before the start
    pointer(clip, 'pointerup', -900)
    expect(fake.patchTween).toHaveBeenLastCalledWith('e0', { delay: 0 })
  })

  it('Play advances motionTime; Stop sets it back to null', async () => {
    const { w, editor } = await mountTimeline()
    await w.get('button[aria-label="Play animation"]').trigger('click')
    expect(editor.motionTime).toBe(0)
    await frameAt(500)
    expect(editor.motionTime).toBeCloseTo(0.5)
    await frameAt(1000)
    expect(editor.motionTime).toBeCloseTo(1)
    expect(w.get('output').text().replace(/\s+/g, ' ')).toBe('1.0 / 2.5 s')
    await w.get('button[aria-label="Stop and restore slide"]').trigger('click')
    expect(editor.motionTime).toBeNull()
    await frameAt(1500)
    expect(editor.motionTime).toBeNull()
  })

  it('stops at the end of the window unless Loop is on', async () => {
    const { w, editor } = await mountTimeline()
    await w.get('button[aria-label="Play animation"]').trigger('click')
    await frameAt(3000)
    expect(editor.motionTime).toBe(2.5)
    expect(frames).toHaveLength(0)
    expect(w.find('button[aria-label="Play animation"]').exists()).toBe(true)
  })

  it('the scrubber sets motionTime', async () => {
    const { w, editor } = await mountTimeline()
    await w.get('input[type="range"]').setValue('1.25')
    expect(editor.motionTime).toBe(1.25)
  })

  it('selecting a clip or a track selects the element and opens the Motion inspector tab', async () => {
    const { w, editor } = await mountTimeline()
    editor.inspectorTab = 'design'
    await w.get('[data-motion-clip="e0"]').trigger('click')
    expect(editor.motionTarget).toBe('e0')
    expect(editor.inspectorTab).toBe('motion')
    expect(editor.inspectorOpen).toBe(true)
    editor.inspectorTab = 'layers'
    await w.findAll('.motion-track-name')[1]!.trigger('click')
    expect(editor.motionTarget).toBe('e1')
    expect(editor.inspectorTab).toBe('motion')
  })

  it('does not open the inspector drawer over the footer on narrow screens', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('max-width: 1050px'), media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    }))
    const { w, editor } = await mountTimeline()
    editor.inspectorOpen = false
    await w.get('[data-motion-clip="e0"]').trigger('click')
    expect(editor.motionTarget).toBe('e0')
    expect(editor.inspectorTab).toBe('motion')
    expect(editor.inspectorOpen).toBe(false)
  })

  it('an element without a tween gets an Add affordance that fades it in', async () => {
    const { w, fake, editor } = await mountTimeline()
    expect(w.find('[data-motion-clip="e1"]').exists()).toBe(false)
    await w.get('button[aria-label="Add motion to Image"]').trigger('click')
    expect(fake.setEffect).toHaveBeenCalledWith('e1', 'fade')
    expect(editor.motionTarget).toBe('e1')
  })

  it('a slide with nothing to animate says so', async () => {
    const { w } = await mountTimeline(entry({ targets: [], tweens: [] }))
    expect(w.text()).toContain('Nothing to animate on this slide.')
    expect(w.find('[data-motion-track]').exists()).toBe(false)
  })

  it('collapsing the footer stops the preview', async () => {
    const { w, editor } = await mountTimeline()
    await w.get('input[type="range"]').setValue('1')
    editor.footerOpen = false
    await nextTick()
    expect(editor.motionTime).toBeNull()
  })

  it('a stale layout is read-only, not playable, and offers a re-plan (asking first for hand edits)', async () => {
    const { w, fake } = await mountTimeline(entry({ status: 'stale_layout', source: 'user' }))
    expect(w.text()).toContain('Layout changed — re-plan')
    expect(w.find('[data-motion-clip]').exists()).toBe(false)
    expect(w.find('.motion-add').exists()).toBe(false)
    expect((w.find('button[aria-label="Play animation"]').element as HTMLButtonElement).disabled).toBe(true)
    const replan = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Re-plan')!
    replan.click()
    await flushPromises()
    expect(document.body.textContent).toContain('Replace your edits?')
    ;[...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Replace')!.click()
    await flushPromises()
    expect(fake.generate).toHaveBeenCalledWith({ force: true })
  })

  it('a stale draft stops a running preview', async () => {
    const { fake, editor } = await mountTimeline()
    editor.motionTime = 0.5
    fake.staleRef.value = true
    await nextTick()
    expect(editor.motionTime).toBeNull()
  })

  it('while the deck run plans every slide, clips do not move and Add is disabled, with the reason', async () => {
    run.running.value = true
    const { w, fake } = await mountTimeline()
    const clip = w.find('[data-motion-clip="e0"]')
    await clip.trigger('keydown', { key: 'ArrowRight' })
    stubLane()
    pointer(clip.element, 'pointerdown', 100)
    pointer(clip.element, 'pointermove', 150)
    pointer(clip.element, 'pointerup', 150)
    expect(fake.patchTween).not.toHaveBeenCalled()
    expect(clip.attributes('title')).toBe('Unavailable while motion is planned for every slide')
    const add = w.find('.motion-add')
    expect((add.element as HTMLButtonElement).disabled).toBe(true)
    await add.trigger('click')
    expect(fake.setEffect).not.toHaveBeenCalled()
    expect(w.text()).toContain('Unavailable while motion is planned for every slide.')
  })
})
