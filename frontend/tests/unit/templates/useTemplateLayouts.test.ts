import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import type { TemplateSummary } from '@/api/templates'

const getTemplate = vi.fn()
vi.mock('@/api/outlines', async (orig) => ({
  ...(await orig<typeof import('@/api/outlines')>()),
  getTemplate: (...a: unknown[]) => getTemplate(...a),
}))

import { templateDetailKey } from '@/api/outlines'
import { useTemplateLayouts } from '@/composables/useTemplateLayouts'
import { layoutToSlide } from '@/components/templates/layoutSlide'

const summary = (over: Partial<TemplateSummary>): TemplateSummary => ({
  id: 'c1',
  name: 'C1',
  layouts: [1, 2, 3],
  kind: 'custom',
  ...over,
})

function host(t: TemplateSummary, qc: QueryClient) {
  let api!: ReturnType<typeof useTemplateLayouts>
  const C = defineComponent({
    setup() {
      api = useTemplateLayouts(() => t)
      return () => h('div')
    },
  })
  mount(C, { global: { plugins: [[VueQueryPlugin, { queryClient: qc }]] } })
  return api
}
const newQc = () => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } })
const detail = { layouts: [{ id: 'l0' }, { id: 'l1' }], theme: { a: 1 }, fonts: ['f'] }

beforeEach(() => getTemplate.mockReset())

describe('useTemplateLayouts', () => {
  it('returns summary layouts without fetching when they are objects', async () => {
    const api = host(summary({ layouts: [{ id: 'a' }, { id: 'b' }] }), newQc())
    await flushPromises()
    expect(getTemplate).not.toHaveBeenCalled()
    expect(api.layouts.value.length).toBe(2)
  })

  it('fetches custom layouts and exposes theme/fonts', async () => {
    getTemplate.mockResolvedValue(detail)
    const api = host(summary({}), newQc())
    expect(api.pending.value).toBe(true)
    await flushPromises()
    expect(api.pending.value).toBe(false)
    expect(api.layouts.value).toEqual(detail.layouts)
    expect(api.theme.value).toEqual(detail.theme)
    expect(api.fonts.value).toEqual(detail.fonts)
  })

  it('shares the templateDetailKey cache', async () => {
    getTemplate.mockResolvedValue(detail)
    const qc = newQc()
    host(summary({}), qc)
    await flushPromises()
    expect(qc.getQueryData(templateDetailKey('c1'))).toEqual(detail)
    const second = host(summary({}), qc)
    await flushPromises()
    expect(getTemplate).toHaveBeenCalledTimes(1)
    expect(second.layouts.value.length).toBe(2)
  })

  it('reports failure and retries', async () => {
    getTemplate.mockRejectedValueOnce(new Error('boom'))
    const api = host(summary({}), newQc())
    await flushPromises()
    expect(api.failed.value).toBe(true)
    getTemplate.mockResolvedValue(detail)
    api.retry()
    await flushPromises()
    expect(api.failed.value).toBe(false)
    expect(api.layouts.value.length).toBe(2)
  })

  it('does not fetch for zero layouts', async () => {
    const api = host(summary({ layouts: [] }), newQc())
    await flushPromises()
    expect(getTemplate).not.toHaveBeenCalled()
    expect(api.pending.value).toBe(false)
  })
})

describe('layoutToSlide', () => {
  it('builds a template-v2 slide', () => {
    const layout = { id: 'l0' }
    expect(layoutToSlide('t', layout, 0)).toMatchObject({
      id: 't-preview-0',
      ui: layout,
      layout: 'l0',
      layout_group: 'template-v2',
    })
  })
})
