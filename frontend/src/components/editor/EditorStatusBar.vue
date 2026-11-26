<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { Maximize2, Minus, Plus } from 'lucide-vue-next'
import { useEditorStore, ZOOM_MAX, ZOOM_MIN } from '@/stores/editor'

const props = defineProps<{ position: number; total: number; label?: string; editable?: boolean }>()
const emit = defineEmits<{ rename: [name: string] }>()
const draft = ref(props.label ?? '')
watch(() => props.label, (l) => (draft.value = l ?? ''))
function commit(el: HTMLInputElement) {
  const next = draft.value.trim()
  if (!next) draft.value = props.label ?? ''
  else if (next !== props.label) emit('rename', next)
  el.scrollLeft = 0
}
const editor = useEditorStore()
const { t } = useI18n()
const route = useRoute()
const id = computed(() => String(route.params.id ?? ''))
const number = computed(() => String(props.position).padStart(2, '0'))

const btn =
  'grid size-6 place-items-center rounded-control text-muted hover:bg-ov/[0.04] hover:text-strong disabled:opacity-35 disabled:hover:bg-transparent'
</script>

<template>
  <div class="mt-2.5 flex h-7 flex-none items-center justify-between gap-3 px-2 text-[11px] text-tx-99a6ac max-[760px]:px-1 max-[450px]:mt-2">
    <div class="flex min-w-0 items-center gap-1.5 text-tx-b2bfc7">
      <span class="sr-only" aria-live="polite" data-testid="slide-position">{{ t('editor.statusBar.slideOfTotal', { position, total }) }}</span>
      <span class="grid h-6 min-w-6 flex-none place-items-center rounded-control border border-ov/[0.08] px-1.5 text-[10px] font-medium leading-none text-tx-c6d2d8 tabular-nums" aria-hidden="true">
        {{ number }}
      </span>
      <input
        v-if="label"
        v-model="draft"
        type="text"
        :aria-label="t('editor.statusBar.slideName')"
        maxlength="120"
        :disabled="!editable"
        class="h-6 w-[min(320px,40vw)] min-w-0 truncate rounded-control border border-transparent bg-transparent px-2 text-[11px] leading-none text-tx-b2bfc7 hover:border-line focus:border-accent focus:bg-field focus-visible:outline-none disabled:cursor-default disabled:opacity-100 disabled:hover:border-transparent max-[450px]:hidden"
        @blur="commit($event.target as HTMLInputElement)"
        @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
        @keydown.esc.prevent="((draft = label ?? ''), ($event.target as HTMLInputElement).blur())"
      />
    </div>
    <div class="flex flex-none items-center gap-0.5" role="group" :aria-label="t('editor.statusBar.zoom')">
      <button type="button" :class="btn" :disabled="editor.zoom <= ZOOM_MIN" :aria-label="t('editor.statusBar.zoomOut')" @click="editor.setZoom(editor.zoom - 0.1)">
        <Minus class="size-[13px]" aria-hidden="true" />
      </button>
      <button type="button" class="grid h-6 min-w-10 place-items-center rounded-control px-1 text-[11px] leading-none text-tx-b3bfc6 tabular-nums hover:bg-ov/[0.04] hover:text-strong" :title="t('editor.statusBar.fitToCanvas')" @click="editor.setZoom(1)">
        {{ Math.round(editor.zoom * 100) }}%
      </button>
      <button type="button" :class="btn" :disabled="editor.zoom >= ZOOM_MAX" :aria-label="t('editor.statusBar.zoomIn')" @click="editor.setZoom(editor.zoom + 0.1)">
        <Plus class="size-[13px]" aria-hidden="true" />
      </button>
      <span class="mx-1.5 h-3.5 w-px bg-ov/[0.06]" aria-hidden="true" />
      <RouterLink
        :to="{ name: 'present', params: { id }, query: position > 1 ? { from: String(position - 1) } : {} }"
        :class="btn"
        :aria-label="t('editor.statusBar.presentFromSlide')"
        :title="t('editor.statusBar.presentFromSlide')"
      >
        <Maximize2 class="size-[13px]" aria-hidden="true" />
      </RouterLink>
    </div>
  </div>
</template>
