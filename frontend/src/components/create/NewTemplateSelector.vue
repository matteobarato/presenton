<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, ref } from 'vue'
import { useElementSize } from '@vueuse/core'
import { Check, Clock3 } from 'lucide-vue-next'
import type { TemplateSummary } from '@/api/templates'
import { rovingKeydown, rovingTab } from '@/lib/roving'
import TemplateCardThumb from './TemplateCardThumb.vue'
const { t } = useI18n()

const props = withDefaults(defineProps<{ templates: TemplateSummary[]; disabled?: boolean; allowLater?: boolean }>(), { allowLater: true })
const selected = defineModel<string | null>({ default: null })
const emit = defineEmits<{ picked: [id: string | null] }>()

function pick(id: string | null) {
  if (props.disabled) return
  selected.value = id
  emit('picked', id)
}
const none = computed(() => !props.templates.some((tpl) => tpl.id === selected.value))
// One Tab stop for the whole grid (the selected card, else the first); arrows move and select (see lib/roving).
const offset = computed(() => (props.allowLater ? 1 : 0))
const checkedIndex = computed(() => {
  if (props.allowLater && none.value) return 0
  const i = props.templates.findIndex((tpl) => tpl.id === selected.value)
  return i < 0 ? -1 : i + offset.value
})

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
  'group relative flex min-w-0 flex-col gap-2.5 rounded-card border p-[7px] pb-2.5 text-left transition-[border-color,background,box-shadow,translate] duration-200 hover:-translate-y-px hover:bg-ov/[0.04] scroll-mb-28 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40 disabled:hover:translate-y-0'
const on = 'border-accent bg-sx-bee3f30d shadow-[0_8px_24px_#0000004d]'
const off = 'border-ov/[0.07] bg-ov/[0.02]'
</script>

<template>
  <div
    ref="grid"
    role="radiogroup"
    :aria-label="t('create.templates.aria')"
    class="grid"
    :style="{ gap: `${GAP}px`, gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }"
    @keydown="rovingKeydown($event, columns)"
  >
    <button
      v-if="allowLater"
      type="button"
      role="radio"
      :aria-checked="none"
      :tabindex="rovingTab(0, checkedIndex)"
      :disabled="disabled"
      data-testid="new-template-none"
      :class="[cardClass, none ? on : off]"
      @click="pick(null)"
    >
      <span
        class="grid aspect-video w-full place-items-center rounded border border-dashed border-ov/[0.1] bg-ov/[0.02] text-tx-93a6b0 group-hover:text-tx-c8dbe4"
      >
        <Clock3 class="size-5" aria-hidden="true" />
      </span>
      <span class="flex flex-col gap-0.5 px-1">
        <span class="truncate text-[12px] font-medium text-tx-e4ecf0">{{ t('create.templates.decideLater') }}</span>
        <span class="truncate text-[12px] text-tx-8e9ca4">{{ t('create.templates.pickAfterOutline') }}</span>
      </span>
      <Check v-if="none" class="absolute top-3 right-3 size-[18px] rounded-full bg-accent p-[3px] text-accent-ink" aria-hidden="true" />
    </button>
    <button
      v-for="(tpl, i) in templates"
      :key="tpl.id"
      type="button"
      role="radio"
      :aria-checked="selected === tpl.id"
      :tabindex="rovingTab(i + offset, checkedIndex)"
      :disabled="disabled"
      :data-testid="`new-template-${tpl.id}`"
      :class="[cardClass, selected === tpl.id ? on : off]"
      @click="pick(tpl.id)"
    >
      <TemplateCardThumb :template="tpl" :width="thumbWidth" />
      <span class="flex flex-col gap-0.5 px-1">
        <span class="truncate text-[12px] font-medium text-tx-e4ecf0">{{ tpl.name }}</span>
        <span class="truncate text-[12px] text-tx-8e9ca4">{{ t('create.templates.layoutCount', { count: tpl.layouts.length }, tpl.layouts.length) }}</span>
      </span>
      <Check v-if="selected === tpl.id" class="absolute top-3 right-3 size-[18px] rounded-full bg-accent p-[3px] text-accent-ink" aria-hidden="true" />
    </button>
  </div>
</template>
