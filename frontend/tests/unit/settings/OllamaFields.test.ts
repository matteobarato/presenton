import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import OllamaFields from '@/components/settings/OllamaFields.vue'
import { DEFAULT_OLLAMA_URL, LOCALHOST_OLLAMA_URL } from '@/settings/providers'
import type { OllamaLibraryModel, OllamaModelInfo, OllamaPullEvent } from '@/api/providerModels'
import type { ProviderConfig } from '@/settings/types'

const listReachableOllamaModels = vi.hoisted(() => vi.fn())
const listOllamaLibrary = vi.hoisted(() => vi.fn())
const pullOllamaModel = vi.hoisted(() => vi.fn())
const toastError = vi.hoisted(() => vi.fn())
const toastSuccess = vi.hoisted(() => vi.fn())
vi.mock('@/api/providerModels', () => ({ listReachableOllamaModels, listOllamaLibrary, pullOllamaModel }))
vi.mock('vue-sonner', () => ({ toast: { error: toastError, success: toastSuccess } }))

const INSTALLED: OllamaModelInfo[] = [
  { name: 'llama3:8b', parameters: '8B', size: 4.7 * 1024 ** 3 },
  { name: 'mistral:7b', parameters: '7B', size: null },
]
const LIBRARY: OllamaLibraryModel[] = [
  { name: 'llama3:8b', description: 'Llama 3', parameters: '8B', size: '4.7GB' },
  { name: 'gemma2:9b', description: 'Gemma 2', parameters: '9B', size: '5.4GB' },
  { name: 'phi3:3.8b', description: 'Phi 3', parameters: '3.8B', size: '2.2GB' },
]

let wrapper: VueWrapper | null = null
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})
beforeEach(() => {
  vi.resetAllMocks()
  listReachableOllamaModels.mockResolvedValue({ models: INSTALLED, resolvedUrl: DEFAULT_OLLAMA_URL, usedFallback: false })
  listOllamaLibrary.mockResolvedValue(LIBRARY)
})

function make(config: ProviderConfig = { OLLAMA_URL: DEFAULT_OLLAMA_URL }) {
  wrapper = mount(OllamaFields, { attachTo: document.body, props: { config } })
  return wrapper
}
const html = (w: VueWrapper) => w.element as HTMLElement
function button(w: VueWrapper, label: string) {
  return Array.from(html(w).querySelectorAll('button')).find((b) => (b.textContent ?? '').trim() === label || b.getAttribute('aria-label') === label)
}
async function click(w: VueWrapper, label: string) {
  const b = button(w, label)
  if (!b) throw new Error(`no button ${label}`)
  b.click()
  await flushPromises()
}
const urlInput = (w: VueWrapper) => html(w).querySelector<HTMLInputElement>('#ollama-url')!
const modelSelect = (w: VueWrapper) => html(w).querySelector<HTMLSelectElement>('#ollama-model')
const bar = (w: VueWrapper) => html(w).querySelector<HTMLElement>('[role="progressbar"]')

/** A pull that stays open until the test resolves it, so events can be fed in one by one. */
function controllablePull() {
  const handle: { emit: (e: OllamaPullEvent) => void; finish: () => void; signal?: AbortSignal; args?: unknown[] } = {
    emit: () => {},
    finish: () => {},
  }
  pullOllamaModel.mockImplementation(
    (name: string, url: string, onEvent: (e: OllamaPullEvent) => void, signal?: AbortSignal) =>
      new Promise<void>((resolve) => {
        handle.emit = onEvent
        handle.finish = resolve
        handle.signal = signal
        handle.args = [name, url]
        signal?.addEventListener('abort', () => resolve())
      }),
  )
  return handle
}

async function checked(config?: ProviderConfig) {
  const w = make(config)
  await click(w, 'Check models')
  return w
}

