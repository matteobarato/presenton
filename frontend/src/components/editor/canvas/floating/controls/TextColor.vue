<script setup lang="ts">
import { ref, watch } from 'vue'
import { Palette } from 'lucide-vue-next'
import type { Presentation } from '@/api/types'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { active, tool } from '@/components/editor/canvas/toolbars/toolbarClasses'
import { useTextControls } from '@/components/editor/inspector/element/useTextControls'
import { useSlideEditingContext } from '@/slide-editor/useSlideEditing'
import { guardKeys } from '../guardKeys'
import { usePopoverEscapeGuard } from '../usePopoverEscapeGuard'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

// Bar control: text colour. A swatch opens a small palette popover (theme colours + a custom picker).
const props = defineProps<{ presentation: Presentation }>()
const { color, palette, setColor } = useTextControls(props)
const ctx = useSlideEditingContext()

const open = ref(false)
// A popover belongs to the selection it was opened for.
watch(() => JSON.stringify(ctx.selection.value), () => (open.value = false))
// Escape closes the popover first, then (next press) deselects.
usePopoverEscapeGuard(open)
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <button
        type="button"
        :class="[tool, open && active]"
        :aria-label="t('editorCanvas.controls.textColour.label')"
        :title="t('editorCanvas.controls.textColour.title', { value: color })"
        data-bar-item="text-color"
        @mousedown.prevent
      >
        <span class="size-[18px] rounded-full outline outline-1 outline-ov/25" :style="{ background: color }" />
      </button>
    </PopoverTrigger>
    <PopoverContent
      :side-offset="10"
      :collision-padding="8"
      class="w-auto max-w-[calc(100vw-16px)] p-3"
      :aria-label="t('editorCanvas.controls.textColour.label')"
      data-inline-edit-ignore="true"
      @open-auto-focus.prevent
      @close-auto-focus.prevent
      @keydown="guardKeys"
    >
      <div class="flex max-w-[220px] flex-wrap items-center gap-2.5">
        <button
          v-for="c in palette"
          :key="c"
          type="button"
          class="size-6 rounded-full border-0 outline outline-1 outline-offset-[3px] transition-transform hover:-translate-y-0.5"
          :class="c === color ? 'outline-lx-a9c2ce' : 'outline-transparent'"
          :style="{ background: c }"
          :aria-label="t('editorCanvas.controls.colour.swatch', { color: c })"
          :aria-pressed="c === color"
          @mousedown.prevent
          @click="setColor(c)"
        />
        <label
          class="relative ml-auto grid size-6 cursor-pointer place-items-center overflow-hidden rounded-full border border-ov/[0.07] bg-sx-30373b text-tx-9daab2 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent"
          :title="t('editorCanvas.controls.colour.custom')"
        >
          <Palette class="size-3" aria-hidden="true" />
          <input
            type="color"
            :aria-label="t('editorCanvas.controls.colour.custom')"
            class="absolute inset-0 size-full cursor-pointer opacity-0"
            :value="color"
            @change="setColor(($event.target as HTMLInputElement).value)"
          />
        </label>
      </div>
    </PopoverContent>
  </Popover>
</template>
