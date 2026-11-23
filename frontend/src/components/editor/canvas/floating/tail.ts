import { CopyPlus, Layers, SlidersHorizontal, Trash2 } from 'lucide-vue-next'
import AppearanceSection from '@/components/editor/inspector/element/AppearanceSection.vue'
import { deleteSelection, duplicateSelection } from '@/slide-editor/ops'
import type { ToolbarKind } from '@/slide-editor/toolbarKind'
import { useEditingActions } from '@/slide-editor/useEditingActions'
import ArrangePanel from './ArrangePanel.vue'
import type { BarContext, BarItem } from './barItems'
import { framed } from './panelFrame'

const AppearancePanel = framed(AppearanceSection)

/** Ids of the tail items; the bar draws a divider before the first of them. */
export const TAIL_IDS = ['appearance', 'arrange', 'duplicate', 'delete']

// Structural tools wait while text is being typed, as the Arrange section's buttons do.
const unavailable = (c: BarContext) => c.locked || !!c.ctx.inlineEdit.value

/** Appearance (not for a multi-selection), Arrange & order, then quick Duplicate and Delete. */
export function commonTail(kind: ToolbarKind): BarItem[] {
  const items: BarItem[] = []
  if (kind !== 'multi') {
    items.push({
      type: 'panel',
      id: 'appearance',
      label: 'editorCanvas.bar.labels.appearance',
      icon: SlidersHorizontal,
      component: AppearancePanel,
      props: (c) => ({ presentation: c.presentation }),
    })
  }
  items.push(
    { type: 'panel', id: 'arrange', label: 'editorCanvas.bar.labels.arrange', icon: Layers, component: ArrangePanel },
    {
      type: 'button',
      id: 'duplicate',
      label: 'editorCanvas.bar.labels.duplicate',
      title: 'editorCanvas.bar.titles.duplicate',
      icon: CopyPlus,
      disabled: unavailable,
      run: (c) => void useEditingActions(c.ctx).run('Duplicate', (ui) => duplicateSelection(ui, c.ctx.selection.value)),
    },
    {
      type: 'button',
      id: 'delete',
      label: 'editorCanvas.bar.labels.delete',
      title: 'editorCanvas.bar.titles.delete',
      icon: Trash2,
      disabled: unavailable,
      run: (c) => void useEditingActions(c.ctx).run('Delete', (ui) => deleteSelection(ui, c.ctx.selection.value)),
    },
  )
  return items
}
