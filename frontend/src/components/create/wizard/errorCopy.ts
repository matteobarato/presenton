/**
 * Wizard error copy: what failed, the reason when the server gave one, and what to do. Keeps the server's wording
 * (it is the only place the real cause lives) but never lets it stand alone.
 */
export function describeError(what: string, e: unknown, next: string): string {
  const reason = e instanceof Error ? e.message.trim() : ''
  const base = reason && !reason.toLowerCase().startsWith(what.toLowerCase()) ? `${what}: ${reason.replace(/[.\s]+$/, '')}.` : `${what}.`
  return `${base} ${next}`
}
