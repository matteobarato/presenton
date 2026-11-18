// Bar buttons, popover swatches and panel fields must not drive the slide's keyboard shortcuts (nudge,
// delete, enter-to-edit) or leave a focused button to the inline editor; typing in fields is unaffected.
const SHORTCUT_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', ' ', 'Delete', 'Backspace'])

export function guardKeys(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null
  if (el?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el?.tagName ?? '')) return
  if (SHORTCUT_KEYS.has(e.key)) e.stopPropagation()
}
