import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { ApiError } from '@/api/errors'
import type { Presentation } from '@/api/types'
import ExportOptions from '@/components/editor/export/ExportOptions.vue'

const m = vi.hoisted(() => ({
  exportPresentation: vi.fn(),
  startVideoExport: vi.fn(),
  getVideoExport: vi.fn(),
  deleteVideoExport: vi.fn(),
  listTtsLanguages: vi.fn(),
  getTask: vi.fn(),
}))
vi.mock('@/api/exports', async (orig) => ({
  ...(await orig<typeof import('@/api/exports')>()),
  exportPresentation: m.exportPresentation,
  startVideoExport: m.startVideoExport,
  getVideoExport: m.getVideoExport,
  deleteVideoExport: m.deleteVideoExport,
}))
vi.mock('@/api/tts', async (orig) => ({ ...(await orig<typeof import('@/api/tts')>()), listTtsLanguages: m.listTtsLanguages }))
vi.mock('@/api/tasks', () => ({ getTask: m.getTask }))

const ID = 'p1'
const presentation = { id: ID, language: 'English', slides: [] } as unknown as Presentation
const video = { id: 'v1', language: 'it', url: '/app_data/exports/v.mp4' }

function mountTab() {
  return mount(ExportOptions, {
    props: { presentationId: ID, presentation },
    global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]] },
    attachTo: document.body,
  })
}

beforeEach(() => {
  Object.values(m).forEach((f) => f.mockReset())
  m.listTtsLanguages.mockResolvedValue([{ code: 'it', name: 'Italian' }])
  m.getVideoExport.mockResolvedValue(null)
  localStorage.clear()
  sessionStorage.clear()
  document.body.innerHTML = ''
})

describe('ExportOptions files', () => {
  it('exports and shows a download link, disabling both buttons meanwhile', async () => {
    let resolve!: (v: { path: string }) => void
    m.exportPresentation.mockReturnValue(new Promise((r) => (resolve = r)))
    const w = mountTab()
    await flushPromises()
    await w.get('[data-testid="export-pptx-button"]').trigger('click')
    expect(m.exportPresentation).toHaveBeenCalledWith(ID, 'pptx')
    expect(w.get('[data-testid="export-pptx-button"]').attributes('disabled')).toBeDefined()
    expect(w.get('[data-testid="export-pdf-button"]').attributes('disabled')).toBeDefined()
    resolve({ path: '/app_data/exports/deck.pptx' })
    await flushPromises()
    const a = w.get('[data-testid="download-pptx"]')
    expect(a.attributes('href')).toBe('/app_data/exports/deck.pptx')
    expect(a.attributes('download')).toBeDefined()
    expect(w.get('[data-testid="export-pdf-button"]').attributes('disabled')).toBeUndefined()
  })

  it('shows an export failure inline', async () => {
    m.exportPresentation.mockRejectedValue(new ApiError('Chromium crashed', 500))
    const w = mountTab()
    await w.get('[data-testid="export-pdf-button"]').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('Chromium crashed')
  })
})

