import { LayoutGrid } from 'lucide-vue-next'
import LayoutSection from '@/components/editor/inspector/element/LayoutSection.vue'
import type { BarContext, BarItem } from '../barItems'
import LayoutFill from '../controls/LayoutFill.vue'
import LayoutGap from '../controls/LayoutGap.vue'
import LayoutItems from '../controls/LayoutItems.vue'
import { framed } from '../panelFrame'

const LayoutPanel = framed(LayoutSection)
const presentationProps = (c: BarContext) => ({ presentation: c.presentation })

/**
 * Gap and add/remove item for flex and grid layouts, fill colour for containers, and a panel with the full Layout section.
 * (The Layout section has no direction control, so none is offered here.)
 */
export const layoutBar: BarItem[] = [
  { type: 'custom', id: 'layout-gap', component: LayoutGap, props: presentationProps },
  { type: 'custom', id: 'layout-items', component: LayoutItems, props: presentationProps },
  { type: 'custom', id: 'layout-fill', component: LayoutFill, props: presentationProps },
  { type: 'panel', id: 'layout', label: 'Layout', icon: LayoutGrid, component: LayoutPanel, props: presentationProps },
]
