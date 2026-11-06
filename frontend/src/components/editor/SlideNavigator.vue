<script setup lang="ts">
import { nextTick, ref, toRef, watch } from 'vue'
import Draggable from 'vuedraggable'
import { Copy, GripVertical, Plus, Trash2 } from 'lucide-vue-next'
import { usePresentation } from '@/api/presentations'
import type { Slide } from '@/api/types'
import { deckTemplateId, useSlideMutations, type NewSlideLayout } from '@/composables/useSlideMutations'
import SlideView from '@/render/SlideView.vue'
import { slideKey, useEditorStore } from '@/stores/editor'
import LayoutPickerDialog from './LayoutPickerDialog.vue'
import SlideStatusDots from './SlideStatusDots.vue'

const props = defineProps<{ presentationId: string; slides: Slide[] }>()

const editor = useEditorStore()
const id = toRef(props, 'presentationId')
const { data: presentation } = usePresentation(id)
const mutations = useSlideMutations(id)

// Local copy so the drag can reorder the DOM before the save settles; it is
// re-synced from the cache (and so restored on a failed save).
const list = ref<Slide[]>([...props.slides])
watch(
  () => props.slides,
  (slides) => (list.value = [...slides]),
)

const root = ref<HTMLElement | null>(null)
const pickerOpen = ref(false)
const activeIndex = () => Math.max(0, props.slides.findIndex((s) => slideKey(s) === editor.activeSlideId))

function onDragEnd(e: { oldIndex?: number; newIndex?: number }) {
  if (e.oldIndex != null && e.newIndex != null) void mutations.reorder(e.oldIndex, e.newIndex)
}

function onKeydown(e: KeyboardEvent) {
  if ((e.key !== 'Delete' && e.key !== 'Backspace') || editor.generating) return
  if (e.target instanceof HTMLElement && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return
  const active = props.slides[activeIndex()]
  if (active?.id) {
    e.preventDefault()
    void mutations.removeSlide(active.id)
  }
}

function addSlide(layout: NewSlideLayout | null) {
  void mutations.addSlide(activeIndex(), layout)
}

// Keep the active thumbnail in view, and keep focus on it when navigating by keyboard.
watch(
  () => editor.activeSlideId,
  async (key) => {
    await nextTick()
    const el = root.value?.querySelector<HTMLElement>(`[data-slide-key="${CSS.escape(key ?? '')}"]`)
    el?.scrollIntoView?.({ block: 'nearest' })
    if (el && root.value?.contains(document.activeElement)) el.focus()
  },
)
</script>

<template>
  <div ref="root" class="flex min-h-0 flex-1 flex-col" @keydown="onKeydown">
    <div class="flex h-12 flex-none items-center justify-between px-4 text-[12px] font-semibold">
      Slides
      <span class="grid h-4 min-w-4 place-items-center rounded-[5px] bg-[#2c3033] px-1 text-[9px] font-medium text-[#a4adb2]">
        {{ slides.length }}
      </span>
    </div>

    <Draggable
      v-model="list"
      tag="ol"
      :item-key="slideKey"
      handle=".drag-handle"
      :disabled="editor.generating"
      ghost-class="opacity-40"
      class="min-h-0 flex-1 list-none overflow-y-auto p-0 pr-3 pl-2"
      :animation="150"
      @end="onDragEnd"
    >
      <template #item="{ element, index }">
        <li class="group mb-3 flex gap-1.5" :class="slideKey(element) === editor.activeSlideId && 'is-selected'">
          <div
            class="flex w-4 flex-none flex-col items-center gap-2 pt-1.5 text-[9px] text-[#899296] tabular-nums group-[.is-selected]:text-accent"
          >
            {{ index + 1 }}
            <GripVertical v-if="!editor.generating" class="drag-handle size-3 cursor-grab opacity-0 group-hover:opacity-100" aria-hidden="true" />
          </div>
          <div class="relative min-w-0 flex-1">
            <button
              type="button"
              class="block w-full rounded-[7px] border-2 border-transparent p-0.5 text-left transition-colors duration-200 hover:border-[#7f9fab] group-[.is-selected]:border-accent"
              :data-slide-key="slideKey(element)"
              :aria-current="slideKey(element) === editor.activeSlideId ? 'true' : undefined"
              :aria-label="`Slide ${index + 1}`"
              @click="editor.select(slideKey(element))"
            >
              <SlideView
                :slide="element"
                :theme="presentation?.theme"
                :fonts="presentation?.fonts"
                fit="width"
                lazy
                class="pointer-events-none rounded-[3px]"
              />
            </button>
            <SlideStatusDots :presentation-id="presentationId" :slide-index="index" />
            <div
              v-if="element.id && !editor.generating"
              class="absolute top-1.5 right-1.5 flex gap-0.5 opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100"
            >
              <button
                type="button"
                class="glass-tools grid size-5 place-items-center rounded-[5px] text-muted hover:text-white"
                :aria-label="`Duplicate slide ${index + 1}`"
                @click="mutations.duplicateSlide(element.id)"
              >
                <Copy class="size-3" aria-hidden="true" />
              </button>
              <button
                type="button"
                class="glass-tools grid size-5 place-items-center rounded-[5px] text-muted hover:text-danger-text disabled:opacity-35"
                :disabled="slides.length <= 1"
                :aria-label="`Delete slide ${index + 1}`"
                @click="mutations.removeSlide(element.id)"
              >
                <Trash2 class="size-3" aria-hidden="true" />
              </button>
            </div>
          </div>
        </li>
      </template>
    </Draggable>

    <div class="flex-none border-t border-line p-3">
      <button
        type="button"
        :disabled="editor.generating"
        class="flex h-[34px] w-full items-center gap-2 rounded-button border border-dashed border-white/[0.13] px-2.5 text-[11px] font-semibold text-muted transition-colors duration-200 hover:border-white/25 hover:text-text"
        @click="pickerOpen = true"
      >
        <Plus class="size-3.5" aria-hidden="true" />Add slide
      </button>
    </div>

    <LayoutPickerDialog
      v-model:open="pickerOpen"
      :presentation-id="presentationId"
      :template-id="deckTemplateId(slides)"
      :theme="presentation?.theme"
      :fonts="presentation?.fonts"
      @select="addSlide"
    />
  </div>
</template>
