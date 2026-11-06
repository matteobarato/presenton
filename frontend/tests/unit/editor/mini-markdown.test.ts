import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '@/lib/mini-markdown'

describe('renderMarkdown', () => {
  it('renders paragraphs, breaks, emphasis and inline code', () => {
    const html = renderMarkdown('Hello **bold** and *it* `x < y`\nnext\n\nsecond')
    expect(html).toBe('<p>Hello <strong>bold</strong> and <em>it</em> <code>x &lt; y</code><br>next</p><p>second</p>')
  })
  it('renders lists and fenced code literally', () => {
    expect(renderMarkdown('- a\n- b\n\n1. one\n2. two')).toBe(
      '<ul><li>a</li><li>b</li></ul><ol><li>one</li><li>two</li></ol>',
    )
    expect(renderMarkdown('```\n**not bold** <b>\n```')).toBe('<pre><code>**not bold** &lt;b&gt;</code></pre>')
  })
  it('links only http(s)', () => {
    expect(renderMarkdown('[ok](https://a.com/x?y=1)')).toContain(
      '<a target="_blank" rel="noopener noreferrer" href="https://a.com/x?y=1">ok</a>',
    )
    expect(renderMarkdown('[bad](javascript:alert(1))')).not.toContain('<a')
    expect(renderMarkdown('[bad](data:text/html,x)')).not.toContain('href')
  })
  it('neutralises XSS attempts', () => {
    for (const evil of [
      '<script>alert(1)</script>',
      '<img src=x onerror=alert(1)>',
      '**<svg onload=alert(1)>**',
      '[x](https://a.com" onmouseover="alert(1))',
      '`<img src=x onerror=alert(1)>`',
    ]) {
      const el = document.createElement('div')
      el.innerHTML = renderMarkdown(evil)
      expect(el.querySelector('script,img,svg,[onerror],[onload],[onmouseover]')).toBeNull()
    }
  })
})
