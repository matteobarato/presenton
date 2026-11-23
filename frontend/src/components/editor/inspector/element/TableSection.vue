<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { AlignCenter, AlignLeft, AlignRight } from 'lucide-vue-next'
import { computed } from 'vue'
import type { Presentation } from '@/api/types'
import ColorField from '@/components/editor/inspector/controls/ColorField.vue'
import SegmentedControl from '@/components/editor/inspector/controls/SegmentedControl.vue'
import { label, section, segment } from '@/components/editor/inspector/controls/styles'
import TextSection from './TextSection.vue'
import { useTableControls } from './useTableControls'

const { t } = useI18n()

const props = defineProps<{ presentation: Presentation }>()

const { table, cell, palette, textTarget, structure, hold, cellBackground, alignment, cellColor, setAlignment } = useTableControls(() => props.presentation)

const ALIGNS = [
  { value: 'left', icon: AlignLeft },
  { value: 'center', icon: AlignCenter },
  { value: 'right', icon: AlignRight },
] as const
const alignOptions = computed(() => ALIGNS.map((a) => ({ value: a.value, icon: a.icon, label: t(`editorInspector.element.table.align.${a.value}`) })))

const sub = 'mb-2 mt-4 text-[10px] text-tx-9aa9b0'
</script>

<template>
  <template v-if="table">
    <div :class="section">
      <div :class="label"><h3>{{ t('editorInspector.element.table.title') }}</h3></div>
      <div class="grid grid-cols-6 gap-2">
        <button
          v-for="s in structure"
          :key="s.label"
          type="button"
          :class="[segment, 'disabled:cursor-not-allowed disabled:opacity-40']"
          :aria-label="s.label"
          :title="s.ok ? s.label : s.why"
          :disabled="!s.ok"
          @mousedown.prevent
          @click="s.run()"
        >
          <component :is="s.icon" class="size-4" aria-hidden="true" />
        </button>
      </div>
      <template v-if="cell">
        <div :class="[label, 'mt-5']">
          <h3>{{ t('editorInspector.element.table.cell') }}</h3>
        </div>
        <ColorField :model-value="cellColor" :palette="palette" :label="t('editorInspector.element.table.cellBackground')" allow-none @open="hold" @commit="cellBackground" />
        <div :class="sub">{{ t('editorInspector.element.table.alignment') }}</div>
        <SegmentedControl :model-value="alignment" :options="alignOptions" :label="t('editorInspector.element.table.cellAlignment')" @update:model-value="setAlignment" />
      </template>
    </div>
    <TextSection :presentation="props.presentation" :target="textTarget" />
  </template>
</template>
