import { afterEach, describe, expect, it } from 'vitest'
import { i18n, setUiLocale } from '@/i18n'

describe('ui locale', () => {
  afterEach(() => setUiLocale('en'))

  it('defaults to English and switches to Italian', () => {
    expect(i18n.global.t('common.actions.save')).toBe('Save')
    setUiLocale('it')
    expect(i18n.global.t('common.actions.save')).toBe('Salva')
    expect(document.documentElement.lang).toBe('it')
  })

  it('persists the choice', () => {
    setUiLocale('it')
    expect(localStorage.getItem('ui-locale')).toBe('it')
  })
})
