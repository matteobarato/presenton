import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { replaceIconWeightInUrl, searchIcons } from '@/api/icons'

const fetchMock = vi.fn()
beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('icons api', () => {
  it('searchIcons builds the query string', async () => {
    fetchMock.mockImplementation(async () => new Response('["/static/icons/bold/a-bold.png"]', { headers: { 'content-type': 'application/json' } }))
    const out = await searchIcons({ query: 'star', icon_weight: 'light' })
    expect(out).toEqual(['/static/icons/bold/a-bold.png'])
    const [a, b] = fetchMock.mock.calls.at(-1)!
    const req = a instanceof Request ? a : new Request(new URL(a, 'http://localhost:3000'), b)
    const url = new URL(req.url)
    expect(url.pathname).toBe('/api/v1/ppt/icons/search')
    expect(url.searchParams.get('query')).toBe('star')
    expect(url.searchParams.get('limit')).toBe('40')
    expect(url.searchParams.get('icon_weight')).toBe('light')
  })

  it('replaceIconWeightInUrl swaps folder and suffix', () => {
    expect(replaceIconWeightInUrl('/static/icons/bold/x-bold.png', 'light')).toBe('/static/icons/light/x-light.png')
    expect(replaceIconWeightInUrl('/static/icons/bold/x-bold.png', 'regular')).toBe('/static/icons/regular/x.png')
    expect(replaceIconWeightInUrl('/static/icons/regular/x.svg?v=1', 'fill')).toBe('/static/icons/fill/x-fill.svg?v=1')
    expect(replaceIconWeightInUrl('/other/x.png', 'fill')).toBe('/other/x.png')
  })
})
