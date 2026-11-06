// @font-face rules are ignored inside shadow roots by some engines, so slide
// fonts are registered once per page on the document, keyed by their CSS.
const registered = new Set<string>()

export function registerDocumentFonts(css: string): void {
  if (!css || registered.has(css) || typeof document === 'undefined') return
  registered.add(css)
  const style = document.createElement('style')
  style.dataset.slideFontFaces = 'true'
  style.textContent = css
  document.head.appendChild(style)
}
