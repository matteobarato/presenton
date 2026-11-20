import { describe, expect, it } from 'vitest'
import { router } from '@/router'

describe('router', () => {
  it('resolves every named route', () => {
    expect(router.resolve({ name: 'login' }).path).toBe('/login')
    expect(router.resolve({ name: 'setup' }).path).toBe('/setup')
    expect(router.resolve({ name: 'library' }).path).toBe('/')
    expect(router.resolve({ name: 'new' }).path).toBe('/new')
    expect(router.resolve({ name: 'create', params: { id: 'x', step: 'avatar' } }).path).toBe('/p/x/create/avatar')
    expect(router.resolve({ name: 'create', params: { id: 'x' } }).path).toBe('/p/x/create')
    expect(router.resolve({ name: 'editor', params: { id: 'x' } }).path).toBe('/p/x')
    expect(router.resolve({ name: 'present', params: { id: 'x' } }).path).toBe('/p/x/present')
    expect(router.resolve({ name: 'templates' }).path).toBe('/templates')
    expect(router.resolve({ name: 'template', params: { id: 'x' } }).path).toBe('/templates/x')
    expect(router.resolve({ name: 'settings', params: { section: 'text' } }).path).toBe('/settings/text')
    expect(router.resolve('/nope/nothing').name).toBe('not-found')
  })

  it('marks login and setup public', () => {
    expect(router.resolve({ name: 'login' }).meta.public).toBe(true)
    expect(router.resolve({ name: 'setup' }).meta.public).toBe(true)
    expect(router.resolve({ name: 'library' }).meta.public).toBeFalsy()
  })

  it('assigns layouts', () => {
    for (const name of ['login', 'setup', 'present']) {
      expect(router.resolve({ name, params: { id: 'x' } }).meta.layout).toBe('bare')
    }
    for (const name of ['library', 'new', 'create', 'editor', 'templates', 'template', 'settings', 'not-found']) {
      expect(router.resolve({ name, params: { id: 'x', section: 'text' } }).meta.layout).toBe('app')
    }
  })

  it('old outline url redirects to create/outline keeping query', async () => {
    await router.push('/templates')
    await router.push('/new/abc/outline?template=modern&theme=t1')
    const r = router.currentRoute.value
    expect(r.name).toBe('create')
    expect(r.params).toEqual({ id: 'abc', step: 'outline' })
    expect(r.query).toEqual({ template: 'modern', theme: 't1' })
  })

  it('has no outline route any more', () => {
    expect(router.hasRoute('outline')).toBe(false)
  })

  it('redirects /settings and unknown sections to /settings/text', async () => {
    // beforeEnter runs on entering the record, so start each case from outside it.
    const visit = async (path: string) => {
      await router.push('/templates')
      await router.push(path)
      return router.currentRoute.value.fullPath
    }
    expect(await visit('/settings')).toBe('/settings/text')
    expect(await visit('/settings/images')).toBe('/settings/images')
    expect(await visit('/settings/bogus')).toBe('/settings/text')
    expect(await visit('/settings/web-search')).toBe('/settings/web-search')
  })
})
