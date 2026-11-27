import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FontInfo, ImportPreview } from '@/api/templateImport'
import { usePowerPointStart } from '@/composables/usePowerPointStart'

const api = vi.hoisted(() => ({ checkFonts: vi.fn(), prepareImport: vi.fn() }))
vi.mock('@/api/templateImport', async (orig) => ({ ...(await orig<object>()), ...api }))

const pptx = (name = 'deck.pptx') => new File(['x'], name)
const previewOf = (n: number, extra: Partial<ImportPreview> = {}) =>
  ({ slide_image_urls: Array.from({ length: n }, (_, i) => `/s${i}.png`), modified_pptx_url: '/m.pptx', fonts: [], ...extra }) as ImportPreview
const deferred = <T>() => {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

beforeEach(() => {
  api.checkFonts.mockReset()
  api.prepareImport.mockReset()
})

describe('usePowerPointStart', () => {
  it('prepares immediately and keeps missing fonts for the inline warning', async () => {
    api.checkFonts.mockResolvedValue([{ name: 'Gotham' }] as FontInfo[])
    api.prepareImport.mockResolvedValue(previewOf(2))
    const s = usePowerPointStart()
    await s.selectFile(pptx())
    expect(s.phase.value).toBe('ready')
    expect(s.missingFonts.value).toHaveLength(1)
    expect(api.prepareImport).toHaveBeenCalledWith(expect.any(File), [])
    expect(s.slideCount.value).toBe(2)
  })

  it('treats an unavailable font check as no warning', async () => {
    api.checkFonts.mockResolvedValue(null)
    api.prepareImport.mockResolvedValue(previewOf(1))
    const s = usePowerPointStart()
    await s.selectFile(pptx())
    expect(s.phase.value).toBe('ready')
    expect(s.missingFonts.value).toEqual([])
  })

  it('rejects non-pptx and oversized files without losing the current deck', async () => {
    api.checkFonts.mockResolvedValue([])
    api.prepareImport.mockResolvedValue(previewOf(3))
    const s = usePowerPointStart()
    const good = pptx()
    await s.selectFile(good)
    await s.selectFile(pptx('deck.pdf'))
    expect(s.error.value).toBeTruthy()
    expect(s.file.value).toBe(good)
    expect(s.slideCount.value).toBe(3)
    const big = pptx('big.pptx')
    Object.defineProperty(big, 'size', { value: 101 * 1024 * 1024 })
    await s.selectFile(big)
    expect(s.error.value).toBeTruthy()
    expect(s.file.value).toBe(good)
    expect(s.phase.value).toBe('ready')
  })

  it('a failed Replace keeps the working deck, its fonts and picks, and shows the error', async () => {
    const gotham = [{ name: 'Gotham' }] as FontInfo[]
    api.checkFonts.mockResolvedValueOnce(gotham).mockResolvedValueOnce([{ name: 'Other' }] as FontInfo[])
    api.prepareImport.mockResolvedValueOnce(previewOf(3)).mockRejectedValueOnce(new Error('x'))
    const s = usePowerPointStart()
    const good = pptx('a.pptx')
    await s.selectFile(good)
    const font = new File(['f'], 'Gotham.ttf')
    s.setReplacement('Gotham', font)
    const preview = s.preview.value
    await s.selectFile(pptx('b.pptx'))
    expect(s.phase.value).toBe('ready')
    expect(s.error.value).toBeTruthy()
    expect(s.file.value).toBe(good)
    expect(s.preview.value).toBe(preview)
    expect(s.missingFonts.value).toEqual(gotham)
    expect(s.replacements.value).toEqual({ Gotham: font })
  })

  it('a failed Replace keeps the applied fonts', async () => {
    api.checkFonts.mockResolvedValue([{ name: 'Gotham' }] as FontInfo[])
    api.prepareImport.mockResolvedValueOnce(previewOf(3)).mockResolvedValueOnce(previewOf(3)).mockRejectedValueOnce(new Error('x'))
    const s = usePowerPointStart()
    await s.selectFile(pptx('a.pptx'))
    const font = new File(['f'], 'Gotham.ttf')
    s.setReplacement('Gotham', font)
    await s.applyFonts()
    await s.selectFile(pptx('b.pptx'))
    expect(s.appliedReplacements.value).toEqual({ Gotham: font })
  })

  it('a failed first upload ends idle with no deck', async () => {
    api.checkFonts.mockResolvedValue([])
    api.prepareImport.mockRejectedValueOnce(new Error('x'))
    const s = usePowerPointStart()
    await s.selectFile(pptx('a.pptx'))
    expect(s.phase.value).toBe('idle')
    expect(s.error.value).toBeTruthy()
    expect(s.file.value).toBeNull()
    expect(s.preview.value).toBeNull()
    expect(s.missingFonts.value).toEqual([])
  })

  it('drops a stale result', async () => {
    api.checkFonts.mockResolvedValue([])
    const a = deferred<ImportPreview>()
    const b = deferred<ImportPreview>()
    api.prepareImport.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise)
    const s = usePowerPointStart()
    const fileA = pptx('a.pptx')
    const fileB = pptx('b.pptx')
    const pa = s.selectFile(fileA)
    await vi.waitFor(() => expect(api.prepareImport).toHaveBeenCalledTimes(1))
    const pb = s.selectFile(fileB)
    await vi.waitFor(() => expect(api.prepareImport).toHaveBeenCalledTimes(2))
    b.resolve(previewOf(2))
    await pb
    a.resolve(previewOf(5))
    await pa
    expect(s.slideCount.value).toBe(2)
    expect(s.file.value).toBe(fileB)
    expect(s.phase.value).toBe('ready')
  })

  it('applyFonts sends the replacements and swaps the preview in', async () => {
    api.checkFonts.mockResolvedValue([{ name: 'Gotham' }] as FontInfo[])
    api.prepareImport.mockResolvedValueOnce(previewOf(2))
    const s = usePowerPointStart()
    await s.selectFile(pptx())
    const font = new File(['f'], 'Gotham.ttf')
    expect(s.setReplacement('Gotham', font)).toBeNull()
    expect(s.setReplacement('Gotham', new File(['f'], 'g.zip'))).toBeTruthy()
    api.prepareImport.mockResolvedValueOnce(previewOf(4))
    await s.applyFonts()
    expect(api.prepareImport).toHaveBeenLastCalledWith(expect.any(File), [{ name: 'Gotham', file: font }])
    expect(s.slideCount.value).toBe(4)
    expect(s.phase.value).toBe('ready')
    expect(s.appliedReplacements.value).toEqual({ Gotham: font })
  })

  it('appliedReplacements holds only what the last successful apply used', async () => {
    api.checkFonts.mockResolvedValue([{ name: 'Gotham' }, { name: 'Futura' }] as FontInfo[])
    api.prepareImport.mockResolvedValueOnce(previewOf(2))
    const s = usePowerPointStart()
    await s.selectFile(pptx())
    expect(s.appliedReplacements.value).toEqual({})
    const gotham = new File(['f'], 'Gotham.ttf')
    s.setReplacement('Gotham', gotham)
    expect(s.appliedReplacements.value).toEqual({})
    api.prepareImport.mockResolvedValueOnce(previewOf(2))
    await s.applyFonts()
    // A later pick that is not applied (or an apply that fails) does not count.
    s.setReplacement('Futura', new File(['f'], 'Futura.ttf'))
    api.prepareImport.mockRejectedValueOnce(new Error('x'))
    await s.applyFonts()
    expect(s.appliedReplacements.value).toEqual({ Gotham: gotham })
    // A new deck starts with nothing applied.
    api.prepareImport.mockResolvedValueOnce(previewOf(2))
    await s.selectFile(pptx('other.pptx'))
    expect(s.appliedReplacements.value).toEqual({})
  })

  it('originalSlideCount falls back to slideCount', async () => {
    api.checkFonts.mockResolvedValue([])
    api.prepareImport.mockResolvedValueOnce(previewOf(2))
    const s = usePowerPointStart()
    expect(s.slideCount.value).toBe(0)
    await s.selectFile(pptx())
    expect(s.originalSlideCount.value).toBe(2)
    api.prepareImport.mockResolvedValueOnce(previewOf(2, { original_slide_count: 9 }))
    await s.selectFile(pptx())
    expect(s.originalSlideCount.value).toBe(9)
  })
})
