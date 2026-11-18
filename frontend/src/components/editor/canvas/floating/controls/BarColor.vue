<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Palette } from 'lucide-vue-next'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { active, tool } from '@/components/editor/canvas/toolbars/toolbarClasses'
import { useSlideEditingContext } from '@/slide-editor/useSlideEditing'
import { guardKeys } from '../guardKeys'
import { usePopoverEscapeGuard } from '../usePopoverEscapeGuard'

// Bar colour control: a swatch opens a small palette popover (theme colours, a custom picker, optionally "none").
// Presentational: the owner commits through `pick` / `none`, holding the target on `open`.
const props = defineProps<{ label: string; value: string | null; palette: string[]; noneLabel?: string; id: string }>()
const emit = defineEmits<{ open: []; pick: [value: string]; none: [] }>()

const ctx = useSlideEditingContext()

const HEX = /^#[0-9a-f]{6}$/i
const current = computed(() => (props.value && HEX.test(props.value) ? props.value.toLowerCase() : null))
const NONE = 'bg-[linear-gradient(135deg,transparent_45%,#e5484d_45%,#e5484d_55%,transparent_55%)]'

const open = ref(false)
watch(open, (isOpen) => isOpen && emit('open'))
// A popover belongs to the selection it was opened for.
watch(() => JSON.stringify(ctx.selection.value), () => (open.value = false))
// Escape closes the popover first, then (next press) deselects.
usePopoverEscapeGuard(open)
function pick(value: string) {
  emit('pick', value)
  open.value = false
}
function none() {
  emit('none')
  open.value = false
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <button
        type="button"
        :class="[tool, open && active]"
        :aria-label="label"
        :title="`${label} ${current ?? 'none'}`"
        :data-bar-item="id"
        @mousedown.prevent
      >
        <span
          class="size-[18px] rounded-full outline outline-1 outline-white/25"
          :class="!current && NONE"
          :style="current ? { background: current } : undefined"
        />
      </button>
    </PopoverTrigger>
    <PopoverContent
      :side-offset="10"
      :collision-padding="8"
      class="w-auto max-w-[calc(100vw-16px)] p-3"
      :aria-label="label"
      data-inline-edit-ignore="true"
      @open-auto-focus.prevent
      @close-auto-focus.prevent
      @keydown="guardKeys"
    >
      <div class="flex max-w-[220px] flex-wrap items-center gap-2.5">
        <button
          v-if="noneLabel"
          type="button"
          class="size-6 rounded-full border border-white/20"
          :class="NONE"
          :aria-label="noneLabel"
          :title="noneLabel"
          @mousedown.prevent
          @click="none"
        />
        <button
          v-for="c in palette"
          :key="c"
          type="button"
          class="size-6 rounded-full border-0 outline outline-1 outline-offset-[3px] transition-transform hover:-translate-y-0.5"
          :class="c.toLowerCase() === current ? 'outline-[#a9c2ce]' : 'outline-transparent'"
          :style="{ background: c }"
          :aria-label="`Colour ${c}`"
          :aria-pressed="c.toLowerCase() === current"
          @mousedown.prevent
          @click="pick(c)"
        />
        <label
          class="relative ml-auto grid size-6 cursor-pointer place-items-center overflow-hidden rounded-full border border-white/[0.07] bg-[#30373b] text-[#9daab2] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent"
          title="Custom colour"
        >
          <Palette class="size-3" aria-hidden="true" />
          <input
            type="color"
            aria-label="Custom colour"
            class="absolute inset-0 size-full cursor-pointer opacity-0"
            :value="current ?? '#000000'"
            @change="pick(($event.target as HTMLInputElement).value)"
          />
        </label>
      </div>
    </PopoverContent>
  </Popover>
</template>
