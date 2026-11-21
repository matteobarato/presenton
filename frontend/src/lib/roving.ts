/**
 * Roving tabindex for custom radio groups (`role="radiogroup"` with `role="radio"` buttons): the group is one Tab
 * stop and the arrow keys move and select inside it, as native radios do.
 *
 * Bind `:tabindex="rovingTab(i, checkedIndex)"` on each radio and `@keydown="rovingKeydown($event, columns)"` on the group.
 */

/** 0 for the radio that holds the group's Tab stop (the checked one, else the first), -1 for the others. */
export function rovingTab(index: number, checkedIndex: number): 0 | -1 {
  return index === (checkedIndex >= 0 ? checkedIndex : 0) ? 0 : -1
}

/**
 * Left/Up and Right/Down step through the group (wrapping); in a grid of `columns` Up/Down move a row instead (and stop at the
 * edges); Home/End jump. The target takes focus and is selected (clicked), like a native radio.
 */
export function rovingKeydown(e: KeyboardEvent, columns = 1) {
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
  const group = e.currentTarget as HTMLElement | null
  const from = (e.target as HTMLElement | null)?.closest<HTMLElement>('[role="radio"]') ?? (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[role="radio"]')
  if (!group || !from || !group.contains(from)) return
  const radios = Array.from(group.querySelectorAll<HTMLElement>('[role="radio"]')).filter((r) => !(r as HTMLButtonElement).disabled)
  const at = radios.indexOf(from)
  if (at < 0) return
  const last = radios.length - 1
  let to = -1
  switch (e.key) {
    case 'ArrowRight':
      to = at === last ? 0 : at + 1
      break
    case 'ArrowLeft':
      to = at === 0 ? last : at - 1
      break
    case 'ArrowDown':
      to = columns > 1 ? (at + columns <= last ? at + columns : at) : at === last ? 0 : at + 1
      break
    case 'ArrowUp':
      to = columns > 1 ? (at - columns >= 0 ? at - columns : at) : at === 0 ? last : at - 1
      break
    case 'Home':
      to = 0
      break
    case 'End':
      to = last
      break
    default:
      return
  }
  e.preventDefault()
  const target = radios[to]
  if (!target || target === from) return
  target.focus()
  target.click()
}
