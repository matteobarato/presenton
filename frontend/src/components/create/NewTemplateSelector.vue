<script setup lang="ts">
import { computed, ref } from 'vue'
import { useElementSize } from '@vueuse/core'
import { Check, Clock3 } from 'lucide-vue-next'
import type { TemplateSummary } from '@/api/templates'
import TemplateCardThumb from './TemplateCardThumb.vue'

const props = defineProps<{ templates: TemplateSummary[]; disabled?: boolean; theme?: unknown }>()
const selected = defineModel<string | null>({ default: null })
const emit = defineEmits<{ picked: [id: string | null] }>()

function pick(id: string | null) {
  if (props.disabled) return
  selected.value = id
  emit('picked', id)
}
const none = computed(() => !props.templates.some((t) => t.id === selected.value))

// The grid fills its width; each thumbnail is rendered at its card's exact inner width.
const GAP = 12
const MIN_CARD = 190
const grid = ref<HTMLElement | null>(null)
const { width } = useElementSize(grid)
const columns = computed(() => Math.max(2, Math.floor((width.value + GAP) / (MIN_CARD + GAP))))
const thumbWidth = computed(() => {
  if (!width.value) return 158
  const card = (width.value - GAP * (columns.value - 1)) / columns.value
  return Math.max(120, Math.floor(card - 2 * 7 - 2))
})

const cardClass =
  'group relative flex min-w-0 flex-col gap-2.5 rounded-card border p-[7px] pb-2.5 text-left transition-[border-color,background,box-shadow,translate] duration-200 hover:-translate-y-px hover:bg-white/[0.04] focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40 disabled:hover:translate-y-0'
const on = 'border-accent bg-[#bee3f30d] shadow-[0_8px_24px_#0000004d]'
const off = 'border-white/[0.07] bg-white/[0.02]'
</script>

<template>
  <div
    ref="grid"
    role="radiogroup"
    aria-label="Template"
    class="grid"
    :style="{ gap: `${GAP}px`, gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }"
  >
    <button
      type="button"
      role="radio"
      :aria-checked="none"
      :disabled="disabled"
      data-testid="new-template-none"
      :class="[cardClass, none ? on : off]"
      @click="pick(null)"
    >
      <span
        class="grid aspect-video w-full place-items-center rounded border border-dashed border-white/[0.1] bg-white/[0.02] text-[#93a6b0] group-hover:text-[#c8dbe4]"
      >
        <Clock3 class="size-5" aria-hidden="true" />
      </span>
      <span class="flex flex-col gap-0.5 px-1">
        <span class="truncate text-[12px] font-medium text-[#e4ecf0]">Decide later</span>
        <span class="truncate text-[10px] text-[#8e9ca4]">Pick after the outline</span>
      </span>
      <Check v-if="none" class="absolute top-3 right-3 size-[18px] rounded-full bg-accent p-[3px] text-accent-ink" aria-hidden="true" />
    </button>
    <button
      v-for="t in templates"
      :key="t.id"
      type="button"
      role="radio"
      :aria-checked="selected === t.id"
      :disabled="disabled"
      :data-testid="`new-template-${t.id}`"
      :class="[cardClass, selected === t.id ? on : off]"
      @click="pick(t.id)"
    >
      <TemplateCardThumb :template="t" :width="thumbWidth" :theme-override="theme" />
      <span class="flex flex-col gap-0.5 px-1">
        <span class="truncate text-[12px] font-medium text-[#e4ecf0]">{{ t.name }}</span>
        <span class="truncate text-[10px] text-[#8e9ca4]">{{ t.layouts.length }} {{ t.layouts.length === 1 ? 'layout' : 'layouts' }}</span>
      </span>
      <Check v-if="selected === t.id" class="absolute top-3 right-3 size-[18px] rounded-full bg-accent p-[3px] text-accent-ink" aria-hidden="true" />
    </button>
  </div>
</template>
