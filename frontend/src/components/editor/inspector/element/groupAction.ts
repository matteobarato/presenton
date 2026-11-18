import { groupSelection } from '@/slide-editor/ops'
import { useEditingActions } from '@/slide-editor/useEditingActions'
import type { SlideEditing } from '@/slide-editor/useSlideEditing'

/** Groups the multi-selection into one component; shared by the Arrange section and the floating bar's Group button. */
export function groupSelected(ctx: SlideEditing): void {
  void useEditingActions(ctx).run('Group', (ui) => groupSelection(ui, ctx.selection.value))
}
