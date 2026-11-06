import { describe, expect, it } from 'vitest'
import { router } from '@/router'

describe('router', () => {
  it('resolves every named route', () => {
    expect(router.resolve({ name: 'login' }).path).toBe('/login')
    expect(router.resolve({ name: 'setup' }).path).toBe('/setup')
    expect(router.resolve({ name: 'library' }).path).toBe('/')
    expect(router.resolve({ name: 'new' }).path).toBe('/new')
    expect(router.resolve({ name: 'outline', params: { id: 'x' } }).path).toBe('/new/x/outline')
    expect(router.resolve({ name: 'editor', params: { id: 'x' } }).path).toBe('/p/x')
    expect(router.resolve({ name: 'present', params: { id: 'x' } }).path).toBe('/p/x/present')
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
    for (const name of ['library', 'new', 'outline', 'editor', 'not-found']) {
      expect(router.resolve({ name, params: { id: 'x' } }).meta.layout).toBe('app')
    }
  })
})
