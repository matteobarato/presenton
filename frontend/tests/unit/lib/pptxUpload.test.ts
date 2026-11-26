import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api/errors'
import { MAX_FONT_BYTES, MAX_PPTX_BYTES } from '@/api/templateImport'
import { i18n } from '@/i18n'
import { baseName, fontFileError, pptxFileError, uploadErrorMessage } from '@/lib/pptxUpload'

const t = (key: string) => i18n.global.t(`templates.import.errors.${key}`)
const fileOf = (name: string, size = 1) => {
  const f = new File(['x'], name)
  Object.defineProperty(f, 'size', { value: size })
  return f
}

describe('pptxUpload', () => {
  it('accepts a .pptx in any case and rejects other types and sizes', () => {
    expect(pptxFileError(fileOf('Deck.PPTX'))).toBeNull()
    expect(pptxFileError(fileOf('deck.pdf'))).toBe(t('notPptx'))
    expect(pptxFileError(fileOf('deck'))).toBe(t('notPptx'))
    expect(pptxFileError(fileOf('deck.pptx', MAX_PPTX_BYTES))).toBeNull()
    expect(pptxFileError(fileOf('deck.pptx', MAX_PPTX_BYTES + 1))).toBe(t('tooLarge'))
  })

  it('accepts font files by extension and size', () => {
    expect(fontFileError(fileOf('Gotham.TTF'))).toBeNull()
    expect(fontFileError(fileOf('a.woff2'))).toBeNull()
    expect(fontFileError(fileOf('a.zip'))).toBe(t('fontType'))
    expect(fontFileError(fileOf('a.otf', MAX_FONT_BYTES + 1))).toBe(t('fontTooLarge'))
  })

  it('names the error from an ApiError, else the fallback', () => {
    expect(uploadErrorMessage(new Error('x'), 'prepareFailed')).toBe(t('prepareFailed'))
    expect(uploadErrorMessage(new ApiError('boom', 500), 'prepareFailed')).toBeTruthy()
  })

  it('strips the extension and trims', () => {
    expect(baseName(' My deck .pptx')).toBe('My deck')
    expect(baseName('.hidden')).toBe('.hidden')
    expect(baseName('plain')).toBe('plain')
  })
})
