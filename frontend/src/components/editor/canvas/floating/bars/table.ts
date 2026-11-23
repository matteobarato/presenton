import { Table2 } from 'lucide-vue-next'
import TableSection from '@/components/editor/inspector/element/TableSection.vue'
import type { BarContext, BarItem } from '../barItems'
import TableCellFill from '../controls/TableCellFill.vue'
import TableStructure from '../controls/TableStructure.vue'
import { framed } from '../panelFrame'

const TablePanel = framed(TableSection)
const presentationProps = (c: BarContext) => ({ presentation: c.presentation })

/** Row/column add and delete, cell fill, and a panel with the full Table section (move column, alignment, cell text styling). */
export const tableBar: BarItem[] = [
  { type: 'custom', id: 'table-structure', component: TableStructure, props: presentationProps },
  { type: 'custom', id: 'cell-fill', component: TableCellFill, props: presentationProps },
  { type: 'panel', id: 'table', label: 'editorCanvas.bar.labels.table', icon: Table2, component: TablePanel, props: presentationProps },
]
