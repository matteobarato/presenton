import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, nextTick, provide, ref, type Ref } from 'vue'
import type { AnimationTween, Slide } from '@/api/types'

const m = vi.hoisted(() => ({
  editSlideUi: vi.fn(),
  previews: [] as { root: ParentNode; tweens: AnimationTween[]; opts: unknown; seek: ReturnType<typeof vi.fn>; restore: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }[],
}))
vi.mock('@/composables/useSlideMutations', () => ({ useSlideMutations: () => ({ editSlideUi: m.editSlideUi }) }))
vi.mock('@/motion/preview', () => ({
  createPreview: vi.fn((root: ParentNode, tweens: AnimationTween[], opts: unknown) => {
    const p = { root, tweens, opts, seek: vi.fn(), restore: vi.fn(), dispose: vi.fn(), play: vi.fn(), pause: vi.fn(), time: () => 0 }
    m.previews.push(p)
    return p
  }),
}))

import EditableSlide from '@/components/editor/canvas/EditableSlide.vue'
import { SLIDE_ANIMATION_KEY } from '@/composables/useSlideAnimation'
import { useSlideEditing, type SlideEditing } from '@/slide-editor/useSlideEditing'
import { useEditorStore } from '@/stores/editor'
import { uiTwoComponents } from '../../slide-editor/fixtures'
import { stubRect, tpl } from './harness'

const tween = (target: string): AnimationTween => ({ target, from_values: { opacity: 0 }, duration: 0.6, delay: 0, ease: 'power2.out' })

let wrapper: VueWrapper | null = null
let rect: ReturnType<typeof stubRect>

function setup() {
  const slide = ref<Slide>(tpl('a', uiTwoComponents())) as Ref<Slide | null>
  const draft = ref<AnimationTween[]>([tween('e0')])
  const stale = ref(false)
  let api!: SlideEditing
  wrapper = mount(
    defineComponent({
      setup() {
        api = useSlideEditing(ref('p1'), slide)
        provide(SLIDE_ANIMATION_KEY, { draft, stale } as never)
        return () => h(EditableSlide, { key: slide.value!.id!, slide: slide.value! })
      },
    }),
    { attachTo: document.body },
  )
  const editor = useEditorStore()
  editor.activeSlideId = 'a'
  return { slide, draft, stale, editor, api: () => api, w: wrapper }
}

const shadow = () => wrapper!.get('[data-template-host]').element.shadowRoot!

beforeEach(() => {
  setActivePinia(createPinia())
  m.previews.length = 0
  rect = stubRect()
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  rect.mockRestore()
})

