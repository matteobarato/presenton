import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { computed, defineComponent, h, nextTick, provide, ref, shallowRef } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { getElementAtSelection, type ElementSelection, type RawUi, type Selection } from '@/slide-editor/model'
import { SLIDE_EDITING_KEY, type SlideEditing } from '@/slide-editor/useSlideEditing'
import { DEFAULT_TEMPLATE_THEME } from '@/render/legacy/lib/template-theme'
import IconSection from '@/components/editor/inspector/element/IconSection.vue'
import { uiWithIcon, uiWithText } from '../../slide-editor/fixtures'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rec = Record<string, any>
vi.mock('@/composables/useSlideMutations', () => ({ useSlideMutations: () => ({ editSlideUi: vi.fn().mockResolvedValue(true) }) }))
const searchIcons = vi.fn()
vi.mock('@/api/icons', async (orig) => ({ ...(await orig<typeof import('@/api/icons')>()), searchIcons: (...a: unknown[]) => searchIcons(...a) }))
const toastError = vi.fn()
vi.mock('@/components/ui/sonner', () => ({ toast: { error: (...a: unknown[]) => toastError(...a) } }))

const presentation = { slides: [], theme: { ...DEFAULT_TEMPLATE_THEME } } as never
const sel: ElementSelection = { kind: 'element', componentIndex: 0, elementPath: [0] }
let wrapper: VueWrapper | null = null

function mountSection(ui: RawUi = uiWithIcon()) {
  const state = ref<RawUi>(ui)
  const ctx = {
    enabled: computed(() => true),
    ui: computed(() => state.value),
    selection: ref<Selection>(sel),
    inlineEdit: shallowRef(null),
    inlineEditor: shallowRef(null),
    commit: vi.fn(async (next: RawUi) => {
      state.value = next
      return true
    }),
    select: vi.fn(),
  } as unknown as SlideEditing
  wrapper = mount(
    defineComponent({
      setup() {
        provide(SLIDE_EDITING_KEY, ctx)
        return () => h(IconSection, { presentation })
      },
    }),
    { attachTo: document.body },
  )
  return { ctx, state }
}
const committed = (ctx: SlideEditing, n = 0) => (ctx.commit as ReturnType<typeof vi.fn>).mock.calls[n]![0] as RawUi
const label = (ctx: SlideEditing, n = 0) => (ctx.commit as ReturnType<typeof vi.fn>).mock.calls[n]![1] as string
const ticks = async () => {
  await nextTick()
  await nextTick()
}
const body = () => document.body
const results = () => [...body().querySelectorAll('button')].filter((b) => /^Icon \d+$/.test(b.getAttribute('aria-label') ?? '')).length
const input = () => body().querySelector('input[aria-label="Search icons"]') as HTMLInputElement
async function openPicker() {
  await wrapper!.get('button[aria-label="Change icon"]').trigger('click')
  await ticks()
}
async function search(text: string) {
  input().value = text
  input().dispatchEvent(new Event('input'))
  await vi.advanceTimersByTimeAsync(300)
  await flushPromises()
}
const deferred = <T,>() => {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  setActivePinia(createPinia())
  searchIcons.mockReset()
  toastError.mockReset()
})
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  vi.useRealTimers()
})

describe('IconSection', () => {
  it('commits a palette swatch as the icon colour', async () => {
    const { ctx } = mountSection()
    await wrapper!.get('button[aria-label="Icon colour"]').trigger('click')
    await ticks()
    const swatch = body().querySelector('button[aria-label^="#"]') as HTMLElement
    const colour = swatch.getAttribute('aria-label')
    swatch.click()
    await flushPromises()
    expect(ctx.commit).toHaveBeenCalledTimes(1)
    expect(label(ctx)).toBe('Icon colour')
    expect((getElementAtSelection(committed(ctx), sel) as Rec).color).toBe(colour)
  })

  it('picking an icon commits data and icon_type, labelled Change icon', async () => {
    searchIcons.mockResolvedValue(['/static/icons/bold/heart-bold.png', '/static/icons/bold/moon-bold.png'])
    const { ctx } = mountSection()
    await openPicker()
    await search('heart')
    expect(searchIcons.mock.calls[0]![0]).toMatchObject({ query: 'heart', icon_weight: 'bold' })
    const replace = [...body().querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Replace') as HTMLButtonElement
    expect(replace.disabled).toBe(true)
    ;(body().querySelector('button[aria-label="Icon 2"]') as HTMLElement).click()
    await ticks()
    replace.click()
    await flushPromises()
    expect(ctx.commit).toHaveBeenCalledTimes(1)
    expect(label(ctx)).toBe('Change icon')
    expect(getElementAtSelection(committed(ctx), sel)).toMatchObject({ data: '/static/icons/bold/moon-bold.png', icon_type: 'bold', color: '112233' })
  })

  it('a search resolving after the dialog closed changes nothing and commits nothing', async () => {
    const d = deferred<string[]>()
    searchIcons.mockReturnValue(d.promise)
    const { ctx } = mountSection()
    await openPicker()
    await search('star')
    body().querySelector<HTMLElement>('button[aria-label="Close dialog"]')!.click()
    await flushPromises()
    expect(input()).toBeNull()
    d.resolve(['/static/icons/bold/a-bold.png'])
    await flushPromises()
    // Reopened, the late response must not have landed.
    await openPicker()
    expect(results()).toBe(0)
    expect(ctx.commit).not.toHaveBeenCalled()
    expect(toastError).not.toHaveBeenCalled()
  })

  it('picking after the element was deleted shows the toast and does not commit', async () => {
    searchIcons.mockResolvedValue(['/static/icons/bold/heart-bold.png'])
    const { ctx, state } = mountSection()
    await openPicker()
    await search('heart')
    ;(body().querySelector('button[aria-label="Icon 1"]') as HTMLElement).click()
    await ticks()
    state.value = uiWithText()
    ;(state.value as Rec).components = []
    await ticks()
    const replace = [...body().querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Replace') as HTMLButtonElement
    replace.click()
    await flushPromises()
    expect(ctx.commit).not.toHaveBeenCalled()
    expect(toastError).toHaveBeenCalledWith('The icon was removed from the slide.')
  })

  it('with overlapping searches only the later results render', async () => {
    const first = deferred<string[]>()
    const second = deferred<string[]>()
    searchIcons.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    mountSection()
    await openPicker()
    await search('a')
    await search('ab')
    second.resolve(['/static/icons/bold/second-bold.png'])
    await flushPromises()
    first.resolve(['/static/icons/bold/first-bold.png', '/static/icons/bold/first2-bold.png'])
    await flushPromises()
    expect(results()).toBe(1)
  })

  it('shows the empty state and an error with Retry', async () => {
    searchIcons.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(['/static/icons/bold/a-bold.png'])
    mountSection()
    await openPicker()
    await search('zzz')
    expect(body().textContent).toContain('No icons for "zzz"')
    await search('zzzz')
    expect(body().textContent).toContain('boom')
    const retry = [...body().querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Retry') as HTMLButtonElement
    retry.click()
    await flushPromises()
    expect(results()).toBe(1)
  })
})
