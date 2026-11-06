import type { ProxyOptions } from 'vite'

/** Backend path prefixes that the dev server forwards to the FastAPI backend. */
const BACKEND_PREFIXES = ['/api', '/app_data', '/static', '/docs', '/openapi.json'] as const

/**
 * `changeOrigin: false` keeps the Host header equal to the page host so that
 * cookies set by the backend stay valid for the dev origin.
 */
export function proxyTargets(backendUrl: string): Record<string, ProxyOptions> {
  return Object.fromEntries(
    BACKEND_PREFIXES.map((prefix) => [prefix, { target: backendUrl, changeOrigin: false }]),
  )
}
