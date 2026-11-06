import { onScopeDispose, ref, watch, type Ref } from 'vue'
import {
  deleteConversation as apiDeleteConversation,
  getHistory,
  listConversations,
  streamMessage,
  type ChatConversation,
} from '@/api/chat'
import { presentationKeys } from '@/api/presentations'
import { queryClient } from '@/api/query'

export interface ChatMsg {
  id: string
  role: 'user' | 'assistant' | 'error'
  content: string
  /** The user pressed stop before the reply finished. */
  stopped?: boolean
}

export interface ChatActivity {
  id: string
  label: string
  state: 'running' | 'success' | 'error' | 'info'
  tool?: string
  round?: number
}

/** Tools whose success changes the deck (same set as the old chat). */
export const MUTATING_TOOLS = new Set([
  'addOutline', 'updateOutline', 'deleteOutline', 'addNewSlide', 'addNewSlideLayout', 'saveSlide',
  'updateSlide', 'deleteSlide', 'addElement', 'updateElement', 'deleteElement', 'addComponent',
  'createComponent', 'updateComponent', 'deleteComponent', 'setPresentationTheme',
])

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e))

const MAX_MESSAGE_LENGTH = 8000 // ChatMessageRequest.message max_length

/** Prefix the request with the selected-slide context (old wording); user text is trimmed, never the context. */
export function withSlideContext(text: string, slideIndex?: number | null): string {
  if (typeof slideIndex !== 'number' || slideIndex < 0) return text.slice(0, MAX_MESSAGE_LENGTH)
  const context = `UI context: the currently selected slide is slide ${slideIndex + 1} (zero-based index ${slideIndex}).\n\n`
  return context + text.slice(0, Math.max(0, MAX_MESSAGE_LENGTH - context.length))
}

/** History stores the wire text; show only what the user typed. */
function stripSlideContext(raw: string): string {
  if (!raw.startsWith('UI context:')) return raw
  const i = raw.indexOf('\n\n')
  return i === -1 ? raw : raw.slice(i + 2)
}

let counter = 0
const nextId = () => `chat-${Date.now()}-${counter++}`

function toolLabel(tool: string | undefined, done: boolean): string {
  switch (tool) {
    case 'searchSlide':
      return done ? 'Found the relevant content.' : 'Looking through the content.'
    case 'getSlideAtIndex':
      return done ? 'Checked the slide.' : 'Checking the slide.'
    case 'deleteSlide':
    case 'deleteElement':
    case 'deleteComponent':
      return done ? 'Removed the selected item.' : 'Removing the selected item.'
    case 'generateAssets':
      return done ? 'Prepared the visual assets.' : 'Preparing visual assets.'
    case 'setPresentationTheme':
      return done ? 'Updated the theme.' : 'Updating the theme.'
    default:
      if (tool && MUTATING_TOOLS.has(tool)) return done ? 'Applied the change.' : 'Applying the change.'
      return done ? 'Finished that step.' : 'Working on it.'
  }
}

/** Turn a backend trace payload into an activity row (null when there is nothing to show). */
export function traceToActivity(trace: unknown): Omit<ChatActivity, 'id'> | null {
  if (!trace || typeof trace !== 'object') return null
  const t = trace as Record<string, unknown>
  const tool = typeof t.tool === 'string' ? t.tool : undefined
  const round = typeof t.round === 'number' ? t.round : undefined
  const status = typeof t.status === 'string' ? t.status : undefined
  const state: ChatActivity['state'] =
    status === 'error' ? 'error' : status === 'success' ? 'success' : status === 'ready' || status === 'info' ? 'info' : 'running'
  if (typeof t.message === 'string' && t.message.trim()) return { label: t.message.trim(), state, tool, round }
  if (tool && (status === 'start' || status === 'success')) {
    return { label: toolLabel(tool, status === 'success'), state, tool, round }
  }
  if (tool && status === 'error') return { label: 'I could not finish that step.', state: 'error', tool, round }
  return null
}

