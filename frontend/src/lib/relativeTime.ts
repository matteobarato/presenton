const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
]

/** "3 days ago" style label via Intl.RelativeTimeFormat (no dependency). */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const time = Date.parse(iso)
  if (Number.isNaN(time)) return ''
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  const seconds = Math.round((time - now) / 1000)
  const abs = Math.abs(seconds)
  for (const [unit, size] of UNITS) {
    if (abs >= size) return rtf.format(Math.round(seconds / size), unit)
  }
  return rtf.format(0, 'second')
}
