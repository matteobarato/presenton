import { i18n } from '@/i18n'

type Unit = 'year' | 'month' | 'week' | 'day' | 'hour' | 'minute'

const UNITS: [Unit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
]

/** Units that read as "last year" / "yesterday" at a magnitude of one. */
const WORDED_UNITS: Unit[] = ['year', 'month', 'week', 'day']

function format(unit: Unit, amount: number): string {
  const magnitude = Math.abs(amount)
  const direction = amount < 0 ? 'past' : 'future'
  if (magnitude === 1 && WORDED_UNITS.includes(unit)) {
    return i18n.global.t(`misc.relativeTime.auto.${unit}.${direction}`)
  }
  const num = new Intl.NumberFormat(document.documentElement.lang || undefined).format(magnitude)
  return i18n.global.t(`misc.relativeTime.${direction}.${unit}`, { num, count: magnitude }, magnitude)
}

/** "3 days ago" / "in 3 days" style label, in the current UI locale. */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const time = Date.parse(iso)
  if (Number.isNaN(time)) return ''
  const seconds = Math.round((time - now) / 1000)
  const abs = Math.abs(seconds)
  for (const [unit, size] of UNITS) {
    if (abs >= size) return format(unit, Math.round(seconds / size))
  }
  return i18n.global.t('misc.relativeTime.now')
}
