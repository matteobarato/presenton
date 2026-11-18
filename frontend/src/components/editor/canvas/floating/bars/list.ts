import { Type } from 'lucide-vue-next'
import type { BarItem } from '../barItems'
import ListMarkerButtons from '../controls/ListMarkerButtons.vue'
import ListPanel from '../controls/ListPanel.vue'
import { textBar } from './text'

/** A list is a text kind plus its marker: the text controls, the marker buttons, and a Text + Marker panel. */
export const listBar: BarItem[] = [
  ...textBar.filter((item) => item.id !== 'text'),
  { type: 'custom', id: 'list-marker', component: ListMarkerButtons },
  { type: 'panel', id: 'text', label: 'Text', icon: Type, component: ListPanel, props: (c) => ({ presentation: c.presentation }) },
]
