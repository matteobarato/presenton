import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { ApiError } from '@/api/errors'

const mocks = vi.hoisted(() => ({
  checkFonts: vi.fn(),
  prepareImport: vi.fn(),
  startImport: vi.fn(),
  retryImport: vi.fn(),
  getTask: vi.fn(),
}))
vi.mock('@/api/templateImport', async (orig) => ({
  ...(await orig<typeof import('@/api/templateImport')>()),
  checkFonts: mocks.checkFonts,
  prepareImport: mocks.prepareImport,
  startImport: mocks.startImport,
  retryImport: mocks.retryImport,
}))
vi.mock('@/api/tasks', () => ({ getTask: mocks.getTask }))

import { MAX_PPTX_BYTES } from '@/api/templateImport'
import { IMPORT_TASK_STORAGE_KEY, useTemplateImport } from '@/composables/useTemplateImport'

const preview = { slide_image_urls: ['/1.png', '/2.png'], pptx_url: '/p.pptx', modified_pptx_url: '/m.pptx', fonts: {} }
const task = (status: string, data: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
  id: 't1', type: 'template.create', status, data, ...extra,
})
const pptx = (name = 'Quarterly Review.pptx') => new File(['pk'], name)

function setup(opts?: Parameters<typeof useTemplateImport>[0]) {
  const scope = effectScope()
  const imp = scope.run(() => useTemplateImport(opts))!
  return { imp, stop: () => scope.stop() }
}

