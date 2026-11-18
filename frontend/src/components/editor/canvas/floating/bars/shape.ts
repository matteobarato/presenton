import { Square } from 'lucide-vue-next'
import ShapeSection from '@/components/editor/inspector/element/ShapeSection.vue'
import type { BarContext, BarItem } from '../barItems'
import ShapeFill from '../controls/ShapeFill.vue'
import ShapeStroke from '../controls/ShapeStroke.vue'
import { framed } from '../panelFrame'

const ShapePanel = framed(ShapeSection)
const presentationProps = (c: BarContext) => ({ presentation: c.presentation })

/** Fill and stroke colour, and a panel with the full Shape section (opacity, width, dash, corners, curve). */
export const shapeBar: BarItem[] = [
  { type: 'custom', id: 'fill-color', component: ShapeFill, props: presentationProps },
  { type: 'custom', id: 'stroke-color', component: ShapeStroke, props: presentationProps },
  { type: 'panel', id: 'shape', label: 'Shape', icon: Square, component: ShapePanel, props: presentationProps },
]
