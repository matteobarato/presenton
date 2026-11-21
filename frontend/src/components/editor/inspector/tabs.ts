import { defineAsyncComponent, type Component } from 'vue'
import type { InspectorTabId } from '@/stores/editor'
import { Clapperboard, Layers, Plus, UserRound } from 'lucide-vue-next'

export interface InspectorTab {
  id: InspectorTabId
  label: string
  icon: Component
  component: Component
}

export const inspectorTabs: InspectorTab[] = [
  { id: 'insert', label: 'Insert', icon: Plus, component: defineAsyncComponent(() => import('./insert/InsertTab.vue')) },
  { id: 'avatar', label: 'Avatar', icon: UserRound, component: defineAsyncComponent(() => import('./AvatarTab.vue')) },
  { id: 'motion', label: 'Motion', icon: Clapperboard, component: defineAsyncComponent(() => import('./MotionTab.vue')) },
  { id: 'layers', label: 'Layers', icon: Layers, component: defineAsyncComponent(() => import('./LayersTab.vue')) },
]
