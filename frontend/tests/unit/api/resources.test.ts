import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  deletePresentation,
  duplicatePresentation,
  getPresentation,
  listPresentations,
  presentationKeys,
  updatePresentation,
} from '@/api/presentations'
import { generateSpeakerNotes, updateSpeakerNotes } from '@/api/speakerNotes'
import { ApiError } from '@/api/errors'
import { deleteTemplate, listTemplates, renameTemplate } from '@/api/templates'
import { audioSrc, deleteTts, generateTtsAsync, getTtsStatus, slideAudioMetaUrl, ttsKeys } from '@/api/tts'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const fetchMock = vi.fn()
/** Normalise either (Request) or (url, init) call shapes. */
async function lastCall() {
  const [a, b] = fetchMock.mock.calls.at(-1)!
  if (a instanceof Request) {
    const text = await a.clone().text()
    return { url: new URL(a.url), method: a.method, body: text ? JSON.parse(text) : undefined }
  }
  return {
    url: new URL(a, 'http://localhost:3000'),
    method: (b?.method ?? 'GET') as string,
    body: b?.body ? JSON.parse(b.body) : undefined,
  }
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('presentations', () => {
  it('keys', () => {
    expect(presentationKeys.all).toEqual(['presentations'])
    expect(presentationKeys.one('a')).toEqual(['presentation', 'a'])
  })

  it('updatePresentation sends PATCH with the body unchanged', async () => {
    fetchMock.mockImplementation(async () => json({ id: 'p' }))
    const body = { id: 'p', title: 'T', n_slides: 3 }
    await updatePresentation(body)
    const c = await lastCall()
    expect(c.method).toBe('PATCH')
    expect(c.url.pathname).toBe('/api/v1/ppt/presentation/update')
    expect(c.body).toEqual(body)
  })

  it('list / get / duplicate / delete use the right endpoints', async () => {
    fetchMock.mockImplementation(async () => json([]))
    await listPresentations()
    expect((await lastCall()).url.pathname).toBe('/api/v1/ppt/presentation/all')
    fetchMock.mockImplementation(async () => json({ id: 'p' }))
    await getPresentation('p')
    expect((await lastCall()).url.pathname).toBe('/api/v1/ppt/presentation/p')
    await duplicatePresentation('p')
    expect(await lastCall()).toMatchObject({ method: 'POST' })
    fetchMock.mockImplementation(async () => new Response(null, { status: 204 }))
    await expect(deletePresentation('p')).resolves.toBeUndefined()
    expect(await lastCall()).toMatchObject({ method: 'DELETE' })
  })
})

describe('speaker notes', () => {
  it('updateSpeakerNotes sends PUT with {notes}', async () => {
    fetchMock.mockImplementation(async () => json({ id: 'p' }))
    await updateSpeakerNotes('p', [{ slide_index: 2, speaker_note: 'x' }])
    const c = await lastCall()
    expect(c.method).toBe('PUT')
    expect(c.url.pathname).toBe('/api/v1/ppt/presentation/p/speaker-notes')
    expect(c.body).toEqual({ notes: [{ slide_index: 2, speaker_note: 'x' }] })
  })
  it('updateSpeakerNotes rejects an empty list without calling the API', async () => {
    await expect(updateSpeakerNotes('p', [])).rejects.toThrow(/at least one/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('generateSpeakerNotes POSTs the options', async () => {
    fetchMock.mockImplementation(async () => json({ id: 'p' }))
    await generateSpeakerNotes('p', { regenerate: true, verbosity: 'low' })
    const c = await lastCall()
    expect(c.method).toBe('POST')
    expect(c.body).toEqual({ regenerate: true, verbosity: 'low' })
  })
})

describe('templates', () => {
  it('merges built-in and custom templates without duplicate ids', async () => {
    fetchMock.mockImplementation(async (input: Request | string) => {
      const url = input instanceof Request ? input.url : input
      if (url.includes('/api/templates')) {
        return json([
          { templateName: 'general', templateID: 'general', files: ['A.tsx', 'B.tsx'], settings: { description: 'd' } },
          { templateName: 'dup', templateID: 'c1', files: ['A.tsx'], settings: null },
        ])
      }
      return json({
        items: [
          { id: 'c1', name: 'Custom 1', layout_count: 2, is_default: false, description: 'cd' },
          { id: 'c2', name: 'Custom 2', layout_count: 0, is_default: false, description: null },
          { id: 'c3', name: 'Custom 3', layout_count: 1, is_default: true },
        ],
        total: 3,
        page: 1,
        page_size: 100,
      })
    })
    const list = await listTemplates()
    expect(list.map((t) => t.id)).toEqual(['general', 'c1', 'c2', 'c3'])
    expect(list[0]).toMatchObject({ name: 'general', layouts: ['A.tsx', 'B.tsx'], kind: 'builtin', description: 'd' })
    expect(list[1].kind).toBe('builtin')
    expect(list[2]).toMatchObject({ kind: 'custom', description: undefined })
    expect(list[3].kind).toBe('builtin')
  })
  it('renameTemplate sends PATCH with {name}', async () => {
    fetchMock.mockImplementation(async () => json({}))
    await renameTemplate('c1', 'New')
    const c = await lastCall()
    expect(c.method).toBe('PATCH')
    expect(c.url.pathname.endsWith('/api/v1/ppt/template/c1')).toBe(true)
    expect(c.body).toEqual({ name: 'New' })
  })
  it('deleteTemplate sends DELETE', async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 204 }))
    await deleteTemplate('c1')
    const c = await lastCall()
    expect(c.method).toBe('DELETE')
    expect(c.url.pathname.endsWith('/api/v1/ppt/template/c1')).toBe(true)
  })
  it('renameTemplate rejects with ApiError on 403', async () => {
    fetchMock.mockImplementation(async () => json({ detail: 'Built-in templates are read-only' }, 403))
    await expect(renameTemplate('c1', 'x')).rejects.toBeInstanceOf(ApiError)
  })
})

