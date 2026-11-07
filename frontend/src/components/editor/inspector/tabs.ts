import { defineAsyncComponent, type Component } from 'vue'
import type { InspectorTabId } from '@/stores/editor'
import { AudioLines, Palette } from 'lucide-vue-next'

export interface InspectorTab {
  id: InspectorTabId
  label: string
  icon: Component
  component: Component
}

export const inspectorTabs: InspectorTab[] = [
  { id: 'design', label: 'Design', icon: Palette, component: defineAsyncComponent(() => import('./DesignTab.vue')) },
  { id: 'narration', label: 'Narration', icon: AudioLines, component: defineAsyncComponent(() => import('./NarrationTab.vue')) },
]
