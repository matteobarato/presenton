import { Type } from 'lucide-vue-next'
import TextSection from '@/components/editor/inspector/element/TextSection.vue'
import type { BarContext, BarItem } from '../barItems'
import TextAlign from '../controls/TextAlign.vue'
import TextColor from '../controls/TextColor.vue'
import TextFontFamily from '../controls/TextFontFamily.vue'
import TextFontSize from '../controls/TextFontSize.vue'
import TextMarks from '../controls/TextMarks.vue'
import { framed } from '../panelFrame'

const TextPanel = framed(TextSection)
const presentationProps = (c: BarContext) => ({ presentation: c.presentation })

/** Font, size, marks, colour and alignment; each drives the inline editor's range when one is open. */
export const textBar: BarItem[] = [
  { type: 'custom', id: 'font-family', component: TextFontFamily, props: presentationProps },
  { type: 'custom', id: 'font-size', component: TextFontSize, props: presentationProps },
  { type: 'custom', id: 'marks', component: TextMarks, props: presentationProps },
  { type: 'custom', id: 'text-color', component: TextColor, props: presentationProps },
  { type: 'custom', id: 'align', component: TextAlign, props: presentationProps },
  { type: 'panel', id: 'text', label: 'editorCanvas.bar.labels.text', icon: Type, component: TextPanel, props: presentationProps },
]
