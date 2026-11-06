import { describe, expect, it } from 'vitest'
import type { Presentation } from '@/api/types'
import { applyStreamEvent, type StreamAccumulator } from '@/editor/streamMerge'

const deck = (slides: unknown[] = []) => ({ id: 'p1', title: 't', slides, theme: { a: 1 } }) as unknown as Presentation
const acc = () => ({ chunks: '' })

describe('applyStreamEvent', () => {
  it('slide_html appends a smart slide at its index', () => {
    const next = applyStreamEvent(deck(), { type: 'slide_html', index: 0, html: '<p>hi</p>', slide_id: 's0' }, acc())!
    expect(next.slides).toHaveLength(1)
    expect(next.slides[0]).toMatchObject({ id: 's0', index: 0, html_content: '<p>hi</p>', layout_group: 'smart-html' })
    expect(next.theme).toEqual({ a: 1 })
  })

  it('chunk progressively yields slides from partial JSON', () => {
    const a = acc()
    const one = applyStreamEvent(undefined, { type: 'chunk', chunk: '{"slides":[{"index":0,"layout":"x:y","content":{"title":"A' }, a)!
    expect(one.slides).toHaveLength(1)
    expect(one.slides[0]).toMatchObject({ index: 0, content: { title: 'A' } })
    const two = applyStreamEvent(one, { type: 'chunk', chunk: '"}},{"index":1,"layout":"x:y","content":{}}' }, a)!
    expect(two.slides).toHaveLength(2)
    expect(two.slides[0]).toMatchObject({ content: { title: 'A' } })
  })

  it('skips a truncated chunk that cannot be repaired', () => {
    const prev = deck([{ id: 's', index: 0 }])
    expect(applyStreamEvent(prev, { type: 'chunk', chunk: '<<not json' }, acc())).toBe(prev)
  })

  it('slide_assets keeps resolved image URLs over placeholders', () => {
    const prev = deck([{ id: 's', index: 0, layout: 'l', content: { image: '/app_data/images/real.png' } }])
    const next = applyStreamEvent(
      prev,
      { type: 'slide_assets', slide: { id: 's', index: 0, layout: 'l', content: { image: '/static/images/placeholder.jpg' } } },
      acc(),
    )!
    expect((next.slides[0]!.content as { image: string }).image).toContain('real.png')
  })

  it('records generation metrics on the accumulator and leaves the deck alone', () => {
    const a: StreamAccumulator = { chunks: '' }
    const prev = deck()
    expect(applyStreamEvent(prev, { type: 'generation_metrics', model: 'm', output_tokens: 12, total_tokens: 20 }, a)).toBe(prev)
    expect(a.metrics).toMatchObject({ model: 'm', output_tokens: 12, total_tokens: 20 })
  })

  it('complete merges the final presentation and keeps the theme', () => {
    const prev = deck([{ id: 's', index: 0, content: { image: '/app_data/images/real.png' } }])
    const next = applyStreamEvent(
      prev,
      { type: 'complete', presentation: { id: 'p1', slides: [{ id: 's', index: 0, content: { image: '/static/images/placeholder.jpg' } }] } },
      acc(),
    )!
    expect(next.theme).toEqual({ a: 1 })
    expect((next.slides[0]!.content as { image: string }).image).toContain('real.png')
  })
})
