import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Slide } from '@/api/types'
import { slideKind } from '@/render/slide-kind'

const template = JSON.parse(
  readFileSync(resolve(process.cwd(), '../templates/modern/template.json'), 'utf8'),
)

const asSlide = (value: Record<string, unknown>) => value as unknown as Slide

describe('slideKind', () => {
  it('detects template slides from ui', () => {
    expect(slideKind(asSlide({ ui: template.layouts[0], layout_group: 'modern', layout: 'modern:x' }))).toBe('template')
  })
  it('detects smart html slides', () => {
    expect(slideKind(asSlide({ html_content: '<div/>', layout_group: 'smart-html' }))).toBe('smart')
  })
  it('falls back to smart when only html exists', () => {
    expect(slideKind(asSlide({ html_content: '<div/>', ui: {} }))).toBe('smart')
  })
  it('detects blank slides', () => {
    expect(slideKind(asSlide({ layout: 'blank', layout_group: 'blank' }))).toBe('blank')
    expect(slideKind(asSlide({ layout: 'g:__blank_slide__', ui: template.layouts[0] }))).toBe('blank')
  })
  it('reports empty slides', () => {
    expect(slideKind(asSlide({}))).toBe('empty')
  })
})
