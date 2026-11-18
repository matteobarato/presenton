import { Film } from 'lucide-vue-next'
import VideoSection from '@/components/editor/inspector/element/VideoSection.vue'
import type { BarContext, BarItem } from '../barItems'
import { framed } from '../panelFrame'

const VideoPanel = framed(VideoSection)

/** The video placeholder has no quick edit (uploading and generating live in the Avatar tab); one panel previews the slide's video. */
export const videoBar: BarItem[] = [
  {
    type: 'panel',
    id: 'video',
    label: 'Video',
    icon: Film,
    component: VideoPanel,
    props: (c: BarContext) => ({ presentationId: c.presentationId, slide: c.slide }),
  },
]
