<script setup lang="ts">
import { computed } from 'vue'
import { X } from 'lucide-vue-next'
import type { Presentation, Slide } from '@/api/types'
import { isGroupSelection, toolbarKind } from '@/slide-editor/toolbarKind'
import { useSlideEditingContext } from '@/slide-editor/useSlideEditing'
import ArrangeSection from './ArrangeSection.vue'
import TextSection from './TextSection.vue'

const props = defineProps<{ presentationId: string; presentation: Presentation; activeSlide: Slide | null }>()

const ctx = useSlideEditingContext()
const active = computed(() => ctx.enabled.value && ctx.selection.value !== null)
const kind = computed(() => toolbarKind(ctx.ui.value, ctx.selection.value))
const heading = computed(() => {
  const sel = ctx.selection.value
  if (sel?.kind === 'multi-component') return `${sel.componentIndexes.length} items`
  if (kind.value === 'text') return 'Text'
  if (kind.value === 'image') return 'Image'
  if (isGroupSelection(ctx.ui.value, sel)) return 'Group'
  return 'Element'
})
const emptyHint = computed(() => (ctx.enabled.value ? 'Double-click text to type.' : null))
</script>

<template>
  <!-- data-inline-edit-ignore: focus moving into the inspector keeps the inline text editor open. -->
  <section class="flex flex-1 flex-col px-5 pb-[18px] max-[1279px]:px-4 min-[1600px]:px-[23px]" aria-label="Element" data-inline-edit-ignore="true">
    <template v-if="active">
      <div class="flex items-start justify-between pt-6 pb-[22px] min-[1600px]:pt-7 min-[1600px]:pb-[26px] [@media(max-height:780px)_and_(min-width:1051px)]:pt-[17px] [@media(max-height:780px)_and_(min-width:1051px)]:pb-4">
        <div>
          <h2 class="text-[19px] font-medium tracking-[-0.04em] text-[#f0f2f3] max-[1279px]:text-[18px] min-[1600px]:text-[22px]">{{ heading }}</h2>
          <p class="mt-[5px] text-[10px] leading-[1.6] text-[#a0abb1]">Selected on the slide.</p>
        </div>
        <button
          type="button"
          class="-mr-1.5 inline-flex size-7 items-center justify-center rounded-control text-[#9aa9b0] hover:bg-white/[0.04] hover:text-white"
          aria-label="Deselect"
          title="Done (Esc)"
          @mousedown.prevent
          @click="ctx.select(null)"
        >
          <X class="size-4" aria-hidden="true" />
        </button>
      </div>
      <TextSection v-if="kind === 'text'" :presentation="props.presentation" />
      <!-- Task 10 adds ImageSection (kind === 'image') here. -->
      <ArrangeSection />
    </template>
    <div v-else class="pt-6">
      <h2 class="text-[19px] font-medium tracking-[-0.04em] text-[#f0f2f3] max-[1279px]:text-[18px] min-[1600px]:text-[22px]">
        {{ ctx.enabled.value ? 'Select something on the slide to edit it.' : "This slide can't be edited on the canvas." }}
      </h2>
      <p v-if="emptyHint" class="mt-[5px] text-[10px] leading-[1.6] text-[#a0abb1]">{{ emptyHint }}</p>
    </div>
  </section>
</template>
