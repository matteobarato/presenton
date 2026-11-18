import { defineAsyncComponent, type Component } from 'vue'
import type { InspectorTabId } from '@/stores/editor'
import { Layers, Palette, Plus } from 'lucide-vue-next'

export interface InspectorTab {
  id: InspectorTabId
  label: string
  icon: Component
  component: Component
}

export const inspectorTabs: InspectorTab[] = [
  { id: 'layers', label: 'Layers', icon: Layers, component: defineAsyncComponent(() => import('./LayersTab.vue')) },
  { id: 'insert', label: 'Insert', icon: Plus, component: defineAsyncComponent(() => import('./insert/InsertTab.vue')) },
  { id: 'design', label: 'Design', icon: Palette, component: defineAsyncComponent(() => import('./DesignTab.vue')) },
]
