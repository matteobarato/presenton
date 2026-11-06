import { proxyTargets } from '../../vite.proxy'

test('proxies every backend prefix to BACKEND_URL', () => {
  const t = proxyTargets('http://host.docker.internal:5001')
  expect(Object.keys(t).sort()).toEqual(['/api', '/app_data', '/docs', '/openapi.json', '/static'])
  for (const v of Object.values(t)) {
    expect(v.target).toBe('http://host.docker.internal:5001')
    expect(v.changeOrigin).toBe(false)
  }
})