describe('OllamaFields', () => {
  it('renders the URL field and Check models without emitting anything', async () => {
    const w = make({ OLLAMA_URL: DEFAULT_OLLAMA_URL, OLLAMA_MODEL: 'llama3:8b' })
    await flushPromises()
    expect(urlInput(w).value).toBe(DEFAULT_OLLAMA_URL)
    expect(html(w).querySelector('label[for="ollama-url"]')?.textContent).toContain('Ollama URL')
    expect(button(w, 'Check models')).toBeTruthy()
    expect(modelSelect(w)).toBeNull()
    expect(w.emitted('set')).toBeUndefined()
  })

  it('does not emit when the config prop changes from outside', async () => {
    const w = make({ OLLAMA_URL: DEFAULT_OLLAMA_URL })
    await w.setProps({ config: { OLLAMA_URL: 'http://other:11434', OLLAMA_MODEL: 'x' } })
    await flushPromises()
    expect(w.emitted('set')).toBeUndefined()
  })

  it('editing the URL emits the URL and clears the model', async () => {
    const w = make()
    urlInput(w).value = 'http://my-ollama:11434'
    urlInput(w).dispatchEvent(new Event('input'))
    await flushPromises()
    expect(w.emitted('set')).toEqual([
      ['OLLAMA_URL', 'http://my-ollama:11434'],
      ['OLLAMA_MODEL', ''],
    ])
  })

  it('Check models uses the fallback URL, lists installed models and picks the first', async () => {
    listReachableOllamaModels.mockResolvedValue({ models: INSTALLED, resolvedUrl: LOCALHOST_OLLAMA_URL, usedFallback: true })
    const w = await checked()
    expect(listReachableOllamaModels).toHaveBeenCalledWith(DEFAULT_OLLAMA_URL)
    expect(listOllamaLibrary).toHaveBeenCalledTimes(1)
    expect(w.emitted('set')).toEqual([
      ['OLLAMA_URL', LOCALHOST_OLLAMA_URL],
      ['OLLAMA_MODEL', 'llama3:8b'],
    ])
    const options = Array.from(modelSelect(w)!.querySelectorAll('option')).map((o) => o.value)
    expect(options).toEqual(expect.arrayContaining(['llama3:8b', 'mistral:7b']))
    expect(toastSuccess).toHaveBeenCalled()
  })

  it('keeps a chosen model that is still installed', async () => {
    const w = await checked({ OLLAMA_URL: DEFAULT_OLLAMA_URL, OLLAMA_MODEL: 'mistral:7b' })
    expect(w.emitted('set')).toBeUndefined()
    expect(modelSelect(w)!.value).toBe('mistral:7b')
  })

  it('selecting an installed model emits it', async () => {
    const w = await checked()
    const select = modelSelect(w)!
    select.value = 'mistral:7b'
    select.dispatchEvent(new Event('change'))
    await flushPromises()
    expect(w.emitted('set')!.at(-1)).toEqual(['OLLAMA_MODEL', 'mistral:7b'])
  })

  it('offers a Pull button only for library models that are not installed', async () => {
    const w = await checked()
    expect(button(w, 'Pull gemma2:9b')).toBeTruthy()
    expect(button(w, 'Pull phi3:3.8b')).toBeTruthy()
    expect(button(w, 'Pull llama3:8b')).toBeUndefined()
  })

  it('a failed check toasts, shows the message and clears the model', async () => {
    listReachableOllamaModels.mockRejectedValue(new Error('connection refused'))
    const w = await checked({ OLLAMA_URL: 'http://x:1', OLLAMA_MODEL: 'llama3:8b' })
    expect(toastError).toHaveBeenCalledWith('Could not connect to Ollama', {
      description: 'connection refused. You can enter a model ID manually.',
    })
    expect(w.emitted('set')).toEqual([['OLLAMA_MODEL', '']])
    expect(modelSelect(w)).toBeNull()
  })

  it('a failed library fetch is treated as a failed check', async () => {
    listOllamaLibrary.mockRejectedValue(new Error('library down'))
    const w = await checked()
    expect(toastError).toHaveBeenCalledTimes(1)
    expect(w.emitted('set')).toEqual([['OLLAMA_MODEL', '']])
  })

  it('does not reset the results when the check itself rewrites the URL', async () => {
    listReachableOllamaModels.mockResolvedValue({ models: INSTALLED, resolvedUrl: LOCALHOST_OLLAMA_URL, usedFallback: true })
    const w = await checked()
    await w.setProps({ config: { OLLAMA_URL: LOCALHOST_OLLAMA_URL, OLLAMA_MODEL: 'llama3:8b' } })
    await flushPromises()
    expect(modelSelect(w)).not.toBeNull()
  })

  it('ignores a check that resolves after the URL changed', async () => {
    let resolve!: (v: unknown) => void
    listReachableOllamaModels.mockReturnValue(new Promise((r) => (resolve = r)))
    const w = make()
    await click(w, 'Check models')
    await w.setProps({ config: { OLLAMA_URL: 'http://elsewhere:11434' } })
    resolve({ models: INSTALLED, resolvedUrl: DEFAULT_OLLAMA_URL, usedFallback: false })
    await flushPromises()
    expect(w.emitted('set')).toBeUndefined()
    expect(modelSelect(w)).toBeNull()
    expect(button(w, 'Check models')!.disabled).toBe(false)
  })

  it('ignores a failed check that resolves after the URL changed', async () => {
    let reject!: (e: Error) => void
    listReachableOllamaModels.mockReturnValue(new Promise((_, r) => (reject = r)))
    const w = make()
    await click(w, 'Check models')
    await w.setProps({ config: { OLLAMA_URL: 'http://elsewhere:11434' } })
    reject(new Error('boom'))
    await flushPromises()
    expect(toastError).not.toHaveBeenCalled()
    expect(w.emitted('set')).toBeUndefined()
  })

  it('ignores a check that resolves after unmount', async () => {
    let resolve!: (v: unknown) => void
    listReachableOllamaModels.mockReturnValue(new Promise((r) => (resolve = r)))
    const w = make()
    await click(w, 'Check models')
    w.unmount()
    resolve({ models: INSTALLED, resolvedUrl: LOCALHOST_OLLAMA_URL, usedFallback: true })
    await flushPromises()
    expect(w.emitted('set')).toBeUndefined()
    expect(toastSuccess).not.toHaveBeenCalled()
  })

  describe('pulling', () => {
    it('passes the model and URL and streams progress into the bar', async () => {
      const pull = controllablePull()
      const w = await checked()
      await click(w, 'Pull gemma2:9b')
      expect(pull.args).toEqual(['gemma2:9b', DEFAULT_OLLAMA_URL])
      expect(bar(w)).toBeTruthy()

      pull.emit({ type: 'progress', status: 'downloading', progress: 42, completed: 42, total: 100 })
      await flushPromises()
      expect(bar(w)!.getAttribute('aria-valuenow')).toBe('42')
      expect(html(w).textContent).toContain('downloading')

      pull.emit({ type: 'progress', status: 'downloading', completed: 3, total: 4 })
      await flushPromises()
      expect(bar(w)!.getAttribute('aria-valuenow')).toBe('75')
    })

    it('disables other Pull buttons while a pull runs', async () => {
      controllablePull()
      const w = await checked()
      await click(w, 'Pull gemma2:9b')
      expect(button(w, 'Pull phi3:3.8b')!.disabled).toBe(true)
      expect(button(w, 'Check models')!.disabled).toBe(true)
    })

    it('re-checks and selects the pulled model on complete', async () => {
      const pull = controllablePull()
      const w = await checked({ OLLAMA_URL: DEFAULT_OLLAMA_URL, OLLAMA_MODEL: 'llama3:8b' })
      await click(w, 'Pull gemma2:9b')
      listReachableOllamaModels.mockResolvedValue({
        models: [...INSTALLED, { name: 'gemma2:9b', parameters: '9B', size: null }],
        resolvedUrl: DEFAULT_OLLAMA_URL,
        usedFallback: false,
      })
      pull.emit({ type: 'complete', model: 'gemma2:9b' })
      pull.finish()
      await flushPromises()
      expect(listReachableOllamaModels).toHaveBeenCalledTimes(2)
      expect(w.emitted('set')!.at(-1)).toEqual(['OLLAMA_MODEL', 'gemma2:9b'])
      expect(w.emitted('set')!.filter((e) => e[0] === 'OLLAMA_MODEL')).toHaveLength(1)
      expect(bar(w)).toBeNull()
      expect(html(w).textContent).toContain('gemma2:9b')
      expect(button(w, 'Pull gemma2:9b')).toBeUndefined()
    })

    it('Cancel aborts the signal and shows no error', async () => {
      const pull = controllablePull()
      const w = await checked()
      await click(w, 'Pull gemma2:9b')
      expect(pull.signal!.aborted).toBe(false)
      await click(w, 'Cancel')
      expect(pull.signal!.aborted).toBe(true)
      expect(bar(w)).toBeNull()
      expect(html(w).querySelector('[role="alert"]')).toBeNull()
      expect(toastError).not.toHaveBeenCalled()
      expect(button(w, 'Pull gemma2:9b')!.disabled).toBe(false)
    })

    it('Cancel also settles when the aborted pull rejects', async () => {
      pullOllamaModel.mockImplementation(
        (_n: string, _u: string, _e: unknown, signal: AbortSignal) =>
          new Promise<void>((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))),
      )
      const w = await checked()
      await click(w, 'Pull gemma2:9b')
      await click(w, 'Cancel')
      expect(bar(w)).toBeNull()
      expect(html(w).querySelector('[role="alert"]')).toBeNull()
      expect(html(w).textContent).toContain('cancelled')
      expect(toastError).not.toHaveBeenCalled()
    })

    it('an error event shows its detail and leaves the model unchanged', async () => {
      const pull = controllablePull()
      const w = await checked({ OLLAMA_URL: DEFAULT_OLLAMA_URL, OLLAMA_MODEL: 'llama3:8b' })
      await click(w, 'Pull gemma2:9b')
      pull.emit({ type: 'error', detail: 'disk full' })
      pull.finish()
      await flushPromises()
      expect(html(w).querySelector('[role="alert"]')?.textContent).toContain('disk full')
      expect(w.emitted('set')).toBeUndefined()
      expect(bar(w)).toBeNull()
    })

    it('shows an unexpected-end error when the stream ends without a terminal event', async () => {
      const pull = controllablePull()
      const w = await checked({ OLLAMA_URL: DEFAULT_OLLAMA_URL, OLLAMA_MODEL: 'llama3:8b' })
      await click(w, 'Pull gemma2:9b')
      pull.emit({ type: 'progress', progress: 10 })
      pull.finish()
      await flushPromises()
      expect(html(w).querySelector('[role="alert"]')?.textContent).toContain(
        'Pull ended unexpectedly. Check the model list and try again.',
      )
      expect(w.emitted('set')).toBeUndefined()
    })

    it('shows the thrown message when the pull rejects', async () => {
      pullOllamaModel.mockRejectedValue(new Error('network down'))
      const w = await checked({ OLLAMA_URL: DEFAULT_OLLAMA_URL, OLLAMA_MODEL: 'llama3:8b' })
      await click(w, 'Pull gemma2:9b')
      expect(html(w).querySelector('[role="alert"]')?.textContent).toContain('network down')
      expect(w.emitted('set')).toBeUndefined()
    })

    it('unmounting aborts an in-flight pull and ignores its late events', async () => {
      const pull = controllablePull()
      const w = await checked({ OLLAMA_URL: DEFAULT_OLLAMA_URL, OLLAMA_MODEL: 'llama3:8b' })
      await click(w, 'Pull gemma2:9b')
      w.unmount()
      expect(pull.signal!.aborted).toBe(true)
      pull.emit({ type: 'complete', model: 'gemma2:9b' })
      await flushPromises()
      expect(w.emitted('set')).toBeUndefined()
      expect(listReachableOllamaModels).toHaveBeenCalledTimes(1)
    })

    it('changing the URL aborts the pull and ignores its result', async () => {
      const pull = controllablePull()
      const w = await checked({ OLLAMA_URL: DEFAULT_OLLAMA_URL, OLLAMA_MODEL: 'llama3:8b' })
      await click(w, 'Pull gemma2:9b')
      await w.setProps({ config: { OLLAMA_URL: 'http://elsewhere:11434', OLLAMA_MODEL: '' } })
      expect(pull.signal!.aborted).toBe(true)
      pull.emit({ type: 'complete', model: 'gemma2:9b' })
      await flushPromises()
      expect(w.emitted('set')).toBeUndefined()
      expect(bar(w)).toBeNull()
    })
  })
})
