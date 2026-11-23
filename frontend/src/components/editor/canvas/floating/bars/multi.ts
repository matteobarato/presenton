import { Group } from 'lucide-vue-next'
import { groupSelected } from '@/components/editor/inspector/element/groupAction'
import type { BarContext, BarItem } from '../barItems'

// Structural tools wait while text is being typed and on a locked deck, as the common tail's buttons do.
const unavailable = (c: BarContext) => c.locked || !!c.ctx.inlineEdit.value

/** Group for a multi-selection; Arrange & order, Duplicate and Delete come from the common tail (no Appearance for multi). */
export const multiBar: BarItem[] = [
  { type: 'button', id: 'group', label: 'editorCanvas.bar.labels.group', title: 'editorCanvas.bar.titles.group', icon: Group, disabled: unavailable, run: (c) => groupSelected(c.ctx) },
]
