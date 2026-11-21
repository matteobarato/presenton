import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { rovingKeydown, rovingTab } from '@/lib/roving'

describe('roving radio helpers', () => {
  it('rovingTab gives the Tab stop to the checked radio, else the first', () => {
    expect([0, 1, 2].map((i) => rovingTab(i, 1))).toEqual([-1, 0, -1])
    expect([0, 1, 2].map((i) => rovingTab(i, -1))).toEqual([0, -1, -1])
  })

  function grid(columns: number) {
    const w = mount(
      {
        template: `<div role="radiogroup" @keydown="k"><button v-for="n in 5" :key="n" role="radio" :disabled="n === 2">{{ n }}</button></div>`,
        methods: { k(e: KeyboardEvent) { rovingKeydown(e, columns) } },
      },
      { attachTo: document.body },
    )
    return { w, btns: w.findAll('button') }
  }

  it('skips disabled radios', async () => {
    const { w, btns } = grid(1)
    btns[0].element.focus()
    await w.trigger('keydown', { key: 'ArrowDown' })
    expect(document.activeElement).toBe(btns[2].element)
  })

  it('moves a row with Up/Down in a grid and stays put at the edge', async () => {
    const { w, btns } = grid(2)
    btns[2].element.focus()
    await w.trigger('keydown', { key: 'ArrowDown' })
    expect(document.activeElement).toBe(btns[4].element)
    await w.trigger('keydown', { key: 'ArrowDown' })
    expect(document.activeElement).toBe(btns[4].element)
    await w.trigger('keydown', { key: 'ArrowUp' })
    expect(document.activeElement).toBe(btns[2].element)
  })
})
