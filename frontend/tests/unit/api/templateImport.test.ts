import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  checkFonts,
  listImportTasks,
  prepareImport,
  readImportProgress,
  startImport,
} from '@/api/templateImport'
import type { AsyncTask } from '@/api/tasks'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** Normalises both call styles: openapi-fetch passes a Request, requestJson passes (path, init). */
async function sent(call: unknown[]): Promise<{ url: URL; method: string; body: unknown }> {
  const [input, init] = call as [RequestInfo | URL, RequestInit | undefined]
  if (input instanceof Request) {
    const text = await input.clone().text()
    return { url: new URL(input.url), method: input.method, body: text ? JSON.parse(text) : undefined }
  }
  return { url: new URL(String(input), 'http://localhost'), method: init?.method ?? 'GET', body: init?.body }
}

const pptx = () => new File(['pk'], 'deck.pptx')

describe('template import api', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('checkFonts returns unavailable fonts', async () => {
    fetchMock.mockResolvedValueOnce(json({ available_fonts: [], unavailable_fonts: [{ name: 'Gotham Bold' }] }))
    const file = pptx()
    expect(await checkFonts(file)).toEqual([{ name: 'Gotham Bold' }])
    const req = await sent(fetchMock.mock.calls[0])
    expect(req.method).toBe('POST')
    expect(req.url.pathname).toBe('/api/v1/ppt/fonts/check')
    expect(req.body).toBeInstanceOf(FormData)
    expect((req.body as FormData).get('pptx_file')).toBe(file)
  })

  it('checkFonts returns null on 403', async () => {
    fetchMock.mockResolvedValueOnce(json({ detail: 'Admin browser session required' }, 403))
    expect(await checkFonts(pptx())).toBeNull()
  })

  it('checkFonts throws on other errors', async () => {
    fetchMock.mockResolvedValueOnce(json({ detail: 'boom' }, 500))
    await expect(checkFonts(pptx())).rejects.toThrow('boom')
  })

  it('prepareImport sends pptx and fonts', async () => {
    const preview = { slide_image_urls: ['/1.png'], pptx_url: '/p.pptx', modified_pptx_url: '/m.pptx', fonts: {} }
    fetchMock.mockResolvedValueOnce(json(preview))
    const file = pptx()
    const a = new File(['a'], 'gotham-bold.ttf')
    const b = new File(['b'], 'gotham-book.otf')
    const result = await prepareImport(file, [
      { name: 'Gotham Bold', file: a },
      { name: 'Gotham Book', file: b },
    ])
    expect(result).toEqual(preview)
    const req = await sent(fetchMock.mock.calls[0])
    expect(req.url.pathname).toBe('/api/v1/ppt/template/fonts-upload-and-slides-preview')
    const form = req.body as FormData
    expect(form.get('pptx_file')).toBe(file)
    expect(form.getAll('font_files')).toEqual([a, b])
    expect(form.getAll('original_font_names')).toEqual(['Gotham Bold', 'Gotham Book'])
  })

  it('startImport posts the preview urls', async () => {
    fetchMock.mockResolvedValueOnce(json({ id: 't1', type: 'template.create', status: 'pending' }, 201))
    const task = await startImport(
      { slide_image_urls: ['/1.png'], pptx_url: '/p.pptx', modified_pptx_url: '/m.pptx', fonts: {} },
      { name: 'Deck', description: '  ' },
    )
    expect(task.id).toBe('t1')
    const req = await sent(fetchMock.mock.calls[0])
    expect(req.method).toBe('POST')
    expect(req.url.pathname).toBe('/api/v1/ppt/template/async')
    expect(req.body).toEqual({ pptx_url: '/m.pptx', slide_image_urls: ['/1.png'], fonts: {}, name: 'Deck', icon_type: 'bold' })
  })

  it('listImportTasks returns recent running and failed imports', async () => {
    const t = (id: string, status: string) => ({ id, type: 'template.create', status, created_at: '', updated_at: '' })
    fetchMock.mockResolvedValueOnce(json([t('a', 'pending'), t('b', 'completed'), t('c', 'error')]))
    const tasks = await listImportTasks(new Date('2026-11-26T12:00:00Z'))
    expect(tasks.map((x) => x.id)).toEqual(['a', 'c'])
    const req = await sent(fetchMock.mock.calls[0])
    expect(req.url.pathname).toBe('/api/v1/async-tasks')
    expect(req.url.searchParams.get('type')).toBe('template.create')
    expect(req.url.searchParams.get('status')).toBeNull()
    expect(req.url.searchParams.get('created_at_from')).toBe('2026-11-26T06:00:00.000Z')
  })

  it('readImportProgress parses task data', () => {
    const task = {
      id: 't1',
      data: {
        template_v2_id: 'tpl',
        name: 'Deck',
        thumbnail: '/1.png',
        created_layouts: 2,
        remaining_layouts: 3,
        slide_layout_statuses: [
          { index: 0, status: 'completed' },
          { index: 1, status: 'completed' },
          { index: 2, status: 'pending' },
          { index: 3, status: 'pending' },
          { index: 4, status: 'pending' },
        ],
      },
    } as unknown as AsyncTask
    expect(readImportProgress(task)).toEqual({
      templateId: 'tpl',
      name: 'Deck',
      thumbnail: '/1.png',
      done: 2,
      total: 5,
      slides: ['completed', 'completed', 'pending', 'pending', 'pending'],
    })
  })

  it('readImportProgress tolerates missing or garbage data', () => {
    const empty = { templateId: null, name: null, thumbnail: null, done: 0, total: 0, slides: [] }
    expect(readImportProgress(null)).toEqual(empty)
    expect(readImportProgress({ id: 'x', data: 'nope' } as unknown as AsyncTask)).toEqual(empty)
    expect(
      readImportProgress({ id: 'x', data: { created_layouts: 1, remaining_layouts: 1, slide_layout_statuses: 'bad' } } as unknown as AsyncTask),
    ).toEqual({ ...empty, done: 1, total: 2, slides: ['completed', 'pending'] })
  })
})
