import { describe, expect, it } from 'vitest'
import {
  FOOTER_DEFAULT_HEIGHT,
  FOOTER_KEY_STEP,
  FOOTER_MAX_RATIO,
  FOOTER_MIN_HEIGHT,
  clampFooterHeight,
} from '@/components/editor/footerHeight'

describe('clampFooterHeight', () => {
  it('exposes the footer sizing constants', () => {
    expect(FOOTER_MIN_HEIGHT).toBe(96)
    expect(FOOTER_DEFAULT_HEIGHT).toBe(200)
    expect(FOOTER_MAX_RATIO).toBe(0.6)
    expect(FOOTER_KEY_STEP).toBe(16)
  })

  it('keeps a height inside the range', () => {
    expect(clampFooterHeight(500, 1000)).toBe(500)
  })

  it('caps at 60% of the card height', () => {
    expect(clampFooterHeight(900, 1000)).toBe(600)
  })

  it('floors at the minimum height', () => {
    expect(clampFooterHeight(10, 1000)).toBe(96)
  })

  it('lets the minimum win over a tiny card', () => {
    expect(clampFooterHeight(300, 100)).toBe(96)
  })
})
