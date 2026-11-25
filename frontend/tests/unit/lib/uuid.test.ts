import { afterEach, describe, expect, it, vi } from 'vitest'
import { uuid } from '@/lib/uuid'

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('uuid', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('works without crypto.randomUUID (plain HTTP on a server address)', () => {
    const real = globalThis.crypto
    vi.stubGlobal('crypto', { getRandomValues: real.getRandomValues.bind(real) })
    const ids = [uuid(), uuid()]
    expect(ids[0]).toMatch(V4)
    expect(ids[1]).toMatch(V4)
    expect(ids[0]).not.toBe(ids[1])
  })
})
