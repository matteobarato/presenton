import type { App } from 'vue'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { ApiError } from './errors'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false
        return failureCount < 1
      },
    },
  },
})

export function installQuery(app: App): void {
  app.use(VueQueryPlugin, { queryClient })
}
