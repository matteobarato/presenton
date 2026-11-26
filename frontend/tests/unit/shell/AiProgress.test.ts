import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import AiProgress from '@/components/shell/AiProgress.vue'

describe('AiProgress', () => {
  afterEach(() => vi.useRealTimers())

  it('uses value when given', () => {
    const w = mount(AiProgress, { props: { stage: 'Building', value: 40 } })
    expect(w.get('[role=progressbar]').attributes('aria-valuenow')).toBe('40')
    expect(w.text()).toContain('40%')
  })

  it('clamps value', () => {
    expect(mount(AiProgress, { props: { stage: 'x', value: 140 } }).get('[role=progressbar]').attributes('aria-valuenow')).toBe('100')
    expect(mount(AiProgress, { props: { stage: 'x', value: -5 } }).get('[role=progressbar]').attributes('aria-valuenow')).toBe('0')
  })

  it('falls back to timer', async () => {
    vi.useFakeTimers()
    const w = mount(AiProgress, { props: { stage: 'x', expectedMs: 1000 } })
    expect(w.get('[role=progressbar]').attributes('aria-valuenow')).toBe('0')
    await vi.advanceTimersByTimeAsync(2000)
    expect(Number(w.get('[role=progressbar]').attributes('aria-valuenow'))).toBeGreaterThan(50)
  })
})
