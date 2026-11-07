<script setup lang="ts">
import { useEditorFetchGate } from '@/composables/useEditorFetchGate'
import { nextTick, ref, toRef, watch } from 'vue'
import Draggable from 'vuedraggable'
import { Check, Copy, GripVertical, Plus, Trash2 } from 'lucide-vue-next'
import { usePresentation } from '@/api/presentations'
import type { Slide } from '@/api/types'
import { deckTemplateId, useSlideMutations, type NewSlideLayout } from '@/composables/useSlideMutations'
import { slideLabel } from '@/lib/slide-label'
import SlideView from '@/render/SlideView.vue'
import { slideKey, useEditorStore } from '@/stores/editor'
import LayoutPickerDialog from './LayoutPickerDialog.vue'
import SlideStatusDots from './SlideStatusDots.vue'
import { Button } from '@/components/ui/button'

const props = defineProps<{ presentationId: string; slides: Slide[] }>()

const editor = useEditorStore()
const id = toRef(props, 'presentationId')
const { data: presentation } = usePresentation(id, useEditorFetchGate())
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
  if ((e.key !== 'Delete' && e.key !== 'Backspace') || editor.locked) return
  if (e.target instanceof HTMLElement && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return
  const active = props.slides[activeIndex()]
  if (active?.id) {
    e.preventDefault()
    void mutations.removeSlide(active.id)
  }
}

// Cmd/Ctrl+Enter (useEditorShortcuts) asks for the picker.
watch(
  () => editor.addSlideRequested,
  () => {
    if (!editor.locked) pickerOpen.value = true
  },
)

const mod = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'

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
  <div ref="root" data-slide-navigator class="flex min-h-0 flex-1 flex-col" @keydown="onKeydown">
    <div class="flex h-[58px] flex-none items-center justify-between px-[15px] text-[12px] font-semibold [@media(max-height:780px)_and_(min-width:1051px)]:h-[49px]">
      <div class="flex items-center gap-2">
        Slides
        <span class="inline-flex h-4 min-w-[17px] items-center justify-center rounded-[5px] bg-[#2c3033] px-1 text-[9px] font-medium text-[#a4adb2] tabular-nums">
          {{ slides.length }}
        </span>
      </div>
    </div>

    <Draggable
      v-model="list"
      tag="ol"
      :item-key="slideKey"
      handle=".drag-handle"
      :disabled="editor.locked"
      ghost-class="opacity-40"
      class="min-h-0 flex-1 list-none overflow-y-auto pt-px pr-[13px] pb-3.5 pl-[9px] max-[1279px]:pr-2.5 max-[1279px]:pl-1.5"
      :animation="150"
      @end="onDragEnd"
    >
      <template #item="{ element, index }">
        <li
          class="group mb-[11px] flex gap-[7px] rounded-[8px] last:mb-0 max-[1279px]:mb-2 max-[1279px]:gap-1 max-[1050px]:mb-3 min-[1600px]:mb-3.5"
          :class="slideKey(element) === editor.activeSlideId && 'is-selected'"
        >
          <div
            class="flex w-3.5 flex-none flex-col items-center gap-[9px] pt-[5px] text-[9px] text-[#899296] tabular-nums group-[.is-selected]:text-accent max-[1279px]:w-3"
          >
            {{ String(index + 1).padStart(2, '0') }}
            <GripVertical
              v-if="!editor.locked"
              class="drag-handle size-3 cursor-grab opacity-0 transition-opacity duration-150 group-hover:opacity-100"
              aria-hidden="true"
            />
          </div>
          <div class="min-w-0 flex-1">
            <button
              type="button"
              class="block w-full py-0.5 text-left"
              :data-slide-key="slideKey(element)"
              :aria-current="slideKey(element) === editor.activeSlideId ? 'true' : undefined"
              :aria-label="`Slide ${index + 1}`"
              :title="slideLabel(element)"
              @click="editor.select(slideKey(element)); editor.navigatorOpen = false"
            >
              <span
                class="relative block rounded-[7px] border-2 border-transparent p-0.5 transition-colors duration-200 group-[:not(.is-selected):hover]:border-[#7f9fab] group-[.is-selected]:border-accent"
              >
                <SlideView
                  :slide="element"
                  :theme="presentation?.theme"
                  :fonts="presentation?.fonts"
                  fit="width"
                  lazy
                  class="pointer-events-none overflow-hidden rounded-[3px]"
                />
                <SlideStatusDots :presentation-id="presentationId" :slide-index="index" />
                <span
                  v-if="slideKey(element) === editor.activeSlideId"
                  class="absolute right-[7px] bottom-[7px] grid size-3.5 place-items-center rounded-full bg-accent text-[#19323e]"
                  aria-hidden="true"
                >
                  <Check class="size-2.5" :stroke-width="3" />
                </span>
              </span>
            </button>
            <div class="flex items-center gap-0.5 pr-0.5 pl-[5px]">
              <span
                class="min-w-0 flex-1 truncate text-[9px] leading-[1.3] text-[#9aa3a7] group-[.is-selected]:text-[#d9e5e9]"
                aria-hidden="true"
              >{{ slideLabel(element) }}</span>
              <template v-if="element.id && !editor.locked">
                <button
                  type="button"
                  class="grid h-6 w-[23px] flex-none place-items-center rounded-control text-muted hover:bg-white/[0.04] hover:text-white"
                  :aria-label="`Duplicate slide ${index + 1}`"
                  title="Duplicate slide"
                  @click="mutations.duplicateSlide(element.id)"
                >
                  <Copy class="size-3" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  class="grid h-6 w-[23px] flex-none place-items-center rounded-control text-muted hover:bg-white/[0.04] hover:text-danger-text disabled:opacity-35 disabled:hover:bg-transparent"
                  :disabled="slides.length <= 1"
                  :aria-label="`Delete slide ${index + 1}`"
                  title="Delete slide"
                  @click="mutations.removeSlide(element.id)"
                >
                  <Trash2 class="size-3" aria-hidden="true" />
                </button>
              </template>
            </div>
          </div>
        </li>
      </template>
    </Draggable>

    <div class="flex-none border-t border-line px-[13px] pt-[13px] pb-[17px]">
      <Button
        variant="outline"
        :disabled="editor.locked"
        class="h-[34px] w-full justify-start border-dashed border-white/[0.13] px-2.5 text-[11px]"
        @click="pickerOpen = true"
      >
        <Plus class="size-4" aria-hidden="true" />Add slide
        <span class="ml-auto text-[9px] font-normal text-[#919ca1] max-[1279px]:hidden" aria-hidden="true">{{ mod }} ↵</span>
      </Button>
      <span class="mt-[11px] block text-center text-[9px] text-[#a0a8ae] [@media(max-height:780px)_and_(min-width:1051px)]:hidden">
        A little structure. Endless possibility.
      </span>
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
