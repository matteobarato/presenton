import { Minus } from 'lucide-vue-next'
import LineSection from '@/components/editor/inspector/element/LineSection.vue'
import type { BarContext, BarItem } from '../barItems'
import LineColor from '../controls/LineColor.vue'
import LineWeight from '../controls/LineWeight.vue'
import { framed } from '../panelFrame'

const LinePanel = framed(LineSection)
const presentationProps = (c: BarContext) => ({ presentation: c.presentation })

/** Line colour and weight, and a panel with the full Line section (dash, line ends). */
export const lineBar: BarItem[] = [
  { type: 'custom', id: 'line-color', component: LineColor, props: presentationProps },
  { type: 'custom', id: 'line-weight', component: LineWeight, props: presentationProps },
  { type: 'panel', id: 'line', label: 'editorCanvas.bar.labels.line', icon: Minus, component: LinePanel, props: presentationProps },
]