export function useChat(presentationId: Ref<string>) {
  const messages = ref<ChatMsg[]>([])
  const activity = ref<ChatActivity[]>([])
  const status = ref('')
  const sending = ref(false)
  const loading = ref(false)
  const conversationId = ref<string | null>(null)
  const conversations = ref<ChatConversation[]>([])
  let controller: AbortController | null = null
  // Bumped whenever the visible conversation changes so stale loads are dropped.
  let epoch = 0

  async function refreshConversations() {
    const id = presentationId.value
    if (!id) return
    try {
      const list = await listConversations(id)
      if (id === presentationId.value) {
        conversations.value = [...list].sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))
      }
    } catch {
      /* the menu simply stays empty */
    }
  }

  async function openConversation(convId: string) {
    const mine = ++epoch
    loading.value = true
    try {
      const history = await getHistory(presentationId.value, convId)
      if (mine !== epoch) return
      conversationId.value = convId
      activity.value = []
      messages.value = history.messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ id: nextId(), role: m.role as 'user' | 'assistant', content: m.role === 'user' ? stripSlideContext(m.content) : m.content }))
    } catch (e) {
      if (mine === epoch) messages.value = [{ id: nextId(), role: 'error', content: errorMessage(e) }]
    } finally {
      if (mine === epoch) loading.value = false
    }
  }

  /** Load the conversation list and open the most recent one. */
  async function loadHistory() {
    stop()
    const mine = ++epoch
    messages.value = []
    activity.value = []
    conversationId.value = null
    await refreshConversations()
    if (mine !== epoch) return
    const latest = conversations.value[0]
    if (latest) await openConversation(latest.conversation_id)
  }

  function stop() {
    controller?.abort()
  }

  function newConversation() {
    stop()
    epoch++
    conversationId.value = null
    messages.value = []
    activity.value = []
    status.value = ''
  }

  async function deleteConversation(convId: string) {
    await apiDeleteConversation(presentationId.value, convId)
    conversations.value = conversations.value.filter((c) => c.conversation_id !== convId)
    if (conversationId.value === convId) newConversation()
  }

  function pushActivity(row: Omit<ChatActivity, 'id'>) {
    if (row.state !== 'running') {
      const open = [...activity.value]
        .reverse()
        .find((a) => a.state === 'running' && a.tool && a.tool === row.tool && a.round === row.round)
      if (open) {
        Object.assign(open, row)
        return
      }
    }
    activity.value.push({ id: nextId(), ...row })
  }

  async function send(text: string, options: { slideIndex?: number | null } = {}) {
    const message = text.trim()
    if (!message || sending.value) return
    messages.value.push({ id: nextId(), role: 'user', content: message })
    const wire = withSlideContext(message, options.slideIndex)
    let mutated = false
    activity.value = []
    status.value = ''
    sending.value = true
    controller = new AbortController()
    const { signal } = controller
    const mine = epoch
    let assistant: ChatMsg | null = null
    const ensureAssistant = () => {
      if (!assistant) {
        messages.value.push({ id: nextId(), role: 'assistant', content: '' })
        assistant = messages.value[messages.value.length - 1]
      }
      return assistant
    }
    try {
      for await (const event of streamMessage(
        { presentation_id: presentationId.value, message: wire, conversation_id: conversationId.value },
        signal,
      )) {
        if (mine !== epoch) return
        if (event.type === 'chunk' && typeof event.chunk === 'string') {
          ensureAssistant().content += event.chunk
        } else if (event.type === 'status' && typeof event.status === 'string') {
          status.value = event.status
        } else if (event.type === 'trace') {
          const t = event.trace as { tool?: unknown; status?: unknown } | null
          if (t && typeof t.tool === 'string' && t.status === 'success' && MUTATING_TOOLS.has(t.tool)) mutated = true
          const row = traceToActivity(event.trace)
          if (row) pushActivity(row)
        } else if (event.type === 'error') {
          messages.value.push({ id: nextId(), role: 'error', content: String(event.detail ?? 'Something went wrong') })
          return
        } else if (event.type === 'complete') {
          const turn = (event.chat ?? {}) as { conversation_id?: string; response?: string; tool_calls?: string[] }
          if (turn.conversation_id) conversationId.value = turn.conversation_id
          if (turn.response) ensureAssistant().content = turn.response
          if (turn.tool_calls?.some((tool) => MUTATING_TOOLS.has(tool))) mutated = true
          void refreshConversations()
        }
      }
    } catch (e) {
      if (signal.aborted) {
        if (assistant) (assistant as ChatMsg).stopped = true
      } else {
        messages.value.push({ id: nextId(), role: 'error', content: errorMessage(e) })
      }
    } finally {
      // Also after a stop or error: a mutating tool may already have changed the deck.
      if (mutated) void queryClient.invalidateQueries({ queryKey: presentationKeys.one(presentationId.value) })
      if (signal.aborted && assistant) (assistant as ChatMsg).stopped = true
      if (controller?.signal === signal) {
        controller = null
        sending.value = false
        status.value = ''
      }
    }
  }

  watch(presentationId, () => void loadHistory())
  onScopeDispose(() => controller?.abort())

  return {
    messages, activity, status, sending, loading, conversationId, conversations,
    send, stop, newConversation, loadHistory, openConversation, deleteConversation,
  }
}
