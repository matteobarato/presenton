import DOMPurify from 'dompurify'

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ESCAPES[c])

/** Inline spans on already-escaped text. Code spans are stashed so their content stays literal. */
function inline(escaped: string): string {
  const codes: string[] = []
  let out = escaped.replace(/`([^`\n]+)`/g, (_, code: string) => {
    codes.push(`<code>${code}</code>`)
    return `\u0000${codes.length - 1}\u0000`
  })
  out = out
    .replace(
      /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,
      (_, text: string, url: string) => `<a href="${url}">${text}</a>`,
    )
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
  return out.replace(/\u0000(\d+)\u0000/g, (_, i: string) => codes[Number(i)])
}

const BULLET = /^\s*[-*]\s+(.*)$/
const ORDERED = /^\s*\d+[.)]\s+(.*)$/

/**
 * A deliberately small, safe markdown subset: paragraphs, line breaks, bold,
 * italic, inline code, fenced code, lists and http(s) links. HTML is escaped
 * first and the result is sanitised again with DOMPurify.
 */
export function renderMarkdown(source: string): string {
  const lines = escapeHtml(source.replace(/\r\n?/g, '\n')).split('\n')
  const html: string[] = []
  let para: string[] = []
  const flush = () => {
    if (para.length) html.push(`<p>${para.map(inline).join('<br>')}</p>`)
    para = []
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*```/.test(line)) {
      flush()
      const code: string[] = []
      i++
      while (i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++])
      html.push(`<pre><code>${code.join('\n')}</code></pre>`)
      continue
    }
    const kind = BULLET.test(line) ? 'ul' : ORDERED.test(line) ? 'ol' : null
    if (kind) {
      flush()
      const re = kind === 'ul' ? BULLET : ORDERED
      const items: string[] = []
      while (i < lines.length && re.test(lines[i])) {
        items.push(`<li>${inline(re.exec(lines[i])![1])}</li>`)
        i++
      }
      i--
      html.push(`<${kind}>${items.join('')}</${kind}>`)
      continue
    }
    if (!line.trim()) flush()
    else para.push(line)
  }
  flush()
  const clean = DOMPurify.sanitize(html.join(''), {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'code', 'pre', 'ul', 'ol', 'li', 'a'],
    ALLOWED_ATTR: ['href'],
    ALLOWED_URI_REGEXP: /^https?:/i,
  })
  // Sanitised anchors carry only `href`, so the external-link attributes are added afterwards.
  return clean.replace(/<a href=/g, '<a target="_blank" rel="noopener noreferrer" href=')
}