describe('tts', () => {
  it('slideAudioMetaUrl returns a same-origin path', () => {
    const u = slideAudioMetaUrl('p', 3, 'en')
    expect(u.startsWith('/')).toBe(true)
    expect(u).toContain('/p/')
    expect(u).toContain('/3')
    expect(u).toContain('language=en')
  })
  it('audioSrc yields a same-origin path', () => {
    expect(audioSrc({ url: 'http://backend:8000/app_data/audio/a.mp3' })).toBe('/app_data/audio/a.mp3')
    expect(audioSrc({ url: '/app_data/audio/b.mp3' })).toBe('/app_data/audio/b.mp3')
  })
  it('keys', () => expect(ttsKeys.status('p', 'en')).toEqual(['tts', 'p', 'en']))
  it('getTtsStatus passes the language', async () => {
    fetchMock.mockImplementation(async () => json({ audios: [] }))
    await getTtsStatus('p', 'en')
    const c = await lastCall()
    expect(c.url.pathname).toBe('/api/v1/ppt/presentation/p/speaker-notes/tts')
    expect(c.url.searchParams.get('language')).toBe('en')
  })
  it('generateTtsAsync POSTs to the async endpoint', async () => {
    fetchMock.mockImplementation(async () => json({ id: 't', status: 'pending' }))
    await generateTtsAsync('p', { language: 'en', regenerate: true })
    const c = await lastCall()
    expect(c.url.pathname).toBe('/api/v1/ppt/presentation/p/speaker-notes/tts/async')
    expect(c.body).toEqual({ language: 'en', regenerate: true })
  })
  it('deleteTts passes the optional language', async () => {
    fetchMock.mockImplementation(async () => json({}))
    await deleteTts('p', 'fr')
    const c = await lastCall()
    expect(c.method).toBe('DELETE')
    expect(c.url.searchParams.get('language')).toBe('fr')
  })
})
