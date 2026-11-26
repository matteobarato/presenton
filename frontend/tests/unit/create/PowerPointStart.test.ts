import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { FontInfo, ImportPreview } from '@/api/templateImport'
import PowerPointStart from '@/components/create/PowerPointStart.vue'
import { usePowerPointStart } from '@/composables/usePowerPointStart'

const api = vi.hoisted(() => ({ checkFonts: vi.fn(), prepareImport: vi.fn() }))
vi.mock('@/api/templateImport', async (orig) => ({ ...(await orig<object>()), ...api }))

const previewOf = (n: number) =>
  ({ slide_image_urls: Array.from({ length: n }, (_, i) => `/s${i}.png`), pptx_url: '/p.pptx', modified_pptx_url: '/m.pptx', fonts: {} }) as ImportPreview

async function mountReady() {
  const start = usePowerPointStart()
  await start.selectFile(new File(['x'], 'first.pptx'))
  const wrapper = mount(PowerPointStart, { props: { start, language: 'English' }, attachTo: document.body })
  await flushPromises()
  return { start, wrapper }
}

async function loadFirstThumb(wrapper: Awaited<ReturnType<typeof mountReady>>['wrapper'], width: number, height: number) {
  const img = wrapper.get('[data-testid="pptx-thumbs"] img')
  Object.defineProperty(img.element, 'naturalWidth', { value: width, configurable: true })
  Object.defineProperty(img.element, 'naturalHeight', { value: height, configurable: true })
  await img.trigger('load')
}

beforeEach(() => {
  api.checkFonts.mockReset().mockResolvedValue([])
  api.prepareImport.mockReset().mockResolvedValue(previewOf(3))
  document.body.innerHTML = ''
})

