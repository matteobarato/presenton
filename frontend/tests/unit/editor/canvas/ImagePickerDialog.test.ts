import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import ImagePickerDialog from '@/components/editor/canvas/ImagePickerDialog.vue'

const api = vi.hoisted(() => ({
  uploadImage: vi.fn(),
  listUploadedImages: vi.fn(),
  listGeneratedImages: vi.fn(),
  generateImage: vi.fn(),
  searchStockImages: vi.fn(),
}))
vi.mock('@/api/images', async (orig) => ({ ...(await orig<typeof import('@/api/images')>()), ...api }))

function mountPicker() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return mount(ImagePickerDialog, { props: { open: true }, global: { plugins: [[VueQueryPlugin, { queryClient: client }]] }, attachTo: document.body })
}
const body = () => document.body
async function openTab(name: string) {
  await flushPromises()
  const trigger = [...body().querySelectorAll('[role="tab"]')].find((t) => t.textContent?.trim() === name) as HTMLElement
  trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }))
  await flushPromises()
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  Object.values(api).forEach((f) => f.mockReset())
  api.listUploadedImages.mockResolvedValue([])
  api.listGeneratedImages.mockResolvedValue([])
})
afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('ImagePickerDialog', () => {
  it('marks the dialog content as ignored by inline editing and offers four tabs', async () => {
    const w = mountPicker()
    await flushPromises()
    expect(body().querySelector('[role="dialog"]')?.getAttribute('data-inline-edit-ignore')).toBe('true')
    expect([...body().querySelectorAll('[role="tab"]')].map((t) => t.textContent?.trim())).toEqual(['Upload', 'Uploaded', 'Generate', 'Stock'])
    w.unmount()
  })

  it('emits the path of a picked uploaded image', async () => {
    api.listUploadedImages.mockResolvedValue([{ id: '1', path: '/app_data/images/a.png' }])
    const w = mountPicker()
    await openTab('Uploaded')
    const button = body().querySelector('button[aria-label="Use image 1"]') as HTMLElement
    button.click()
    await flushPromises()
    expect(w.emitted('pick')).toEqual([['/app_data/images/a.png']])
    expect(w.emitted('update:open')?.at(-1)).toEqual([false])
    w.unmount()
  })

  it('shows a spinner while generating and Cancel aborts without picking', async () => {
    let signal: AbortSignal | undefined
    api.generateImage.mockImplementation((_p: string, s?: AbortSignal) => {
      signal = s
      return new Promise((_res, rej) => s?.addEventListener('abort', () => rej(new DOMException('Aborted', 'AbortError'))))
    })
    const w = mountPicker()
    await openTab('Generate')
    const input = body().querySelector('input[aria-label="Image prompt"]') as HTMLInputElement
    input.value = 'a red fox'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    ;(body().querySelector('button[aria-label="Generate image"]') as HTMLElement).click()
    await flushPromises()
    expect(body().querySelector('[role="status"]')).not.toBeNull()
    expect(api.generateImage).toHaveBeenCalledWith('a red fox', expect.any(AbortSignal))
    ;(body().querySelector('button[aria-label="Cancel generation"]') as HTMLElement).click()
    await flushPromises()
    expect(signal?.aborted).toBe(true)
    expect(w.emitted('pick')).toBeUndefined()
    expect(body().querySelector('[role="alert"]')).toBeNull()
    expect(body().querySelector('[role="status"]')).toBeNull()
    w.unmount()
  })

  it('shows a generate error inline', async () => {
    api.generateImage.mockRejectedValue(new Error('Image provider is not configured'))
    const w = mountPicker()
    await openTab('Generate')
    const input = body().querySelector('input[aria-label="Image prompt"]') as HTMLInputElement
    input.value = 'x'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    ;(body().querySelector('button[aria-label="Generate image"]') as HTMLElement).click()
    await flushPromises()
    expect(body().querySelector('[role="alert"]')?.textContent).toContain('Image provider is not configured')
    expect(w.emitted('pick')).toBeUndefined()
    w.unmount()
  })

  it('searches stock images and emits the picked URL', async () => {
    api.searchStockImages.mockResolvedValue(['https://img.example/1.jpg'])
    const w = mountPicker()
    await openTab('Stock')
    const input = body().querySelector('input[aria-label="Search stock images"]') as HTMLInputElement
    input.value = 'dog'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    ;(body().querySelector('button[aria-label="Search"]') as HTMLElement).click()
    await flushPromises()
    expect(api.searchStockImages).toHaveBeenCalledWith('dog', expect.any(AbortSignal))
    ;(body().querySelector('button[aria-label="Use image 1"]') as HTMLElement).click()
    expect(w.emitted('pick')).toEqual([['https://img.example/1.jpg']])
    w.unmount()
  })

  it('uploads a chosen file and emits its path, showing errors inline', async () => {
    api.uploadImage.mockResolvedValueOnce({ id: 'u', path: '/app_data/images/u.png' })
    const w = mountPicker()
    await flushPromises()
    const input = body().querySelector('input[type="file"]') as HTMLInputElement
    expect(input.accept).toBe('image/*')
    const file = new File(['x'], 'u.png', { type: 'image/png' })
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()
    expect(api.uploadImage).toHaveBeenCalledWith(file)
    expect(w.emitted('pick')).toEqual([['/app_data/images/u.png']])

    api.uploadImage.mockRejectedValueOnce(new Error('File too large'))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()
    expect(body().querySelector('[role="alert"]')?.textContent).toContain('File too large')
    w.unmount()
  })
})