describe('useTemplateImport', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    sessionStorage.clear()
    Object.values(mocks).forEach((m) => m.mockReset())
  })
  afterEach(() => vi.useRealTimers())

  it('rejects non-pptx and oversize', async () => {
    const { imp, stop } = setup()
    await imp.selectFile(new File([''], 'a.key'))
    expect(imp.step.value).toBe('upload')
    expect(imp.error.value).toBeTruthy()
    const big = pptx()
    Object.defineProperty(big, 'size', { value: MAX_PPTX_BYTES + 1 })
    imp.error.value = null
    await imp.selectFile(big)
    expect(imp.step.value).toBe('upload')
    expect(imp.error.value).toBeTruthy()
    expect(mocks.checkFonts).not.toHaveBeenCalled()
    stop()
  })

  it('goes to fonts when fonts are missing', async () => {
    mocks.checkFonts.mockResolvedValue([{ name: 'Gotham Bold' }])
    const { imp, stop } = setup()
    await imp.selectFile(pptx())
    expect(imp.step.value).toBe('fonts')
    expect(imp.missingFonts.value).toHaveLength(1)
    expect(imp.name.value).toBe('Quarterly Review')
    expect(mocks.prepareImport).not.toHaveBeenCalled()
    stop()
  })

  it('skips fonts on 403', async () => {
    mocks.checkFonts.mockResolvedValue(null)
    mocks.prepareImport.mockResolvedValue(preview)
    const { imp, stop } = setup()
    const file = pptx()
    await imp.selectFile(file)
    expect(mocks.prepareImport).toHaveBeenCalledWith(file, [])
    expect(imp.step.value).toBe('review')
    expect(imp.preview.value).toEqual(preview)
    stop()
  })

  it('returns to upload with a message when preparing fails', async () => {
    mocks.checkFonts.mockResolvedValue([])
    mocks.prepareImport.mockRejectedValue(new ApiError('Corrupt file', 400))
    const { imp, stop } = setup()
    await imp.selectFile(pptx())
    expect(imp.step.value).toBe('upload')
    expect(imp.error.value).toContain('Corrupt file')
    stop()
  })

  it('passes replacements to prepare', async () => {
    mocks.checkFonts.mockResolvedValue([{ name: 'Gotham Bold' }])
    mocks.prepareImport.mockResolvedValue(preview)
    const { imp, stop } = setup()
    const file = pptx()
    await imp.selectFile(file)
    expect(imp.setReplacement('X', new File([''], 'x.exe'))).toBeTruthy()
    expect(imp.replacements.value).toEqual({})
    const font = new File(['f'], 'gotham.ttf')
    expect(imp.setReplacement('Gotham Bold', font)).toBeNull()
    await imp.continueFromFonts()
    expect(mocks.prepareImport).toHaveBeenCalledWith(file, [{ name: 'Gotham Bold', file: font }])
    expect(imp.step.value).toBe('review')
    stop()
  })

  it('create starts the task and finishes', async () => {
    mocks.checkFonts.mockResolvedValue([])
    mocks.prepareImport.mockResolvedValue(preview)
    mocks.startImport.mockResolvedValue(task('pending'))
    mocks.getTask
      .mockResolvedValueOnce(task('pending', { created_layouts: 1, remaining_layouts: 1 }))
      .mockResolvedValueOnce(task('completed', { template_v2_id: 'tpl', created_layouts: 2, remaining_layouts: 0 }))
    const onDone = vi.fn()
    const { imp, stop } = setup({ onDone })
    await imp.selectFile(pptx())
    imp.name.value = '  Brand  '
    await imp.create()
    expect(mocks.startImport).toHaveBeenCalledWith(preview, { name: 'Brand', description: '' })
    expect(imp.step.value).toBe('generating')
    expect(sessionStorage.getItem(IMPORT_TASK_STORAGE_KEY)).toBe('t1')
    await vi.advanceTimersByTimeAsync(0)
    expect(imp.progress.value).toMatchObject({ done: 1, total: 2 })
    await vi.advanceTimersByTimeAsync(1000)
    expect(imp.step.value).toBe('done')
    expect(onDone).toHaveBeenCalledWith('tpl')
    expect(sessionStorage.getItem(IMPORT_TASK_STORAGE_KEY)).toBeNull()
    stop()
  })

  it('does not start without a name', async () => {
    mocks.checkFonts.mockResolvedValue([])
    mocks.prepareImport.mockResolvedValue(preview)
    const { imp, stop } = setup()
    await imp.selectFile(pptx())
    imp.name.value = '   '
    await imp.create()
    expect(mocks.startImport).not.toHaveBeenCalled()
    expect(imp.step.value).toBe('review')
    stop()
  })

  it('shows an error when the server returns no task id', async () => {
    mocks.checkFonts.mockResolvedValue([])
    mocks.prepareImport.mockResolvedValue(preview)
    mocks.startImport.mockResolvedValue({ type: 'template.create', status: 'pending' })
    const { imp, stop } = setup()
    await imp.selectFile(pptx())
    await imp.create()
    expect(imp.step.value).toBe('review')
    expect(imp.error.value).toBeTruthy()
    stop()
  })

  it('task error shows retry', async () => {
    sessionStorage.setItem(IMPORT_TASK_STORAGE_KEY, 't1')
    mocks.getTask.mockResolvedValue(task('error', {}, { error: { detail: 'LLM down' } }))
    const { imp, stop } = setup()
    await vi.advanceTimersByTimeAsync(0)
    expect(imp.step.value).toBe('error')
    expect(imp.taskError.value).toContain('LLM down')
    stop()
  })

  it('retry restarts polling', async () => {
    sessionStorage.setItem(IMPORT_TASK_STORAGE_KEY, 't1')
    mocks.getTask.mockResolvedValueOnce(task('error', {}, { error: { detail: 'LLM down' } }))
    mocks.retryImport.mockResolvedValue(task('pending'))
    const { imp, stop } = setup()
    await vi.advanceTimersByTimeAsync(0)
    expect(imp.step.value).toBe('error')
    mocks.getTask.mockResolvedValue(task('pending'))
    await imp.retry()
    expect(mocks.retryImport).toHaveBeenCalledWith('t1')
    expect(imp.step.value).toBe('generating')
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.getTask).toHaveBeenCalledTimes(2)
    expect(imp.step.value).toBe('generating')
    stop()
  })

  it('remembers slide images for resume', async () => {
    mocks.checkFonts.mockResolvedValue([])
    mocks.prepareImport.mockResolvedValue(preview)
    mocks.startImport.mockResolvedValue(task('pending'))
    mocks.getTask.mockResolvedValue(task('pending'))
    const first = setup()
    await first.imp.selectFile(pptx())
    await first.imp.create()
    expect(first.imp.slideImages.value).toEqual(['/1.png', '/2.png'])
    first.stop()
    const again = setup()
    expect(again.imp.slideImages.value).toEqual(['/1.png', '/2.png'])
    again.imp.reset()
    expect(again.imp.slideImages.value).toEqual([])
    again.stop()
    expect(setup().imp.slideImages.value).toEqual([])
  })

  it('ignores remembered slides of a different task', async () => {
    mocks.checkFonts.mockResolvedValue([])
    mocks.prepareImport.mockResolvedValue(preview)
    mocks.startImport.mockResolvedValue(task('pending'))
    mocks.getTask.mockResolvedValue(task('pending'))
    const first = setup()
    await first.imp.selectFile(pptx())
    await first.imp.create()
    first.stop()
    expect(setup({ initialTaskId: 'other' }).imp.slideImages.value).toEqual([])
  })

  it('resumes from storage', async () => {
    sessionStorage.setItem(IMPORT_TASK_STORAGE_KEY, 't9')
    mocks.getTask.mockResolvedValue(task('pending'))
    const { imp, stop } = setup()
    expect(imp.step.value).toBe('generating')
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.getTask).toHaveBeenCalledWith('t9')
    stop()
  })

  it('adopts task from query', async () => {
    sessionStorage.setItem(IMPORT_TASK_STORAGE_KEY, 't9')
    mocks.getTask.mockResolvedValue(task('pending'))
    const { imp, stop } = setup({ initialTaskId: 't7' })
    expect(imp.step.value).toBe('generating')
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.getTask).toHaveBeenCalledWith('t7')
    expect(mocks.getTask).not.toHaveBeenCalledWith('t9')
    stop()
  })

  it('goes back to upload when the task no longer exists', async () => {
    sessionStorage.setItem(IMPORT_TASK_STORAGE_KEY, 'gone')
    mocks.getTask.mockRejectedValue(new ApiError('No async task found', 404))
    const { imp, stop } = setup()
    await vi.advanceTimersByTimeAsync(0)
    expect(imp.step.value).toBe('upload')
    stop()
  })

  it('reset clears everything', async () => {
    mocks.checkFonts.mockResolvedValue([])
    mocks.prepareImport.mockResolvedValue(preview)
    mocks.startImport.mockResolvedValue(task('pending'))
    mocks.getTask.mockResolvedValue(task('pending'))
    const { imp, stop } = setup()
    await imp.selectFile(pptx())
    await imp.create()
    imp.reset()
    expect(imp.step.value).toBe('upload')
    expect(sessionStorage.getItem(IMPORT_TASK_STORAGE_KEY)).toBeNull()
    expect(imp.file.value).toBeNull()
    expect(imp.preview.value).toBeNull()
    expect(imp.name.value).toBe('')
    stop()
  })
})
