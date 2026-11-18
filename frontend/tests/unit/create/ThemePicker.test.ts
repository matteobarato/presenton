import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { createMemoryHistory, createRouter } from 'vue-router'
import ThemePicker from '@/components/create/ThemePicker.vue'
import { useThemeParam } from '@/composables/useThemeParam'

const m = vi.hoisted(() => ({ listThemes: vi.fn() }))
vi.mock('@/api/themes', async (orig) => ({ ...(await orig<typeof import('@/api/themes')>()), listThemes: m.listThemes }))

const theme = { id: 't1', name: 'Ocean', user: 'u', data: { colors: {} } }

const Host = defineComponent({
  setup() {
    const p = useThemeParam()
    return () => h(ThemePicker, { modelValue: p.selectedThemeId.value, themes: p.themeList.value, 'onUpdate:modelValue': (v: string | null) => (p.selectedThemeId.value = v) })
  },
})

async function mountHost(path = '/new') {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/new', component: { template: '<div />' } }] })
  await router.push(path)
  await router.isReady()
  const wrapper = mount(Host, {
    global: { plugins: [router, [VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]] },
    attachTo: document.body,
  })
  await flushPromises()
  return { wrapper, router }
}
const btn = (w: Awaited<ReturnType<typeof mountHost>>['wrapper'], id: string) => w.get(`[data-testid="theme-option-${id}"] button`)

beforeEach(() => {
  m.listThemes.mockReset().mockResolvedValue([theme])
  document.body.innerHTML = ''
})

describe('ThemePicker + useThemeParam', () => {
  it('defaults to Template colours with no ?theme', async () => {
    const { wrapper } = await mountHost()
    expect(btn(wrapper, 'none').attributes('aria-pressed')).toBe('true')
    expect(btn(wrapper, 't1').attributes('aria-pressed')).toBe('false')
  })

  it('picking a theme writes ?theme and Template colours removes it', async () => {
    const { wrapper, router } = await mountHost('/new?template=c1')
    await btn(wrapper, 't1').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ template: 'c1', theme: 't1' })
    await btn(wrapper, 'none').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.theme).toBeUndefined()
    expect(router.currentRoute.value.query.template).toBe('c1')
  })

  it('drops an unknown ?theme id', async () => {
    const { router } = await mountHost('/new?theme=gone')
    expect(router.currentRoute.value.query.theme).toBeUndefined()
  })

  it('tolerates a failed or malformed list', async () => {
    m.listThemes.mockResolvedValue([null, theme])
    const a = await mountHost()
    expect(a.wrapper.findAll('[data-testid^="theme-option-"]')).toHaveLength(2)
    m.listThemes.mockRejectedValue(new Error('boom'))
    const b = await mountHost()
    expect(b.wrapper.findAll('[data-testid^="theme-option-"]')).toHaveLength(1)
  })
})
