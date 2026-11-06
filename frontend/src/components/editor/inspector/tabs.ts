import { defineAsyncComponent, type Component } from 'vue'
import type { InspectorTabId } from '@/stores/editor'
import { AudioLines, Download, MessageSquare, Palette } from 'lucide-vue-next'

export interface InspectorTab {
  id: InspectorTabId
  label: string
  icon: Component
  component: Component
}

export const inspectorTabs: InspectorTab[] = [
  { id: 'design', label: 'Design', icon: Palette, component: defineAsyncComponent(() => import('./DesignTab.vue')) },
  { id: 'chat', label: 'Chat', icon: MessageSquare, component: defineAsyncComponent(() => import('./ChatTab.vue')) },
  { id: 'narration', label: 'Narration', icon: AudioLines, component: defineAsyncComponent(() => import('./NarrationTab.vue')) },
  { id: 'export', label: 'Export', icon: Download, component: defineAsyncComponent(() => import('./ExportTab.vue')) },
]
