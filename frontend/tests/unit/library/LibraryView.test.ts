import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { defineComponent, h } from 'vue'
import type { PresentationSummary } from '@/api/presentations'
import { ApiError } from '@/api/errors'
import LibraryView from '@/views/LibraryView.vue'

const api = vi.hoisted(() => ({
  listPresentations: vi.fn(),
  duplicatePresentation: vi.fn(),
  deletePresentation: vi.fn(),
}))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))

vi.mock('@/api/presentations', () => ({
  ...api,
  presentationKeys: { all: ['presentations'], one: (id: string) => ['presentation', id] },
}))
vi.mock('@/components/ui/sonner', () => ({ toast }))

const SlideViewStub = defineComponent({
  name: 'SlideView',
  props: { slide: { type: Object, required: true }, theme: null, fonts: null, lazy: Boolean, fit: String },
  setup(props) {
    return () => h('div', { 'data-testid': 'cover', 'data-slide': props.slide.id })
  },
})

function deck(id: string, title: string, updated: string, slideIds: [string, number][] = [[`${id}-s0`, 0]]): PresentationSummary {
  return {
    id,
    title,
    updated_at: updated,
    created_at: updated,
    theme: { name: `theme-${id}` },
    fonts: null,
    slides: slideIds.map(([sid, index]) => ({ id: sid, index, content: {} })),
  } as unknown as PresentationSummary
}

const decks = () => [
  deck('a', 'Quarterly Review', '2026-11-01T10:00:00Z', [
    ['a-s1', 1],
    ['a-s0', 0],
  ]),
  deck('b', 'Roadmap', '2026-11-05T10:00:00Z'),
  deck('c', 'team offsite', '2026-11-03T10:00:00Z'),
]

let queryClient: QueryClient

async function mountView() {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: LibraryView },
      { path: '/new', component: { template: '<div />' } },
      { path: '/p/:id', component: { template: '<div />' } },
    ],
  })
  await router.push('/')
  await router.isReady()
  const wrapper = mount(LibraryView, {
    attachTo: document.body,
    global: { plugins: [router, [VueQueryPlugin, { queryClient }]], stubs: { SlideView: SlideViewStub } },
  })
  await flushPromises()
  return wrapper
}

const titles = (w: Awaited<ReturnType<typeof mountView>>) => w.findAll('[data-testid="deck"] h3').map((h) => h.text())

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  document.body.innerHTML = ''
  Object.values(api).forEach((f) => f.mockReset())
  toast.success.mockReset()
  toast.error.mockReset()
  api.listPresentations.mockResolvedValue(decks())
})

describe('LibraryView', () => {
  it('renders one card per presentation, newest first, with a lazy cover of the first slide', async () => {
    const w = await mountView()
    expect(titles(w)).toEqual(['Roadmap', 'team offsite', 'Quarterly Review'])
    const covers = w.findAllComponents(SlideViewStub)
    expect(covers).toHaveLength(3)
    expect(covers[2].props('slide').id).toBe('a-s0')
    expect(covers[2].props('lazy')).toBe(true)
    expect(covers[2].props('theme')).toEqual({ name: 'theme-a' })
    expect(w.findAll('[data-testid="deck"]')[0].text()).toContain('1 slide ·')
    expect(w.findAll('[data-testid="deck"]')[2].text()).toContain('2 slides ·')
  })

  it('filters by title case-insensitively', async () => {
    const w = await mountView()
    await w.get('input[type="search"]').setValue('TEAM')
    expect(titles(w)).toEqual(['team offsite'])
    await w.get('input[type="search"]').setValue('zzz')
    expect(titles(w)).toEqual([])
    expect(w.text()).toContain('No presentations match')
  })

  it('persists the grid/list toggle in localStorage', async () => {
    const w = await mountView()
    await w.get('[aria-label="List view"]').trigger('click')
    expect(localStorage.getItem('presenton.library.view')).toBe('list')
    expect(w.findAllComponents({ name: 'PresentationRow' })).toHaveLength(3)
    w.unmount()
    const again = await mountView()
    expect(again.findAllComponents({ name: 'PresentationRow' })).toHaveLength(3)
    await again.get('[aria-label="Grid view"]').trigger('click')
    expect(localStorage.getItem('presenton.library.view')).toBe('grid')
  })

  it('duplicate invalidates the presentations query and toasts', async () => {
    api.duplicatePresentation.mockResolvedValue(deck('d', 'copy', '2026-11-06T10:00:00Z'))
    const w = await mountView()
    const spy = vi.spyOn(queryClient, 'invalidateQueries')
    await w.get('[aria-label="Duplicate Roadmap"]').trigger('click')
    await flushPromises()
    expect(api.duplicatePresentation).toHaveBeenCalledWith('b')
    expect(spy).toHaveBeenCalledWith({ queryKey: ['presentations'] })
    expect(toast.success).toHaveBeenCalled()
  })

  it('delete asks for confirmation then removes the card optimistically', async () => {
    let resolve!: () => void
    api.deletePresentation.mockReturnValue(new Promise<void>((r) => (resolve = r)))
    const w = await mountView()
    await w.get('[aria-label="Delete Roadmap"]').trigger('click')
    await flushPromises()
    expect(api.deletePresentation).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('Delete presentation?')
    const confirm = [...document.body.querySelectorAll('button')].find((b) => b.textContent === 'Delete')!
    confirm.click()
    await flushPromises()
    expect(api.deletePresentation).toHaveBeenCalledWith('b')
    expect(titles(w)).not.toContain('Roadmap')
    resolve()
    await flushPromises()
    expect(titles(w)).toHaveLength(2)
  })

  it('restores the card and toasts the server message when delete fails', async () => {
    api.deletePresentation.mockRejectedValue(new ApiError('boom', 500, { detail: 'Deck is locked' }))
    const w = await mountView()
    await w.get('[aria-label="Delete Roadmap"]').trigger('click')
    await flushPromises()
    ;[...document.body.querySelectorAll('button')].find((b) => b.textContent === 'Delete')!.click()
    await flushPromises()
    expect(titles(w)).toContain('Roadmap')
    expect(toast.error).toHaveBeenCalledWith('Deck is locked')
  })

  it('empty state links to /new', async () => {
    api.listPresentations.mockResolvedValue([])
    const w = await mountView()
    const link = w.get('a[href="/new"]')
    expect(link.text()).toContain('New presentation')
  })
})
