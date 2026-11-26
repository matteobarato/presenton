<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { FileUp, Sparkles } from 'lucide-vue-next'
import { rovingKeydown, rovingTab } from '@/lib/roving'

/** Step 1's two ways in: write a topic, or start from a PowerPoint that keeps its design. A compact segmented control. */
defineProps<{ disabled?: boolean }>()
const mode = defineModel<'topic' | 'pptx'>({ required: true })
const { t } = useI18n()

const choices = computed(() => [
  { key: 'topic' as const, label: t('create.start.fromTopic'), icon: Sparkles },
  { key: 'pptx' as const, label: t('create.start.fromPowerPoint'), icon: FileUp },
])
const checked = computed(() => (mode.value === 'pptx' ? 1 : 0))

const segment =
  'inline-flex h-9 items-center gap-2 rounded-[10px] border px-3.5 text-[12px] font-semibold transition-[border-color,background,color] duration-200 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent max-[559px]:h-11 max-[559px]:flex-1 max-[559px]:justify-center'
const on = 'border-accent bg-sx-bee3f30d text-tx-eef4f7'
const off = 'border-transparent text-tx-9aabb4 hover:bg-ov/[0.04] hover:text-tx-dbe7ef'
</script>

<template>
  <div
    role="radiogroup"
    :aria-label="t('create.start.modeLabel')"
    class="inline-flex gap-1 self-start rounded-card border border-ov/[0.07] bg-ov/[0.02] p-1 max-[559px]:flex max-[559px]:self-stretch"
    @keydown="rovingKeydown"
  >
    <button
      v-for="(c, i) in choices"
      :key="c.key"
      type="button"
      role="radio"
      :aria-checked="mode === c.key"
      :tabindex="rovingTab(i, checked)"
      :disabled="disabled"
      :data-testid="`start-mode-${c.key}`"
      :class="[segment, mode === c.key ? on : off]"
      @click="mode = c.key"
    >
      <component :is="c.icon" class="size-3.5" :class="mode === c.key ? 'text-accent' : ''" aria-hidden="true" />
      {{ c.label }}
    </button>
  </div>
</template>
