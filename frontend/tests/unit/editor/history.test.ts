import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useHistoryStore } from '@/stores/history'

beforeEach(() => setActivePinia(createPinia()))

const cmd = (log: string[], name: string) => ({
  label: name,
  do: async () => void log.push(`do ${name}`),
  undo: async () => void log.push(`undo ${name}`),
})

describe('history store', () => {
  it('undoes and redoes in order without running do on push', async () => {
    const h = useHistoryStore()
    const log: string[] = []
    h.push(cmd(log, 'a'))
    h.push(cmd(log, 'b'))
    expect(log).toEqual([])
    await h.undo()
    await h.undo()
    await h.redo()
    expect(log).toEqual(['undo b', 'undo a', 'do a'])
    expect(h.canUndo).toBe(true)
    expect(h.canRedo).toBe(true)
  })

  it('a new push clears the redo stack', async () => {
    const h = useHistoryStore()
    const log: string[] = []
    h.push(cmd(log, 'a'))
    await h.undo()
    h.push(cmd(log, 'b'))
    expect(h.canRedo).toBe(false)
  })

  it('keeps the command and rethrows when undo fails', async () => {
    const h = useHistoryStore()
    h.push({ label: 'x', do: async () => {}, undo: async () => Promise.reject(new Error('nope')) })
    await expect(h.undo()).rejects.toThrow('nope')
    expect(h.canUndo).toBe(true)
    expect(h.canRedo).toBe(false)
  })

  it('drops the oldest command on the 51st push', async () => {
    const h = useHistoryStore()
    const log: string[] = []
    for (let i = 0; i < 51; i++) h.push(cmd(log, String(i)))
    for (let i = 0; i < 60; i++) await h.undo()
    expect(log).toHaveLength(50)
    expect(log.at(-1)).toBe('undo 1')
  })

  it('clear empties both stacks', async () => {
    const h = useHistoryStore()
    h.push(cmd([], 'a'))
    await h.undo()
    h.clear()
    expect(h.canUndo).toBe(false)
    expect(h.canRedo).toBe(false)
  })

  it('ignores a second undo while the first is in flight', async () => {
    const h = useHistoryStore()
    let release!: () => void
    const undo = vi.fn(() => new Promise<void>((r) => (release = r)))
    h.push({ label: 'x', do: async () => {}, undo })
    const first = h.undo()
    expect(h.canUndo).toBe(false)
    await h.undo()
    release()
    await first
    expect(undo).toHaveBeenCalledTimes(1)
    expect(h.canRedo).toBe(true)
  })

  describe('merge', () => {
    afterEach(() => vi.useRealTimers())

    it('folds same-key pushes within 500ms into one command: first undo, latest do', async () => {
      vi.useFakeTimers()
      const h = useHistoryStore()
      const log: string[] = []
      h.push(cmd(log, 'n1'), { key: 'k' })
      vi.advanceTimersByTime(300)
      h.push(cmd(log, 'n2'), { key: 'k' })
      vi.advanceTimersByTime(300) // sliding: 300ms after the last push
      h.push(cmd(log, 'n3'), { key: 'k' })
      await h.undo()
      expect(h.canUndo).toBe(false)
      await h.redo()
      expect(log).toEqual(['undo n1', 'do n3'])
    })

    it('does not merge across a different key, an unkeyed push, a gap over 500ms or an undo', async () => {
      vi.useFakeTimers()
      const h = useHistoryStore()
      const log: string[] = []
      h.push(cmd(log, 'a'), { key: 'k' })
      h.push(cmd(log, 'b'), { key: 'other' })
      h.push(cmd(log, 'c'))
      h.push(cmd(log, 'd'), { key: 'k' })
      vi.advanceTimersByTime(501)
      h.push(cmd(log, 'e'), { key: 'k' })
      await h.undo()
      h.push(cmd(log, 'f'), { key: 'k' })
      for (let i = 0; i < 10; i++) await h.undo()
      expect(log).toEqual(['undo e', 'undo f', 'undo d', 'undo c', 'undo b', 'undo a'])
    })
  })
})
