/// <reference types="vite/client" />

/** The dev server's BACKEND_URL, injected at build time by vite.config.ts. */
declare const __PRESENTON_BACKEND_URL__: string

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}
