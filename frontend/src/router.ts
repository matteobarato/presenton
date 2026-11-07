import { createRouter, createWebHistory, type Router } from 'vue-router'
import { safeNext } from '@/lib/safe-next'
import { useSessionStore } from '@/stores/session'

declare module 'vue-router' {
  interface RouteMeta {
    public?: boolean
    layout?: 'app' | 'bare'
  }
}

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { public: true, layout: 'bare' } },
    { path: '/setup', name: 'setup', component: () => import('@/views/SetupView.vue'), meta: { public: true, layout: 'bare' } },
    { path: '/', name: 'library', component: () => import('@/views/LibraryView.vue'), meta: { layout: 'app' } },
    { path: '/new', name: 'new', component: () => import('@/views/NewView.vue'), meta: { layout: 'app' } },
    { path: '/new/:id/outline', name: 'outline', component: () => import('@/views/OutlineView.vue'), meta: { layout: 'app' } },
    { path: '/p/:id', name: 'editor', component: () => import('@/views/EditorView.vue'), meta: { layout: 'app' } },
    { path: '/p/:id/present', name: 'present', component: () => import('@/views/PresentView.vue'), meta: { layout: 'bare' } },
    { path: '/templates', name: 'templates', component: () => import('@/views/TemplatesView.vue'), meta: { layout: 'app' } },
    { path: '/templates/:id', name: 'template', component: () => import('@/views/TemplateDetailView.vue'), meta: { layout: 'app' } },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/views/NotFoundView.vue'), meta: { layout: 'app' } },
  ],
})

export function installGuards(r: Router): void {
  r.beforeEach(async (to) => {
    const session = useSessionStore()
    await session.load()
    // Backend unreachable: status unknown. Let navigation proceed, the banner explains.
    if (!session.ready) return true

    if (!to.meta.public) {
      if (session.setupRequired) return { name: 'setup' }
      if (!session.user) return { name: 'login', query: { next: to.fullPath } }
      return true
    }
    if (session.setupRequired) return to.name === 'setup' ? true : { name: 'setup' }
    if (to.name === 'setup' && !session.user) return { name: 'login' }
    if (session.user) return safeNext(to.query.next)
    return true
  })
}

/** 401 from any API call: forget the user and send them to sign in, returning here after. */
export function installUnauthorizedRedirect(r: Router): () => void {
  return () => {
    useSessionStore().clearUser()
    const current = r.currentRoute.value
    if (current.meta.public) return
    void r.push({ name: 'login', query: { next: current.fullPath } })
  }
}
