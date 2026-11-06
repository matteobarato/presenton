<script setup lang="ts">
import { computed } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { Plus } from 'lucide-vue-next'
import { extractLayouts, getTemplate, templateDetailKey } from '@/api/outlines'
import type { Slide } from '@/api/types'
import type { NewSlideLayout } from '@/composables/useSlideMutations'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import SlideView from '@/render/SlideView.vue'

const props = defineProps<{
  open: boolean
  presentationId: string
  /** Template the deck was built from (see deckTemplateId). */
  templateId: string
  theme?: unknown
  fonts?: unknown
}>()
const emit = defineEmits<{ 'update:open': [value: boolean]; select: [layout: NewSlideLayout | null] }>()

const query = useQuery({
  queryKey: computed(() => templateDetailKey(props.templateId)),
  queryFn: () => getTemplate(props.templateId),
  enabled: computed(() => props.open && Boolean(props.templateId)),
  staleTime: 5 * 60_000,
})

const options = computed(() =>
  (extractLayouts(query.data.value?.layouts)).map((ui, i) => {
    const id = typeof ui.id === 'string' && ui.id.trim() ? ui.id : `layout_${i + 1}`
    const description = typeof ui.description === 'string' && ui.description.trim() ? ui.description : id
    const preview = {
      id: `preview-${id}`,
      presentation: props.presentationId,
      index: 0,
      content: {},
      ui,
      layout: id,
      layout_group: 'template-v2',
      properties: null,
    } as unknown as Slide
    return { id, description, ui, preview }
  }),
)

function choose(layout: NewSlideLayout | null) {
  emit('select', layout)
  emit('update:open', false)
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="w-[min(880px,calc(100vw-32px))]">
      <DialogHeader>
        <DialogTitle>Choose slide layout</DialogTitle>
        <DialogDescription>
          {{ query.isPending.value && templateId ? 'Loading layouts' : `${options.length + 1} options` }}
        </DialogDescription>
      </DialogHeader>

      <p v-if="query.isError.value" class="mt-3 rounded-control bg-danger px-3 py-2 text-[12px] text-danger-text" role="alert">
        Could not load layouts for this template. You can still add a blank slide.
      </p>

      <ul class="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <li>
          <button
            type="button"
            class="grid aspect-video w-full place-items-center rounded-card border border-dashed border-white/20 bg-white/[0.03] text-[12px] text-muted transition-colors duration-200 hover:border-accent hover:text-text"
            aria-label="Add Blank slide layout"
            @click="choose(null)"
          >
            <span class="flex flex-col items-center gap-1.5"><Plus class="size-4" aria-hidden="true" />Blank</span>
          </button>
        </li>
        <li v-for="o in options" :key="o.id">
          <button
            type="button"
            class="relative block aspect-video w-full overflow-hidden rounded-card border border-white/10 bg-white transition-[border-color,box-shadow] duration-200 hover:border-accent focus-visible:border-accent"
            :title="o.description"
            :aria-label="`Add ${o.description} layout`"
            @click="choose({ id: o.id, ui: o.ui, group: templateId })"
          >
            <SlideView :slide="o.preview" :theme="theme" :fonts="fonts" fit="width" lazy class="pointer-events-none" />
          </button>
        </li>
      </ul>
    </DialogContent>
  </Dialog>
</template>
