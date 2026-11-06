import { createRouter, createWebHistory } from 'vue-router'

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
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/views/NotFoundView.vue'), meta: { layout: 'app' } },
  ],
})
