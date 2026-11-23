import { Workflow } from 'lucide-vue-next'
import InfographicSection from '@/components/editor/inspector/element/InfographicSection.vue'
import type { BarContext, BarItem } from '../barItems'
import InfographicEditItems from '../controls/InfographicEditItems.vue'
import { framed } from '../panelFrame'

const InfographicPanel = framed(InfographicSection)

/** Edit items (item-based infographics) and a panel with the full Infographic section. */
export const infographicBar: BarItem[] = [
  { type: 'custom', id: 'infographic-edit-items', component: InfographicEditItems },
  { type: 'panel', id: 'infographic', label: 'editorCanvas.bar.labels.infographic', icon: Workflow, component: InfographicPanel, props: (c: BarContext) => ({ presentation: c.presentation }) },
]
