import { api, unwrap } from './client'
import type { AsyncTask } from './types'

export type { AsyncTask }

export function getTask(id: string): Promise<AsyncTask> {
  return unwrap(api.GET('/api/v1/async-tasks/status/{id}', { params: { path: { id } } }))
}
