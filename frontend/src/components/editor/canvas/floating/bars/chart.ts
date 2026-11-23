import { ChartColumn } from 'lucide-vue-next'
import ChartSection from '@/components/editor/inspector/element/ChartSection.vue'
import type { BarContext, BarItem } from '../barItems'
import ChartEditData from '../controls/ChartEditData.vue'
import ChartType from '../controls/ChartType.vue'
import { framed } from '../panelFrame'

const ChartPanel = framed(ChartSection)

/** Chart type, Edit data, and a panel with the full Chart section. */
export const chartBar: BarItem[] = [
  { type: 'custom', id: 'chart-type', component: ChartType },
  { type: 'custom', id: 'chart-edit-data', component: ChartEditData },
  { type: 'panel', id: 'chart', label: 'editorCanvas.bar.labels.chart', icon: ChartColumn, component: ChartPanel, props: (c: BarContext) => ({ presentation: c.presentation }) },
]
