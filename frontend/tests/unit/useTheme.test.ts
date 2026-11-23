import { beforeEach, describe, expect, it, vi } from 'vitest'

type MQ = { matches: boolean; listeners: Set<(e: { matches: boolean }) => void> }
let mq: MQ

function mockMatchMedia(dark: boolean) {
  mq = { matches: dark, listeners: new Set() }
  window.matchMedia = vi.fn().mockImplementation(() => ({
    get matches() { return mq.matches },
    addEventListener: (_: string, cb: any) => mq.listeners.add(cb),
    removeEventListener: (_: string, cb: any) => mq.listeners.delete(cb),
    addListener: (cb: any) => mq.listeners.add(cb),
    removeListener: (cb: any) => mq.listeners.delete(cb),
  })) as any
}
function osChange(dark: boolean) {
  mq.matches = dark
  mq.listeners.forEach((cb) => cb({ matches: dark }))
}

async function load() {
  vi.resetModules()
  return await import('@/composables/useTheme')
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.className = ''
  mockMatchMedia(true)
})

describe('useTheme', () => {
  it('defaults to system when storage empty', async () => {
    const { useTheme, initTheme } = await load()
    initTheme()
    expect(useTheme().preference.value).toBe('system')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('ignores invalid stored value', async () => {
    localStorage.setItem('theme', 'purple')
    const { useTheme, initTheme } = await load()
    initTheme()
    expect(useTheme().preference.value).toBe('system')
  })

  it('survives localStorage throwing', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('x') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('x') })
    const { useTheme, initTheme } = await load()
    expect(() => initTheme()).not.toThrow()
    expect(() => useTheme().setPreference('light')).not.toThrow()
    expect(document.documentElement.classList.contains('light')).toBe(true)
    vi.restoreAllMocks()
  })

  it("setPreference('light') persists and adds .light", async () => {
    const { useTheme, initTheme } = await load()
    initTheme()
    useTheme().setPreference('light')
    expect(localStorage.getItem('theme')).toBe('light')
    const c = document.documentElement.classList
    expect(c.contains('light')).toBe(true)
    expect(c.contains('dark')).toBe(false)
    expect(document.documentElement.style.colorScheme).toBe('light')
  })

  it('system follows matchMedia change', async () => {
    const { useTheme, initTheme } = await load()
    initTheme()
    osChange(false)
    await Promise.resolve()
    expect(useTheme().resolved.value).toBe('light')
    expect(document.documentElement.classList.contains('light')).toBe(true)
  })

  it('explicit dark ignores matchMedia change', async () => {
    localStorage.setItem('theme', 'dark')
    const { useTheme, initTheme } = await load()
    initTheme()
    osChange(false)
    await Promise.resolve()
    expect(useTheme().resolved.value).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })
})
