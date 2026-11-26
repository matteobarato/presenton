<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, ref } from 'vue'
import { ChevronDown, Search } from 'lucide-vue-next'
import { useTemplateBlocks } from '@/composables/useTemplateBlocks'
import type { TemplateBlock, TemplateBlockGroup } from '@/slide-editor/insert/templateBlocks'
import BlockThumb from './BlockThumb.vue'
import { muted, section, sectionLabel, tile } from './insertClasses'

const { t } = useI18n()

const props = defineProps<{
  templateId: string | null
  /** The deck's theme and fonts; the template's are the fallback. */
  theme: unknown
  fonts: unknown
  /** Why inserting is off, or null when it is allowed. */
  disabledTitle: string | null
}>()
const emit = defineEmits<{ insert: [variant: TemplateBlock, label: string] }>()

const blocks = useTemplateBlocks(() => props.templateId, true)
const query = ref('')
const expanded = ref<string | null>(null)

const thumbTheme = computed(() => props.theme ?? blocks.theme.value)
const thumbFonts = computed(() => props.fonts ?? blocks.fonts.value)
const filtered = computed<TemplateBlockGroup[]>(() => {
  const q = query.value.trim().toLowerCase()
  const groups = blocks.groups.value
  if (!q) return groups
  return groups.filter((g) => g.title.toLowerCase().includes(q) || g.description.toLowerCase().includes(q))
})
const state = computed(() => {
  if (!props.templateId) return 'none'
  if (blocks.isError.value) return 'error'
  if (blocks.isPending.value) return 'pending'
  return blocks.groups.value.length ? 'ready' : 'none'
})

function toggle(key: string) {
  expanded.value = expanded.value === key ? null : key
}
function insert(variant: TemplateBlock, label: string) {
  if (!props.disabledTitle) emit('insert', variant, label)
}
</script>

<template>
  <div :class="section">
    <div :class="sectionLabel">
      <h3>{{ t('editorInspector.insert.blocks.title') }}</h3>
      <span v-if="state === 'ready'" :class="muted">{{ t('editorInspector.insert.blocks.count', { count: blocks.groups.value.length }) }}</span>
    </div>

    <div v-if="state === 'pending'" class="grid grid-cols-2 gap-2">
      <div v-for="n in 4" :key="n" data-testid="block-skeleton" class="skeleton-shimmer aspect-[16/11] rounded-control" />
    </div>

    <div v-else-if="state === 'error'" class="flex items-center justify-between gap-2 rounded-control border border-ov/[0.06] bg-field px-3 py-2.5">
      <p class="text-[10px] text-tx-a0abb1">{{ t('editorInspector.insert.blocks.loadError') }}</p>
      <button
        type="button"
        class="rounded-control px-2 py-1 text-[10px] font-medium text-tx-c4e4f4 transition-colors duration-150 hover:bg-ov/[0.04]"
        :aria-label="t('editorInspector.insert.blocks.retry')"
        @mousedown.prevent
        @click="blocks.refetch()"
      >
        {{ t('editorInspector.insert.blocks.retry') }}
      </button>
    </div>

    <p v-else-if="state === 'none'" class="text-[10px] leading-[1.6] text-tx-a0abb1">{{ t('editorInspector.insert.blocks.empty') }}</p>

    <template v-else>
      <label class="relative mb-3 block">
        <Search class="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-tx-7d8b92" aria-hidden="true" />
        <input
          v-model="query"
          type="search"
          :aria-label="t('editorInspector.insert.blocks.searchAria')"
          :placeholder="t('editorInspector.insert.blocks.searchPlaceholder')"
          class="h-8 w-full rounded-control border border-ov/[0.06] bg-field pr-2 pl-8 text-[10px] text-tx-d9e6ed placeholder:text-tx-7d8b92 focus:border-accent/50 focus:outline-none"
        />
      </label>
      <p v-if="filtered.length === 0" class="text-[10px] text-tx-a0abb1">{{ t('editorInspector.insert.blocks.noMatch', { query: query.trim() }) }}</p>
      <div class="grid grid-flow-row-dense grid-cols-2 gap-2">
        <template v-for="group in filtered" :key="group.key">
          <div class="relative min-w-0">
            <button
              type="button"
              :class="[tile, 'block w-full overflow-hidden text-left']"
              :aria-label="t('editorInspector.insert.insertItem', { label: group.title })"
              :title="disabledTitle ?? (group.description || group.title)"
              :disabled="!!disabledTitle"
              @mousedown.prevent
              @click="insert(group.variants[0]!, group.title)"
            >
              <BlockThumb :block="group.variants[0]!" :theme="thumbTheme" :fonts="thumbFonts" />
              <span class="block truncate px-2 py-1.5 text-[10px]" :class="group.variants.length > 1 && 'pr-7'">{{ group.title }}</span>
            </button>
            <button
              v-if="group.variants.length > 1"
              type="button"
              class="absolute right-1 bottom-1 inline-flex size-5 items-center justify-center rounded-[4px] text-tx-9aa9b0 transition-colors duration-150 hover:bg-ov/[0.06] hover:text-strong"
              :aria-label="t('editorInspector.insert.blocks.showVariants', { title: group.title })"
              :aria-expanded="expanded === group.key"
              :title="t('editorInspector.insert.blocks.variants', { count: group.variants.length })"
              @mousedown.prevent
              @click="toggle(group.key)"
            >
              <ChevronDown class="size-3.5 transition-transform duration-200" :class="expanded === group.key && 'rotate-180'" aria-hidden="true" />
            </button>
          </div>
          <div
            v-if="expanded === group.key"
            class="col-span-2 grid grid-cols-2 gap-2 rounded-control border border-ov/[0.04] bg-ov/[0.02] p-2 anim-fade-in"
          >
            <button
              v-for="variant in group.variants"
              :key="variant.key"
              type="button"
              :class="[tile, 'block w-full overflow-hidden text-left']"
              :aria-label="t('editorInspector.insert.insertItem', { label: variant.title })"
              :title="disabledTitle ?? variant.title"
              :disabled="!!disabledTitle"
              @mousedown.prevent
              @click="insert(variant, variant.title)"
            >
              <BlockThumb :block="variant" :theme="thumbTheme" :fonts="thumbFonts" />
              <span class="block truncate px-2 py-1 text-[9px]">{{ variant.title }}</span>
            </button>
          </div>
        </template>
      </div>
    </template>
  </div>
</template>
