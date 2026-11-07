<script setup lang="ts">
import { computed } from 'vue'
import { Check, Pencil, Trash2 } from 'lucide-vue-next'
import { DEFAULT_TEMPLATE_THEME, normalizeTemplateTheme } from '@/render/legacy/lib/template-theme'

const props = defineProps<{
  name: string
  /** A theme record, or null for the built-in default palette. */
  theme: unknown
  selected: boolean
  custom: boolean
  disabled?: boolean
}>()
defineEmits<{ select: []; edit: []; remove: [] }>()

const palette = computed(() => normalizeTemplateTheme(props.theme) ?? DEFAULT_TEMPLATE_THEME)
const dots = computed(() => [palette.value.background_text, palette.value.primary, palette.value.background])
</script>

<template>
  <div class="group relative min-w-0" data-testid="theme-item">
    <button
      type="button"
      :aria-pressed="selected"
      :disabled="disabled"
      class="group/btn flex w-full min-w-0 flex-col text-left focus-visible:outline-none disabled:opacity-50"
      @click="$emit('select')"
    >
      <!-- A miniature slide in the theme's own colours (Aera theme card). -->
      <span
        class="relative flex aspect-[1.72] w-full overflow-hidden rounded-[7px] outline-[1.5px] outline-offset-[3px] transition-[outline-color] duration-200 group-focus-visible/btn:outline-accent [@media(max-height:780px)_and_(min-width:1051px)]:aspect-[1.9]"
        :class="selected ? 'outline-solid outline-accent' : 'outline-solid outline-transparent group-hover:outline-[#788e99]'"
        :style="{ background: palette.background, color: palette.background_text }"
        aria-hidden="true"
      >
        <span class="flex w-[59%] flex-col pt-2.5 pl-[9px] max-[1279px]:pt-2 max-[1279px]:pl-2">
          <span class="font-display text-[21px] leading-none font-medium tracking-[-0.04em] before:content-['Aa'] max-[1279px]:text-[19px] min-[1600px]:text-[24px]" />
          <span class="mt-[7px] block h-[3px] w-[70%] rounded-full opacity-70" :style="{ background: palette.background_text }" />
          <span class="mt-[3px] block h-[3px] w-[48%] rounded-full opacity-40" :style="{ background: palette.background_text }" />
        </span>
        <span class="flex w-[41%] flex-col justify-end gap-1 p-1.5" :style="{ background: palette.primary }">
          <span class="block h-[30%] rounded-[3px]" :style="{ background: palette.card }" />
        </span>
        <span v-if="selected" class="absolute right-[5px] bottom-[5px] grid size-4 place-items-center rounded-full bg-accent text-[#1e3643]">
          <Check class="size-[11px]" :stroke-width="3" />
        </span>
      </span>
      <span
        class="mt-[9px] flex min-w-0 items-center justify-between gap-1.5 text-[10px] text-[#a8b3b9] [@media(max-height:780px)_and_(min-width:1051px)]:mt-[7px]"
        :class="selected && 'text-[#dce7ec]'"
      >
        <span class="truncate">{{ name }}</span>
        <span class="flex flex-none items-center gap-0.5 max-[1279px]:hidden" aria-hidden="true">
          <i
            v-for="(c, n) in dots"
            :key="n"
            data-testid="swatch-chip"
            class="block size-[5px] rounded-full border border-white/[0.12]"
            :style="{ background: c }"
          />
        </span>
      </span>
    </button>
    <div
      v-if="custom"
      class="absolute top-1 right-1 flex gap-1 opacity-0 transition-opacity duration-200 group-focus-within:opacity-100 group-hover:opacity-100"
    >
      <button
        type="button"
        class="glass-tools grid size-6 place-items-center rounded-[6px] text-[#dce6ec] hover:text-white"
        :aria-label="`Edit ${name}`"
        title="Edit theme"
        @click="$emit('edit')"
      >
        <Pencil class="size-3" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="glass-tools grid size-6 place-items-center rounded-[6px] text-[#dce6ec] hover:text-danger-text"
        :aria-label="`Delete ${name}`"
        title="Delete theme"
        @click="$emit('remove')"
      >
        <Trash2 class="size-3" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>
