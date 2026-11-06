import { describe, expect, it } from 'vitest'
import { ApiError, BackendUnreachableError, extractApiErrorMessage } from '@/api/errors'

describe('extractApiErrorMessage', () => {
  it('reads a string detail', () => {
    expect(extractApiErrorMessage({ detail: 'Nope' }, 'x')).toBe('Nope')
  })
  it('joins validation errors with their location', () => {
    const msg = extractApiErrorMessage({ detail: [{ loc: ['body', 'title'], msg: 'bad' }] }, 'x')
    expect(msg).toContain('bad')
    expect(msg).toContain('body.title')
  })
  it('falls back for empty bodies', () => {
    expect(extractApiErrorMessage('', 'fallback', 500)).toBe('fallback')
    expect(extractApiErrorMessage(null, 'fallback')).toBe('fallback')
  })
  it('reads message and nested error objects', () => {
    expect(extractApiErrorMessage({ message: 'm' }, 'x')).toBe('m')
    expect(extractApiErrorMessage({ error: { message: 'deep' } }, 'x')).toBe('deep')
    expect(extractApiErrorMessage({ detail: { detail: 'inner' } }, 'x')).toBe('inner')
  })
  it('maps provider auth failures to a friendly message', () => {
    expect(extractApiErrorMessage({ detail: 'Incorrect API key provided' }, 'x', 401)).toMatch(/Invalid API key/)
  })
  it('maps safety blocks', () => {
    expect(extractApiErrorMessage({ detail: 'moderation_blocked' }, 'x')).toMatch(/safety system/)
  })
  it('hides raw payloads and html', () => {
    expect(extractApiErrorMessage('<!DOCTYPE html><html>', 'fallback')).toBe('fallback')
    expect(extractApiErrorMessage({ detail: '{"error": 1}' }, 'fallback')).toBe('fallback')
  })
})

describe('error classes', () => {
  it('ApiError carries status and body', () => {
    const e = new ApiError('boom', 418, { a: 1 })
    expect(e).toBeInstanceOf(Error)
    expect(e.status).toBe(418)
    expect(e.body).toEqual({ a: 1 })
  })
  it('BackendUnreachableError is an Error', () => {
    expect(new BackendUnreachableError()).toBeInstanceOf(Error)
  })
})