describe('PowerPointStart', () => {
  it('shows the deck: its name, slide count and a lazy thumbnail per slide', async () => {
    const { wrapper } = await mountReady()
    expect(wrapper.text()).toContain('first.pptx')
    expect(wrapper.text()).toContain('3 slides')
    const imgs = wrapper.findAll('[data-testid="pptx-thumbs"] img')
    expect(imgs.map((i) => i.attributes('alt'))).toEqual(['Slide 1', 'Slide 2', 'Slide 3'])
    expect(imgs[0].attributes('loading')).toBe('lazy')
    expect(wrapper.find('[data-testid="pptx-limit-note"]').exists()).toBe(false)
  })

  it('Replace re-selects', async () => {
    const { wrapper } = await mountReady()
    api.prepareImport.mockResolvedValue(previewOf(5))
    const input = wrapper.get('[data-testid="pptx-replace-input"]')
    const next = new File(['y'], 'second.pptx')
    Object.defineProperty(input.element, 'files', { value: [next], configurable: true })
    await input.trigger('change')
    await flushPromises()
    expect(api.prepareImport).toHaveBeenLastCalledWith(next, [])
    expect(wrapper.text()).toContain('second.pptx')
    expect(wrapper.findAll('[data-testid="pptx-thumbs"] img')).toHaveLength(5)
  })

  it('a refused replacement keeps the deck on screen and says why', async () => {
    const { wrapper } = await mountReady()
    const input = wrapper.get('[data-testid="pptx-replace-input"]')
    Object.defineProperty(input.element, 'files', { value: [new File(['y'], 'notes.pdf')], configurable: true })
    await input.trigger('change')
    await flushPromises()
    expect(wrapper.findAll('[data-testid="pptx-thumbs"] img')).toHaveLength(3)
    expect(wrapper.get('[role="alert"]').text()).not.toBe('')
  })

  it('shows progress while the deck is read', async () => {
    let finish!: (p: ImportPreview) => void
    api.prepareImport.mockReturnValue(new Promise<ImportPreview>((r) => (finish = r)))
    const start = usePowerPointStart()
    const wrapper = mount(PowerPointStart, { props: { start, language: 'English' } })
    const picking = start.selectFile(new File(['x'], 'deck.pptx'))
    await flushPromises()
    expect(wrapper.get('[role="status"]').text()).toBe('Reading your slides…')
    expect(wrapper.find('[data-testid="import-dropzone"]').exists()).toBe(false)
    finish(previewOf(2))
    await picking
    await flushPromises()
    expect(wrapper.findAll('[data-testid="pptx-thumbs"] img')).toHaveLength(2)
  })

  it('the fit note shows for a 4:3 thumbnail, not for 16:9', async () => {
    const wide = await mountReady()
    await loadFirstThumb(wide.wrapper, 1280, 720)
    expect(wide.wrapper.find('[data-testid="pptx-fit-note"]').exists()).toBe(false)
    wide.wrapper.unmount()

    const square = await mountReady()
    await loadFirstThumb(square.wrapper, 1024, 768)
    expect(square.wrapper.get('[data-testid="pptx-fit-note"]').text()).toContain('fitted to 16:9')
  })

  it('the language error says why under the picker', async () => {
    const { wrapper } = await mountReady()
    expect(wrapper.find('[data-testid="pptx-language-error"]').exists()).toBe(false)
    await wrapper.setProps({ languageError: true })
    expect(wrapper.get('[data-testid="pptx-language-error"]').text()).toContain('language')
  })

  describe('missing fonts', () => {
    const fonts = [{ name: 'Gotham' }, { name: 'Futura' }] as FontInfo[]
    const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')
    const applyButton = () => document.querySelector<HTMLButtonElement>('[data-testid="pptx-fonts-apply"]')!
    const fontInputs = () => Array.from(dialog()!.querySelectorAll<HTMLInputElement>('input[type="file"]'))

    async function openFonts(wrapper: Awaited<ReturnType<typeof mountReady>>['wrapper']) {
      await wrapper.get('[data-testid="pptx-fonts-fix"]').trigger('click')
      await flushPromises()
    }
    async function pick(index: number, file: File) {
      const input = fontInputs()[index]
      Object.defineProperty(input, 'files', { value: [file], configurable: true })
      input.dispatchEvent(new Event('change'))
      await flushPromises()
    }
    async function cancel() {
      Array.from(dialog()!.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Cancel')!.click()
      await flushPromises()
    }

    beforeEach(() => api.checkFonts.mockResolvedValue(fonts))

    it('the warning lists only fonts with no applied replacement', async () => {
      const { wrapper } = await mountReady()
      expect(wrapper.get('[data-testid="pptx-fonts-note"]').text()).toContain('Gotham, Futura')
      await openFonts(wrapper)
      await pick(0, new File(['f'], 'Gotham.ttf'))
      applyButton().click()
      await flushPromises()
      expect(wrapper.get('[data-testid="pptx-fonts-note"]').text()).toContain('Futura')
      expect(wrapper.get('[data-testid="pptx-fonts-note"]').text()).not.toContain('Gotham')
    })

    it('says the fonts were replaced once every missing font is applied', async () => {
      const { wrapper } = await mountReady()
      await openFonts(wrapper)
      await pick(0, new File(['f'], 'Gotham.ttf'))
      await pick(1, new File(['f'], 'Futura.otf'))
      applyButton().click()
      await flushPromises()
      expect(wrapper.find('[data-testid="pptx-fonts-note"]').exists()).toBe(false)
      expect(wrapper.get('[data-testid="pptx-fonts-done"]').text()).toContain('Fonts replaced')
    })

    it('a pick that was cancelled, not applied, keeps the warning', async () => {
      const { wrapper } = await mountReady()
      await openFonts(wrapper)
      await pick(0, new File(['f'], 'Gotham.ttf'))
      await pick(1, new File(['f'], 'Futura.otf'))
      await cancel()
      expect(wrapper.get('[data-testid="pptx-fonts-note"]').text()).toContain('Gotham, Futura')
      expect(wrapper.find('[data-testid="pptx-fonts-done"]').exists()).toBe(false)
    })

    it('Apply is disabled until a replacement is chosen', async () => {
      const { wrapper } = await mountReady()
      await openFonts(wrapper)
      expect(applyButton().disabled).toBe(true)
      await pick(0, new File(['f'], 'Gotham.ttf'))
      expect(applyButton().disabled).toBe(false)
    })

    it('closing the dialog clears its font error', async () => {
      const { wrapper } = await mountReady()
      await openFonts(wrapper)
      await pick(0, new File(['f'], 'Gotham.zip'))
      expect(dialog()!.querySelector('[role="alert"]')?.textContent).toBeTruthy()
      await cancel()
      await openFonts(wrapper)
      expect(dialog()!.querySelector('[role="alert"]')).toBeNull()
    })
  })
})
