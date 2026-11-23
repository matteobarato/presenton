<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed } from 'vue'
import { Plus, X } from 'lucide-vue-next'
import type { ChartElement } from '@/render/legacy/components/slide-editor/types'
import { resolvedChartColorTargets } from '@/render/legacy/components/slide-editor/charts/chart-data'
import ColorField from '@/components/editor/inspector/controls/ColorField.vue'
import { segment } from '@/components/editor/inspector/controls/styles'

const { t } = useI18n()

/** `palette` is the full choice list (theme plus system colours). The parent owns every commit. */
const props = defineProps<{ chart: ChartElement; palette: string[] }>()
const emit = defineEmits<{ open: []; close: []; pick: [index: number, color: string]; add: []; remove: [index: number] }>()

const targets = computed(() => resolvedChartColorTargets(props.chart))
const canAdd = computed(() => targets.value.length < 12)
const canRemove = computed(() => targets.value.length > 1)
</script>

<template>
  <div class="flex flex-col gap-2">
    <div v-for="target in targets" :key="target.index" class="flex items-center gap-2">
      <div class="min-w-0 flex-1">
        <ColorField
          :model-value="`#${target.color.toLowerCase()}`"
          :palette="palette"
          :label="t('editorInspector.element.swatches.colourAria', { n: target.index + 1 })"
          @open="emit('open')"
          @close="emit('close')"
          @commit="(v) => v && emit('pick', target.index, v)"
        />
      </div>
      <span class="w-16 shrink-0 truncate text-[9px] text-tx-9aa9b0" :title="target.label">{{ target.label }}</span>
    </div>
    <div class="flex gap-2">
      <button type="button" :class="[segment, 'disabled:cursor-not-allowed disabled:opacity-40']" :aria-label="t('editorInspector.element.swatches.add')" :title="t('editorInspector.element.swatches.add')" :disabled="!canAdd" @mousedown.prevent @click="emit('add')">
        <Plus class="size-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        :class="[segment, 'disabled:cursor-not-allowed disabled:opacity-40']"
        :aria-label="t('editorInspector.element.swatches.remove')"
        :title="t('editorInspector.element.swatches.removeLast')"
        :disabled="!canRemove"
        @mousedown.prevent
        @click="emit('remove', targets.length - 1)"
      >
        <X class="size-4" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>
