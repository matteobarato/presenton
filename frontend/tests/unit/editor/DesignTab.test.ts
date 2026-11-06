import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import type { Presentation } from '@/api/types'
import DesignTab from '@/components/editor/inspector/DesignTab.vue'

const pres = vi.hoisted(() => ({ updatePresentation: vi.fn() }))
const themesApi = vi.hoisted(() => ({
  listThemes: vi.fn(),
  getDefaultTheme: vi.fn(),
  createTheme: vi.fn(),
  updateTheme: vi.fn(),
  deleteTheme: vi.fn(),
  generateTheme: vi.fn(),
}))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))

vi.mock('@/api/presentations', () => ({
  ...pres,
  presentationKeys: { all: ['presentations'], one: (id: string) => ['presentation', id] },
}))
vi.mock('@/api/themes', async (orig) => ({ ...(await orig<typeof import('@/api/themes')>()), ...themesApi }))
vi.mock('@/components/ui/sonner', () => ({ toast }))

const colors = (primary: string) => ({
  primary, background: '#ffffff', card: '#eeeeee', stroke: '#dddddd', primary_text: '#ffffff',
  background_text: '#000000', graph_0: '#111111', graph_1: '#222222', graph_2: '#333333', graph_3: '#444444',
  graph_4: '#555555', graph_5: '#666666', graph_6: '#777777', graph_7: '#888888', graph_8: '#999999', graph_9: '#aaaaaa',
})
const theme = (id: string, name: string, user: string, primary = '#ff0000') => ({
  id, name, description: '', user, data: { colors: colors(primary) },
})
const SYSTEM = theme('sys', 'Aurora', 'system')
const CUSTOM = theme('cus', 'Mine', 'local', '#00ff00')

let queryClient: QueryClient
const presentation = (t: unknown = null) => ({ id: 'p1', theme: t, slides: [] }) as unknown as Presentation
const cached = () => queryClient.getQueryData<{ theme: { id?: string } | null }>(['presentation', 'p1'])?.theme

async function mountTab(current: unknown = null) {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  queryClient.setQueryData(['presentation', 'p1'], presentation(current))
  const w = mount(DesignTab, {
    attachTo: document.body,
    props: { presentationId: 'p1', presentation: presentation(current), activeSlide: null },
    global: { plugins: [[VueQueryPlugin, { queryClient }]] },
  })
  await flushPromises()
  return w
}
const item = (w: Awaited<ReturnType<typeof mountTab>>, name: string) =>
  w.findAll('[data-testid="theme-item"]').find((i) => i.text().includes(name))!

beforeEach(() => {
  document.body.innerHTML = ''
  Object.values({ ...pres, ...themesApi, ...toast }).forEach((f) => f.mockReset())
  themesApi.listThemes.mockResolvedValue([SYSTEM, CUSTOM])
})

