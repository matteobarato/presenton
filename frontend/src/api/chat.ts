import { api, unwrap } from './client'
import { streamEvents, type StreamEvent } from './sse'
import type { components } from './schema'

export type ChatConversation = components['schemas']['ChatConversationListItem']
export type ChatHistory = components['schemas']['ChatHistoryResponse']
export type ChatHistoryMessage = components['schemas']['ChatHistoryMessageItem']

export function listConversations(presentationId: string): Promise<ChatConversation[]> {
  return unwrap(
    api.GET('/api/v1/ppt/chat/conversations', { params: { query: { presentation_id: presentationId } } }),
  )
}

export function getHistory(presentationId: string, conversationId: string): Promise<ChatHistory> {
  return unwrap(
    api.GET('/api/v1/ppt/chat/history', {
      params: { query: { presentation_id: presentationId, conversation_id: conversationId } },
    }),
  )
}

export async function deleteConversation(presentationId: string, conversationId: string): Promise<void> {
  await unwrap(
    api.DELETE('/api/v1/ppt/chat/conversation', {
      params: { query: { presentation_id: presentationId, conversation_id: conversationId } },
    }),
  )
}

export interface ChatMessageBody {
  presentation_id: string
  message: string
  conversation_id?: string | null
}

/** POST the message and yield status/chunk/trace/complete/error events. */
export function streamMessage(body: ChatMessageBody, signal?: AbortSignal): AsyncGenerator<StreamEvent> {
  return streamEvents('/api/v1/ppt/chat/message/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ presentation_type: 'standard', ...body }),
    signal,
  })
}
