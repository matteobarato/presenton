import { defineAsyncComponent, type Component } from 'vue'
import type { InspectorTabId } from '@/stores/editor'
import { AudioLines, Palette, Plus, SquareMousePointer } from 'lucide-vue-next'

export interface InspectorTab {
  id: InspectorTabId
  label: string
  icon: Component
  component: Component
}

export const inspectorTabs: InspectorTab[] = [
  { id: 'element', label: 'Element', icon: SquareMousePointer, component: defineAsyncComponent(() => import('./element/ElementTab.vue')) },
  { id: 'insert', label: 'Insert', icon: Plus, component: defineAsyncComponent(() => import('./insert/InsertTab.vue')) },
  { id: 'design', label: 'Design', icon: Palette, component: defineAsyncComponent(() => import('./DesignTab.vue')) },
  { id: 'narration', label: 'Narration', icon: AudioLines, component: defineAsyncComponent(() => import('./NarrationTab.vue')) },
]
