import { Crop } from 'lucide-vue-next'
import ImageSection from '@/components/editor/inspector/element/ImageSection.vue'
import type { BarItem } from '../barItems'
import ImageFit from '../controls/ImageFit.vue'
import ImageReplace from '../controls/ImageReplace.vue'
import { framed } from '../panelFrame'

const ImagePanel = framed(ImageSection)

/** Replace, cover/contain fit, and a panel with the full Image section (preview, fit, crop focus). */
export const imageBar: BarItem[] = [
  { type: 'custom', id: 'replace', component: ImageReplace },
  { type: 'custom', id: 'fit', component: ImageFit },
  { type: 'panel', id: 'image', label: 'editorCanvas.bar.labels.image', icon: Crop, component: ImagePanel },
]
