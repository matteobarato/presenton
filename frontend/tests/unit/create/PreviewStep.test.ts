import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { nextTick, ref, type Ref } from 'vue'
import type { Presentation } from '@/api/types'
import PreviewStep from '@/components/create/steps/PreviewStep.vue'

const mocks = vi.hoisted(() => ({
  streamCalls: [] as { id: string; enabled: boolean }[],
  status: null as unknown as Ref<string>,
  received: null as unknown as Ref<ReadonlySet<number>>,
  plan: vi.fn(),
}))
vi.mock('@/composables/usePresentationStream', async () => {
  const { ref, watch } = await import('vue')
  return {
    usePresentationStream: (id: Ref<string>, enabled: Ref<boolean>) => {
      // Records every (re)start, as the real composable's `[id, enabled]` watcher would.
      watch(
        [id, enabled],
        ([i, on]) => {
          if (on) {
            mocks.streamCalls.push({ id: i, enabled: on })
            mocks.status.value = 'streaming'
          }
        },
        { immediate: true },
      )
      return { status: mocks.status, metrics: ref(null), received: mocks.received, stop: vi.fn() }
    },
  }
})
vi.mock('@/composables/usePlanMotionAfterGeneration', async () => {
  const { ref } = await import('vue')
  return {
    usePlanMotionAfterGeneration: (...args: unknown[]) => {
      mocks.plan(...args)
      return { planning: ref(false) }
    },
  }
})
vi.mock('@/render/SlideView.vue', () => ({
  default: { props: ['slide'], template: '<div data-testid="slide-view" :data-slide="slide.id" />' },
}))

const slide = (i: number, placeholder = false) => ({
  id: `s${i}`,
  index: i,
  layout: 'l1',
  layout_group: 'modern',
  content: {},
  ui: placeholder ? { layers: [{ type: 'video', video_placeholder: true }] } : { layers: [] },
})
const deck = (slides: ReturnType<typeof slide>[], n = 5) =>
  ({ id: 'p1', title: 'Deck', n_slides: n, slides, theme: null, fonts: null }) as unknown as Presentation

async function mountStep(path: string, presentation: Presentation) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/p/:id/create/:step?', name: 'create', component: { template: '<div />' } },
      { path: '/p/:id', name: 'editor', component: { template: '<div />' } },
      { path: '/p/:id/present', name: 'present', component: { template: '<div />' } },
    ],
  })
  await router.push(path)
  await router.isReady()
  const wrapper = mount(PreviewStep, {
    props: { presentation },
    global: { plugins: [router] },
    attachTo: document.body,
  })
  await flushPromises()
  return { wrapper, router }
}

const status = (w: VueWrapper) => w.get('[data-testid="wizard-footer"] [role="status"]').text()
const button = (w: VueWrapper, re: RegExp) => w.findAll('button, a').find((b) => re.test(b.text()))

beforeEach(() => {
  mocks.streamCalls = []
  mocks.status = ref('idle')
  // By default every slide in the deck came from this stream.
  mocks.received = ref(new Set(Array.from({ length: 50 }, (_, i) => i)))
  mocks.plan.mockReset()
})
afterEach(() => {
  document.body.innerHTML = ''
})

