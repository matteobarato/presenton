import { Shapes } from 'lucide-vue-next'
import IconSection from '@/components/editor/inspector/element/IconSection.vue'
import type { BarContext, BarItem } from '../barItems'
import IconChange from '../controls/IconChange.vue'
import IconColor from '../controls/IconColor.vue'
import { framed } from '../panelFrame'

const IconPanel = framed(IconSection)
const presentationProps = (c: BarContext) => ({ presentation: c.presentation })

/** Change icon, colour, and a panel with the full Icon section. */
export const iconBar: BarItem[] = [
  { type: 'custom', id: 'change-icon', component: IconChange, props: presentationProps },
  { type: 'custom', id: 'icon-color', component: IconColor, props: presentationProps },
  { type: 'panel', id: 'icon', label: 'Icon', icon: Shapes, component: IconPanel, props: presentationProps },
]