describe('EditableSlide motion preview', () => {
  it('builds no preview while Motion is merely open', async () => {
    const { editor } = setup()
    editor.inspectorTab = 'motion'
    editor.footerTab = 'motion'
    await flushPromises()
    expect(m.previews).toHaveLength(0)
  })

  it('previews on the shadow root when motionTime is set, and seeks as it moves', async () => {
    const { editor, draft } = setup()
    editor.footerTab = 'motion'
    await flushPromises()
    editor.motionTime = 0.4
    await nextTick()
    expect(m.previews).toHaveLength(1)
    expect(m.previews[0]!.root).toBe(shadow())
    expect(m.previews[0]!.opts).toEqual({ reducedMotion: false })
    expect(m.previews[0]!.tweens).toEqual(draft.value)
    expect(m.previews[0]!.seek).toHaveBeenLastCalledWith(0.4)
    editor.motionTime = 1.1
    await nextTick()
    expect(m.previews).toHaveLength(1)
    expect(m.previews[0]!.seek).toHaveBeenLastCalledWith(1.1)
    editor.motionTime = null
    await nextTick()
    expect(m.previews[0]!.restore).toHaveBeenCalled()
  })

  it('rebuilds the preview at the current time when the draft changes', async () => {
    const { editor, draft } = setup()
    editor.footerTab = 'motion'
    editor.motionTime = 0.8
    await flushPromises()
    draft.value = [tween('e0'), tween('e1')]
    await nextTick()
    expect(m.previews[0]!.restore).toHaveBeenCalled()
    expect(m.previews).toHaveLength(2)
    expect(m.previews[1]!.tweens).toHaveLength(2)
    expect(m.previews[1]!.seek).toHaveBeenLastCalledWith(0.8)
  })

  it('never previews a stale plan, and restores the slide when the plan goes stale', async () => {
    const { editor, stale } = setup()
    editor.footerTab = 'motion'
    editor.motionTime = 0.5
    await flushPromises()
    expect(m.previews).toHaveLength(1)
    stale.value = true
    await nextTick()
    expect(m.previews[0]!.restore).toHaveBeenCalled()
    editor.motionTime = 0.9
    await nextTick()
    expect(m.previews).toHaveLength(1)
  })

  it('restores the slide on slide change', async () => {
    const { editor, slide } = setup()
    editor.footerTab = 'motion'
    editor.motionTime = 0.5
    await flushPromises()
    const first = m.previews[0]!
    slide.value = tpl('b', uiTwoComponents())
    editor.activeSlideId = 'b'
    await flushPromises()
    expect(first.restore).toHaveBeenCalled()
  })

  it('restores the slide when Motion is left', async () => {
    const { editor } = setup()
    editor.inspectorTab = 'motion'
    editor.footerTab = 'motion'
    editor.motionTime = 0.5
    await flushPromises()
    editor.footerTab = 'notes'
    await nextTick()
    expect(m.previews[0]!.restore).not.toHaveBeenCalled() // the inspector still shows Motion
    editor.inspectorTab = 'design'
    await nextTick()
    expect(editor.motionTime).toBeNull()
    expect(m.previews[0]!.restore).toHaveBeenCalled()
  })

  it('restores the slide on unmount', async () => {
    const { editor } = setup()
    editor.footerTab = 'motion'
    editor.motionTime = 0.5
    await flushPromises()
    wrapper!.unmount()
    wrapper = null
    expect(m.previews[0]!.restore).toHaveBeenCalled()
  })

  it('disables direct editing while previewing', async () => {
    const { editor, api, w } = setup()
    await flushPromises()
    api().select({ kind: 'component', componentIndex: 0 })
    await nextTick()
    expect(w.find('[data-testid="selection-overlay"]').exists()).toBe(true)
    editor.footerTab = 'motion'
    editor.motionTime = 0.2
    await nextTick()
    expect(api().selection.value).toBeNull()
    expect(w.find('[data-testid="selection-overlay"]').exists()).toBe(false)
    // A selection made elsewhere (the Layers panel) is dropped too.
    api().select({ kind: 'component', componentIndex: 1 })
    await nextTick()
    expect(api().selection.value).toBeNull()
    editor.motionTime = null
    await nextTick()
    expect(w.find('[data-testid="selection-overlay"]').exists()).toBe(true)
  })

  it('previews opacity only when the user prefers reduced motion', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion'), media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    }))
    try {
      const { editor } = setup()
      editor.footerTab = 'motion'
      editor.motionTime = 0.5
      await flushPromises()
      expect(m.previews[0]!.opts).toEqual({ reducedMotion: true })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('outlines the selected element while Motion is open and not previewing', async () => {
    const { editor } = setup()
    await flushPromises()
    editor.motionTarget = 'e0'
    await nextTick()
    expect(shadow().querySelector('[data-motion-selected]')).toBeNull() // Motion is not open
    editor.footerTab = 'motion'
    await nextTick()
    expect(shadow().querySelector('[data-motion-selected]')?.getAttribute('data-hf-el')).toBe('e0')
    expect(shadow().querySelector('style[data-motion-outline]')?.textContent).toContain('dashed')
    editor.motionTime = 0.3
    await nextTick()
    expect(shadow().querySelector('[data-motion-selected]')).toBeNull()
  })
})