describe('DesignTab', () => {
  it('lists default and saved themes with swatches; edit/delete only on custom ones', async () => {
    const w = await mountTab()
    expect(w.findAll('[data-testid="theme-item"]').map((i) => i.text())).toEqual(['Default', 'Aurora', 'Mine'])
    expect(item(w, 'Aurora').findAll('[data-testid="swatch-chip"]').length).toBeGreaterThan(2)
    expect(item(w, 'Mine').find('[aria-label="Edit Mine"]').exists()).toBe(true)
    expect(item(w, 'Aurora').find('[aria-label^="Edit"]').exists()).toBe(false)
    expect(item(w, 'Aurora').find('[aria-label^="Delete"]').exists()).toBe(false)
    expect(item(w, 'Default').find('[aria-label^="Delete"]').exists()).toBe(false)
  })

  it('ignores a malformed theme list (non-array or null entries) instead of crashing', async () => {
    themesApi.listThemes.mockResolvedValue({ id: 'p1', theme: null })
    const bad = await mountTab()
    expect(bad.findAll('[data-testid="theme-item"]').map((i) => i.text())).toEqual(['Default'])
    bad.unmount()
    themesApi.listThemes.mockResolvedValue([null, SYSTEM])
    const partial = await mountTab()
    expect(partial.findAll('[data-testid="theme-item"]').map((i) => i.text())).toEqual(['Default', 'Aurora'])
  })

  it('marks the applied theme with aria-pressed', async () => {
    const w = await mountTab(CUSTOM)
    const pressed = (n: string) => item(w, n).get('button').attributes('aria-pressed')
    expect(pressed('Mine')).toBe('true')
    expect(pressed('Aurora')).toBe('false')
    expect(pressed('Default')).toBe('false')
  })

  it('applies optimistically, sending only the theme', async () => {
    let resolve!: (v: unknown) => void
    pres.updatePresentation.mockReturnValue(new Promise((r) => (resolve = r)))
    const w = await mountTab()
    await item(w, 'Mine').get('button').trigger('click')
    await flushPromises()
    expect(cached()?.id).toBe('cus')
    expect(pres.updatePresentation).toHaveBeenCalledWith({ id: 'p1', theme: CUSTOM })
    expect(pres.updatePresentation.mock.calls[0][0]).not.toHaveProperty('slides')
    resolve({})
  })

  it('rolls back and reports a failed apply', async () => {
    pres.updatePresentation.mockRejectedValue(new Error('boom'))
    const w = await mountTab(SYSTEM)
    await item(w, 'Mine').get('button').trigger('click')
    await flushPromises()
    expect(cached()?.id).toBe('sys')
    expect(toast.error).toHaveBeenCalled()
  })

  it('generates a theme from seed colours, showing pending, then lists it', async () => {
    let resolve!: (v: unknown) => void
    themesApi.generateTheme.mockReturnValue(new Promise((r) => (resolve = r)))
    const made = theme('gen', 'Generated theme', 'local', '#0000ff')
    themesApi.createTheme.mockResolvedValue(made)
    const w = await mountTab()
    themesApi.listThemes.mockResolvedValue([SYSTEM, CUSTOM, made])
    await w.get('form button[type="submit"]').trigger('click')
    await flushPromises()
    expect(w.get('form button[type="submit"]').text()).toBe('Generating…')
    expect(w.get('form button[type="submit"]').attributes('disabled')).toBeDefined()
    resolve(colors('#0000ff'))
    await flushPromises()
    expect(themesApi.createTheme).toHaveBeenCalledWith(expect.objectContaining({ name: 'Generated theme', data: { colors: colors('#0000ff') } }))
    expect(w.text()).toContain('Generated theme')
  })

  it('asks for confirmation before deleting', async () => {
    themesApi.deleteTheme.mockResolvedValue(undefined)
    const w = await mountTab()
    await item(w, 'Mine').get('[aria-label="Delete Mine"]').trigger('click')
    await flushPromises()
    expect(themesApi.deleteTheme).not.toHaveBeenCalled()
    const confirm = Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent === 'Delete')!
    confirm.click()
    await flushPromises()
    expect(themesApi.deleteTheme).toHaveBeenCalledWith('cus')
  })

  it('edits a custom theme through the editor dialog', async () => {
    themesApi.updateTheme.mockResolvedValue({ ...CUSTOM, name: 'Renamed' })
    const w = await mountTab()
    await item(w, 'Mine').get('[aria-label="Edit Mine"]').trigger('click')
    await flushPromises()
    const name = document.body.querySelector<HTMLInputElement>('#theme-name')!
    expect(name.value).toBe('Mine')
    name.value = 'Renamed'
    name.dispatchEvent(new Event('input'))
    await flushPromises()
    document.body.querySelector<HTMLFormElement>('form[class*="flex-col gap-3"]')!.dispatchEvent(new Event('submit'))
    await flushPromises()
    expect(themesApi.updateTheme).toHaveBeenCalledWith('cus', expect.objectContaining({ name: 'Renamed' }))
    w.unmount()
  })
})
