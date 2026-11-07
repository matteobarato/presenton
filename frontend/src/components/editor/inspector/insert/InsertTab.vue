<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Presentation, Slide } from '@/api/types'
import ImagePickerDialog from '@/components/editor/canvas/ImagePickerDialog.vue'
import { resolvePresentationTheme } from '@/render/legacy/lib/template-theme'
import { slideKind } from '@/render/slide-kind'
import {
  ELEMENT_ICONS,
  ELEMENT_INSERT_GROUPS,
  IMAGE_INSERT_ITEMS,
  TEXT_INSERT_ITEMS,
  type InsertItem,
} from '@/slide-editor/insert/insert-elements'
import { deckTemplateId, type TemplateBlock } from '@/slide-editor/insert/templateBlocks'
import { useSlideEditingContext } from '@/slide-editor/useSlideEditing'
import { useEditorStore } from '@/stores/editor'
import BlocksSection from './BlocksSection.vue'
import { section, sectionLabel, subLabel, tile } from './insertClasses'
import { useInsert, type InsertTarget } from './useInsert'

const props = defineProps<{ presentationId: string; presentation: Presentation; activeSlide: Slide | null }>()

const ctx = useSlideEditingContext()
const editor = useEditorStore()
const theme = computed(() => resolvePresentationTheme(props.presentation))
const actions = useInsert(ctx, theme)

const templateId = computed(() => deckTemplateId(props.presentation.slides ?? [], props.activeSlide?.id))

// Same copy and precedence as the toolbar's Insert button.
const disabledTitle = computed<string | null>(() => {
  const slide = props.activeSlide
  if (slide && slideKind(slide) === 'smart') return 'Insert is available for template slides'
  if (!slide) return 'Select a slide to insert into'
  if (editor.locked) return 'Insert is unavailable while the deck is busy'
  if (!ctx.enabled.value) return 'Insert is available for template slides'
  return null
})
const disabled = computed(() => disabledTitle.value !== null)

const pickerOpen = ref(false)
// The slide (and its ui) the image tile was clicked on: the picker may close on another slide.
let pickTarget: InsertTarget | null = null

function insertText(item: InsertItem) {
  if (!disabled.value) void actions.text(item.id, item.label)
}
function insertShape(item: { id: string; label: string }) {
  if (!disabled.value) void actions.shape(item.id, item.label)
}
function insertImage(item: InsertItem) {
  if (disabled.value) return
  if (item.id !== 'image') {
    void actions.image(item.id, item.label)
    return
  }
  // An open text edit is committed now, so the captured ui keeps the typed text.
  pickTarget = actions.capture().target
  pickerOpen.value = true
}
function onPick(src: string) {
  const target = pickTarget
  pickTarget = null
  if (target) void actions.image('image', 'Image', src, target)
}
function onPickerOpen(open: boolean) {
  pickerOpen.value = open
  if (!open) pickTarget = null
}
function insertBlock(variant: TemplateBlock, label: string) {
  if (!disabled.value) void actions.block(variant, label)
}

const labelledTile = [tile, 'flex h-[52px] flex-col items-center justify-center gap-1.5 px-1 text-[10px]']
const iconTile = [tile, 'flex aspect-square items-center justify-center']
</script>

<template>
  <!-- data-inline-edit-ignore: focus moving into the inspector keeps the inline text editor open. -->
  <section class="flex flex-1 flex-col px-5 pb-[18px] max-[1279px]:px-4 min-[1600px]:px-[23px]" aria-label="Insert" data-inline-edit-ignore="true">
    <div class="pt-6 pb-[18px] min-[1600px]:pt-7 [@media(max-height:780px)_and_(min-width:1051px)]:pt-[17px]">
      <h2 class="text-[19px] font-medium tracking-[-0.04em] text-[#f0f2f3] max-[1279px]:text-[18px] min-[1600px]:text-[22px]">Insert</h2>
      <p class="mt-[5px] text-[10px] leading-[1.6] text-[#a0abb1]">Click to add to this slide.</p>
    </div>

    <BlocksSection
      :template-id="templateId"
      :theme="props.presentation.theme"
      :fonts="props.presentation.fonts"
      :disabled-title="disabledTitle"
      @insert="insertBlock"
    />

    <div :class="section">
      <div :class="sectionLabel"><h3>Text</h3></div>
      <div class="grid grid-cols-3 gap-2">
        <button
          v-for="item in TEXT_INSERT_ITEMS"
          :key="item.id"
          type="button"
          :class="labelledTile"
          :aria-label="`Insert ${item.label}`"
          :title="disabledTitle ?? item.label"
          :disabled="disabled"
          @mousedown.prevent
          @click="insertText(item)"
        >
          <component :is="item.icon" class="size-4" aria-hidden="true" />
          <span class="max-w-full truncate">{{ item.label }}</span>
        </button>
      </div>
    </div>

    <div :class="section">
      <div :class="sectionLabel"><h3>Images</h3></div>
      <div class="grid grid-cols-3 gap-2">
        <button
          v-for="item in IMAGE_INSERT_ITEMS"
          :key="item.id"
          type="button"
          :class="labelledTile"
          :aria-label="`Insert ${item.label}`"
          :title="disabledTitle ?? item.label"
          :disabled="disabled"
          @mousedown.prevent
          @click="insertImage(item)"
        >
          <component :is="item.icon" class="size-4" aria-hidden="true" />
          <span class="max-w-full truncate">{{ item.label }}</span>
        </button>
      </div>
    </div>

    <div :class="section">
      <div :class="sectionLabel"><h3>Shapes</h3></div>
      <div v-for="(group, i) in ELEMENT_INSERT_GROUPS" :key="group.label" :class="i > 0 && 'mt-4'">
        <h4 :class="subLabel">{{ group.label }}</h4>
        <div class="grid grid-cols-6 gap-1.5">
          <button
            v-for="item in group.items"
            :key="item.id"
            type="button"
            :class="iconTile"
            :aria-label="`Insert ${item.label}`"
            :title="disabledTitle ?? item.label"
            :disabled="disabled"
            @mousedown.prevent
            @click="insertShape(item)"
          >
            <component :is="ELEMENT_ICONS[item.id]" class="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>

    <ImagePickerDialog :open="pickerOpen" @update:open="onPickerOpen" @pick="onPick" />
  </section>
</template>
