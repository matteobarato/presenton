import { describe, expect, it } from 'vitest'
import { templateV2UiToHtmlFragment } from '@/render/legacy/lib/template-v2-json-to-html'

// A container card whose text child carries no size (e.g. momentum's
// marker_callout_sections). The text must wrap inside the card's content box
// instead of running out on a single line.
function uiWithContainer(child: Record<string, unknown>) {
  return {
    background: { color: 'FFFFFF' },
    components: [
      {
        id: 'c-card',
        description: 'Callout card',
        position: { x: 100, y: 80 },
        elements: [
          {
            type: 'container',
            position: { x: 0, y: 0 },
            size: { width: 566.86, height: 94.58 },
            fill: { color: '#F6F7FC', opacity: 1 },
            padding: { top: 20, right: 27, bottom: 18, left: 27.2 },
            child,
          },
        ],
      },
    ],
  }
}

const text = (extra: Record<string, unknown> = {}) => ({
  type: 'text',
  font: { family: 'Lato', size: 14, color: '#000000' },
  alignment: { horizontal: 'left', vertical: 'top' },
  runs: [{ text: 'A long callout sentence that must wrap within the card.' }],
  name: 'callout_text',
  ...extra,
})

describe('container child width', () => {
  it('sizes a sizeless flow child to the container content width', () => {
    const html = templateV2UiToHtmlFragment(uiWithContainer(text())) ?? ''
    // 566.86 - 27.2 - 27 = 512.66
    expect(html).toContain('width:512.66px;')
  })

  it('keeps an explicit child width', () => {
    const html = templateV2UiToHtmlFragment(
      uiWithContainer(text({ size: { width: 200, height: 40 } })),
    ) ?? ''
    expect(html).toContain('width:200px;')
    expect(html).not.toContain('width:512.66px;')
  })
})
