<script setup lang="ts">
// Ported from servers/nextjs/components/CreatableModelInput.tsx
import { computed, ref, useId, watch } from 'vue'
import { Check, ChevronDown } from 'lucide-vue-next'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

const props = defineProps<{ modelValue: string; options: string[]; providerLabel: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const uid = useId()
const triggerId = `model-trigger-${uid}`
const labelId = `model-label-${uid}`
const listId = `model-list-${uid}`

const open = ref(false)
const query = ref('')

// The current value is always listed first; the rest are de-duplicated.
const all = computed(() => Array.from(new Set([props.modelValue, ...props.options].filter(Boolean))))
const trimmed = computed(() => query.value.trim())
const filtered = computed(() => {
  const q = trimmed.value.toLowerCase()
  return q ? all.value.filter((m) => m.toLowerCase().includes(q)) : all.value
})
const custom = computed(() =>
  trimmed.value && !all.value.some((m) => m.toLowerCase() === trimmed.value.toLowerCase()) ? trimmed.value : '',
)

watch(open, (isOpen) => {
  if (isOpen) query.value = ''
})

function select(model: string) {
  emit('update:modelValue', model)
  query.value = ''
  open.value = false
}

function onEnter() {
  const target = custom.value || filtered.value[0]
  if (target) select(target)
}
</script>

<template>
  <div class="min-w-0">
    <label :id="labelId" :for="triggerId" class="mb-2 block text-[12px] font-medium text-tx-dbe7ef">{{ providerLabel }} model ID</label>
    <Popover v-model:open="open">
      <PopoverTrigger as-child>
        <button
          :id="triggerId"
          type="button"
          role="combobox"
          aria-haspopup="listbox"
          :aria-expanded="open"
          :aria-controls="open ? listId : undefined"
          :aria-labelledby="`${labelId} ${triggerId}`"
          class="flex h-[42px] w-full items-center justify-between gap-3 rounded-button border border-transparent bg-field px-3 text-left text-[12px] transition-colors duration-200 hover:border-white/15 focus-visible:border-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span class="min-w-0 flex-1 truncate" :class="modelValue ? 'font-medium text-tx-dce6ec' : 'text-muted'">
            {{ modelValue || 'Select a discovered model or enter any model ID' }}
          </span>
          <ChevronDown class="size-4 shrink-0 text-muted transition-transform" :class="open && 'rotate-180'" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" class="w-[min(460px,calc(100vw-24px))] min-w-(--reka-popover-trigger-width) p-2">
        <Input
          v-model="query"
          type="text"
          placeholder="Search or enter a model ID…"
          aria-label="Search or enter a model ID"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          @keydown.enter.prevent="onEnter"
        />
        <div :id="listId" role="listbox" :aria-label="`${providerLabel} models`" class="mt-2 max-h-60 overflow-y-auto">
          <button
            v-if="custom"
            type="button"
            role="option"
            :aria-selected="false"
            class="flex w-full items-center gap-2 rounded-button px-2.5 py-2 text-left transition-colors hover:bg-white/[0.05] focus-visible:bg-white/[0.05] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
            @click="select(custom)"
          >
            <span class="size-4 shrink-0" aria-hidden="true" />
            <span class="min-w-0 flex-1">
              <span class="block break-all text-[12px] font-medium text-tx-dbe7ef">Use “{{ custom }}”</span>
              <span class="block text-[10px] text-tx-95aab7">Save as a custom model ID</span>
            </span>
          </button>
          <button
            v-for="m in filtered"
            :key="m"
            type="button"
            role="option"
            :aria-selected="m === modelValue"
            class="flex w-full items-center gap-2 rounded-button px-2.5 py-2 text-left transition-colors hover:bg-white/[0.05] focus-visible:bg-white/[0.05] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
            :class="m === modelValue && 'bg-white/[0.04]'"
            @click="select(m)"
          >
            <Check class="size-4 shrink-0 text-accent" :class="m === modelValue ? 'opacity-100' : 'opacity-0'" aria-hidden="true" />
            <span class="min-w-0 flex-1 break-all text-[12px] font-medium text-tx-dbe7ef">{{ m }}</span>
          </button>
          <p v-if="!custom && filtered.length === 0" class="px-3 py-5 text-center text-[12px] text-muted">No discovered models yet.</p>
        </div>
      </PopoverContent>
    </Popover>
    <p class="mt-1.5 text-[10px] text-tx-95aab7">Discovered models are suggestions. Custom aliases and provider-specific model IDs are accepted.</p>
  </div>
</template>