describe('PreviewStep', () => {
  it('skeleton slots while streaming', async () => {
    const { wrapper } = await mountStep('/p/p1/create/preview?stream=1', deck([slide(0), slide(1)], 5))
    expect(mocks.streamCalls).toEqual([{ id: 'p1', enabled: true }])
    expect(wrapper.findAll('[data-testid="slide-view"]')).toHaveLength(2)
    expect(wrapper.findAll('[data-testid="preview-skeleton"]')).toHaveLength(3)
    expect(status(wrapper)).toContain('Generating slide 3 of 5…')
    expect(button(wrapper, /Continue to Narration/)!.attributes('disabled')).toBeDefined()
    expect(wrapper.emitted('streaming')!.at(-1)).toEqual([true])
    expect(mocks.plan).toHaveBeenCalledTimes(1)
  })

  it('edit slides and present wait while streaming', async () => {
    const { wrapper, router } = await mountStep('/p/p1/create/preview?stream=1', deck([slide(0)], 3))
    const edit = button(wrapper, /Edit slides/)!
    const present = button(wrapper, /Present/)!
    expect(edit.attributes('disabled')).toBeDefined()
    expect(present.element.tagName).toBe('BUTTON')
    expect(present.attributes('disabled')).toBeDefined()
    await edit.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('create')
  })

  it('says finishing up once every slide is in but the stream is still open', async () => {
    const { wrapper } = await mountStep('/p/p1/create/preview?stream=1', deck([slide(0), slide(1)], 2))
    expect(wrapper.findAll('[data-testid="preview-skeleton"]')).toHaveLength(0)
    expect(status(wrapper)).toContain('Finishing up…')
  })

  it('regenerating an existing deck counts only the slides this stream delivered', async () => {
    mocks.received.value = new Set()
    const old = deck([slide(0), slide(1), slide(2)], 3)
    const { wrapper } = await mountStep('/p/p1/create/preview?stream=1', old)
    // The old deck's slides are still cached: none are shown, every slot is a skeleton.
    expect(wrapper.findAll('[data-testid="slide-view"]')).toHaveLength(0)
    expect(wrapper.findAll('[data-testid="preview-skeleton"]')).toHaveLength(3)
    expect(status(wrapper)).toContain('Generating slide 1 of 3…')

    mocks.received.value = new Set([0])
    await nextTick()
    expect(wrapper.findAll('[data-testid="slide-view"]').map((v) => v.attributes('data-slide'))).toEqual(['s0'])
    expect(wrapper.findAll('[data-testid="preview-skeleton"]')).toHaveLength(2)
    expect(status(wrapper)).toContain('Generating slide 2 of 3…')

    mocks.status.value = 'done'
    await flushPromises()
    expect(wrapper.findAll('[data-testid="slide-view"]')).toHaveLength(3)
  })

  it('removes stream flag when done', async () => {
    const { wrapper, router } = await mountStep('/p/p1/create/preview?template=modern&stream=1', deck([slide(0)], 2))
    mocks.status.value = 'done'
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/p/p1/create/preview?template=modern')
    expect(wrapper.emitted('streaming')!.at(-1)).toEqual([false])
  })

  it('stream error shows a retry that restarts the stream', async () => {
    const { wrapper } = await mountStep('/p/p1/create/preview?stream=1', deck([slide(0)], 3))
    mocks.status.value = 'error'
    await flushPromises()
    expect(wrapper.emitted('streaming')!.at(-1)).toEqual([false])
    const retry = wrapper.get('[data-testid="footer-retry"]')
    await retry.trigger('click')
    await flushPromises()
    expect(mocks.streamCalls).toHaveLength(2)
    expect(wrapper.emitted('streaming')!.at(-1)).toEqual([true])
  })

  it('presenter marker on placeholder slides', async () => {
    const { wrapper } = await mountStep('/p/p1/create/preview', deck([slide(0), slide(1, true), slide(2)], 3))
    expect(mocks.streamCalls).toHaveLength(0)
    const thumbs = wrapper.findAll('button[aria-label^="Open slide"]')
    expect(thumbs.map((t) => t.attributes('aria-label'))).toEqual(['Open slide 1', 'Open slide 2', 'Open slide 3'])
    expect(thumbs.map((t) => t.text().includes('Presenter'))).toEqual([false, true, false])
  })

  it('lightbox navigates with arrow keys', async () => {
    const { wrapper } = await mountStep('/p/p1/create/preview', deck([slide(0), slide(1), slide(2)], 3))
    const thumb = wrapper.get('button[aria-label="Open slide 2"]')
    await thumb.trigger('click')
    await flushPromises()
    const dialog = () => document.body.querySelector('[role="dialog"]') as HTMLElement | null
    const shown = () => dialog()?.querySelector('[data-testid="slide-view"]')?.getAttribute('data-slide')
    expect(shown()).toBe('s1')
    const counter = () => dialog()?.querySelector('[data-testid="lightbox-counter"]')?.textContent
    expect(counter()).toBe('2 / 3')
    dialog()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await nextTick()
    expect(shown()).toBe('s2')
    const press = async (key: string) => {
      dialog()!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
      await nextTick()
    }
    await press('ArrowLeft')
    await press('ArrowLeft')
    expect(shown()).toBe('s0')
    // Clamped at the first slide.
    await press('ArrowLeft')
    expect(shown()).toBe('s0')
    expect(counter()).toBe('1 / 3')
    ;(dialog()!.querySelector('button[aria-label="Next slide"]') as HTMLButtonElement).click()
    await nextTick()
    expect(shown()).toBe('s1')
    // Arrow keys work wherever focus sits in the dialog, the close button included.
    dialog()!.querySelector('button[aria-label="Close dialog"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await nextTick()
    expect(shown()).toBe('s2')
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    await new Promise((r) => setTimeout(r, 0))
    expect(dialog()).toBeNull()
    expect(document.activeElement).toBe(thumb.element)
  })

  it('edit slides opens editor', async () => {
    const { wrapper, router } = await mountStep('/p/p1/create/preview?template=modern', deck([slide(0)], 1))
    await button(wrapper, /Edit slides/)!.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('editor')
    expect(router.currentRoute.value.params.id).toBe('p1')
    const present = wrapper.findAll('a').find((a) => /Present/.test(a.text()))!
    expect(present.attributes('href')).toBe('/p/p1/present')
  })

  it('has one primary, Continue to Narration, and a quiet Skip to Export', async () => {
    const { wrapper, router } = await mountStep('/p/p1/create/preview?template=modern', deck([slide(0, true)], 1))
    const primary = wrapper.get('[data-testid="continue-narration"]')
    expect(primary.text()).toBe('Continue to Narration')
    // Skip to Export is a text-style ghost button, not a second solid primary.
    const skip = wrapper.get('[data-testid="skip-to-export"]')
    expect(skip.text()).toBe('Skip to Export')
    expect(skip.classes().join(' ')).not.toContain('bg-accent')
    expect(primary.classes().join(' ')).toContain('bg-accent')
    await primary.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/p/p1/create/avatar?template=modern')
  })

  it('Skip to Export goes straight to Export, whatever the deck needs', async () => {
    const { wrapper, router } = await mountStep('/p/p1/create/preview?template=modern', deck([slide(0)], 1))
    await button(wrapper, /Skip to Export/)!.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/p/p1/create/export?template=modern')
  })

  it('both ways on wait until the slides have finished generating', async () => {
    const { wrapper } = await mountStep('/p/p1/create/preview?stream=1', deck([slide(0)], 3))
    expect(wrapper.get('[data-testid="skip-to-export"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="continue-narration"]').attributes('disabled')).toBeDefined()
  })
})
