import { defineAsyncComponent, type Component } from 'vue'
import type { InspectorTabId } from '@/stores/editor'
import { Clapperboard, Layers, Plus, UserRound } from 'lucide-vue-next'
import { i18n } from '@/i18n'

export interface InspectorTab {
  id: InspectorTabId
  /** Read at render time so the label follows the UI locale. */
  readonly label: string
  icon: Component
  component: Component
}

export const inspectorTabs: InspectorTab[] = [
  { id: 'insert', get label() { return i18n.global.t('editorInspector.tabs.insert') }, icon: Plus, component: defineAsyncComponent(() => import('./insert/InsertTab.vue')) },
  { id: 'avatar', get label() { return i18n.global.t('editorInspector.tabs.avatar') }, icon: UserRound, component: defineAsyncComponent(() => import('./AvatarTab.vue')) },
  { id: 'motion', get label() { return i18n.global.t('editorInspector.tabs.motion') }, icon: Clapperboard, component: defineAsyncComponent(() => import('./MotionTab.vue')) },
  { id: 'layers', get label() { return i18n.global.t('editorInspector.tabs.layers') }, icon: Layers, component: defineAsyncComponent(() => import('./LayersTab.vue')) },
]