describe('ExportOptions video', () => {
  it('shows basic options, hides advanced ones until expanded', async () => {
    localStorage.setItem('presenton.tts.lang', 'it')
    const w = mountTab()
    await flushPromises()
    expect(w.text()).toContain('Language')
    expect(w.text()).toContain('Resolution')
    expect(w.text()).toContain('Subtitles')
    expect(w.text()).toContain('Avatars')
    expect(w.find('[data-testid="mp4-advanced"]').exists()).toBe(false)
    await w.get('[data-testid="mp4-advanced-toggle"]').trigger('click')
    const adv = w.get('[data-testid="mp4-advanced"]').text()
    for (const label of ['Voice', 'Frames per second', 'Minimum seconds per slide', 'Padding seconds', 'Crossfade seconds', 'Generate missing audio', 'Speaker indicator', 'Animate', 'Regenerate']) {
      expect(adv).toContain(label)
    }
  })

  it('starts with the narration language, persists the task and shows its message', async () => {
    localStorage.setItem('presenton.tts.lang', 'it')
    m.startVideoExport.mockResolvedValue({ id: 't1', type: 'x', status: 'pending' })
    m.getTask.mockResolvedValue({ id: 't1', status: 'pending', message: 'Rendering slide 2', data: { completed: 1, total: 4 } })
    const w = mountTab()
    await flushPromises()
    await w.get('[data-testid="mp4-start"]').trigger('click')
    await flushPromises()
    const body = m.startVideoExport.mock.calls[0][1]
    expect(body).toMatchObject({ language: 'it', resolution: '1080p', subtitles: 'soft', avatars: true, animate: false })
    expect(sessionStorage.getItem(`presenton.task.mp4.${ID}`)).toBe('t1')
    await vi.waitFor(() => expect(w.get('[data-testid="mp4-message"]').text()).toBe('Rendering slide 2'))
  })

  it('when done, refetches the export and clears the stored task', async () => {
    m.startVideoExport.mockResolvedValue({ id: 't1', type: 'x', status: 'pending' })
    m.getTask.mockResolvedValue({ id: 't1', status: 'completed', message: 'done' })
    const w = mountTab()
    await flushPromises()
    m.getVideoExport.mockResolvedValue(video)
    await w.get('[data-testid="mp4-start"]').trigger('click')
    await vi.waitFor(() => expect(w.find('[data-testid="mp4-video"]').exists()).toBe(true))
    expect(sessionStorage.getItem(`presenton.task.mp4.${ID}`)).toBeNull()
    expect(w.get('[data-testid="mp4-download"]').attributes('href')).toBe('/app_data/exports/v.mp4')
  })

  it('loads an existing export on mount and deletes it after confirmation', async () => {
    m.getVideoExport.mockResolvedValue(video)
    m.deleteVideoExport.mockResolvedValue(undefined)
    const w = mountTab()
    await flushPromises()
    expect(m.getVideoExport).toHaveBeenCalled()
    expect(w.find('[data-testid="mp4-video"]').exists()).toBe(true)
    await w.get('[data-testid="mp4-delete"]').trigger('click')
    await flushPromises()
    expect(m.deleteVideoExport).not.toHaveBeenCalled()
    const confirm = document.body.querySelector('[data-testid="mp4-delete-confirm"]') as HTMLElement
    expect(confirm).not.toBeNull()
    confirm.click()
    await flushPromises()
    expect(m.deleteVideoExport).toHaveBeenCalledWith(ID, 'it')
    expect(w.find('[data-testid="mp4-video"]').exists()).toBe(false)
  })

  it('shows a validation error inline', async () => {
    m.startVideoExport.mockRejectedValue(new ApiError('Unsupported language', 422))
    const w = mountTab()
    await flushPromises()
    await w.get('[data-testid="mp4-start"]').trigger('click')
    await flushPromises()
    expect(w.get('[data-testid="mp4-start-error"]').text()).toContain('Unsupported language')
  })
})

describe('ExportOptions formats', () => {
  it('starts on PowerPoint and switches the visible panel by format', async () => {
    const w = mountTab()
    await flushPromises()
    const visible = (id: string) => (w.get(`[data-testid="${id}"]`).element.parentElement as HTMLElement).style.display !== 'none'
    expect(w.get('[data-testid="format-pptx"]').attributes('aria-checked')).toBe('true')
    expect(visible('export-pptx')).toBe(true)
    expect(visible('export-mp4')).toBe(false)
    await w.get('[data-testid="format-mp4"]').trigger('click')
    expect(w.get('[data-testid="format-mp4"]').attributes('aria-checked')).toBe('true')
    expect(visible('export-mp4')).toBe(true)
    expect(visible('export-pptx')).toBe(false)
  })
})
