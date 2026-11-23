<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { Check, ChevronDown } from 'lucide-vue-next'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

export interface ProviderOption {
  value: string
  label: string
  description?: string
  icon?: string
}

const props = defineProps<{
  modelValue: string
  options: ProviderOption[]
  placeholder: string
  searchPlaceholder?: string
  label?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const uid = useId()
const triggerId = `provider-trigger-${uid}`
const labelId = `provider-label-${uid}`
const listId = `provider-list-${uid}`

const open = ref(false)
const query = ref('')
const selected = computed(() => props.options.find((o) => o.value === props.modelValue))
const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return props.options
  return props.options.filter((o) => o.label.toLowerCase().includes(q) || (o.description ?? '').toLowerCase().includes(q))
})

watch(open, (isOpen) => {
  if (isOpen) query.value = ''
})

function choose(value: string) {
  emit('update:modelValue', value)
  open.value = false
}
</script>

<template>
  <div class="min-w-0">
    <label v-if="label" :id="labelId" :for="triggerId" class="mb-2 block text-[12px] font-medium text-tx-dbe7ef">{{ label }}</label>
    <Popover v-model:open="open">
      <PopoverTrigger as-child>
        <button
          :id="triggerId"
          type="button"
          role="combobox"
          aria-haspopup="listbox"
          :aria-expanded="open"
          :aria-controls="open ? listId : undefined"
          :aria-labelledby="label ? `${labelId} ${triggerId}` : undefined"
          class="flex h-[42px] w-full items-center justify-between gap-3 rounded-button border border-transparent bg-field px-3 text-left text-[12px] transition-colors duration-200 hover:border-ov/15 focus-visible:border-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span class="flex min-w-0 flex-1 items-center gap-2.5" :class="selected ? 'text-tx-dce6ec' : 'text-muted'">
            <img v-if="selected?.icon" :src="selected.icon" alt="" class="size-5 shrink-0 rounded-[4px] object-contain" />
            <span class="truncate">{{ selected ? selected.label : placeholder }}</span>
          </span>
          <ChevronDown class="size-4 shrink-0 text-muted transition-transform" :class="open && 'rotate-180'" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" class="w-[min(420px,calc(100vw-24px))] min-w-(--reka-popover-trigger-width) p-2">
        <Input v-model="query" type="text" :placeholder="searchPlaceholder ?? 'Search providers'" :aria-label="searchPlaceholder ?? 'Search providers'" autocomplete="off" />
        <div :id="listId" role="listbox" :aria-label="label ?? placeholder" class="mt-2 max-h-64 overflow-y-auto">
          <button
            v-for="o in filtered"
            :key="o.value"
            type="button"
            role="option"
            :aria-selected="o.value === modelValue"
            class="flex w-full items-center gap-2.5 rounded-button px-2.5 py-2 text-left transition-colors hover:bg-ov/[0.05] focus-visible:bg-ov/[0.05] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
            :class="o.value === modelValue && 'bg-ov/[0.04]'"
            @click="choose(o.value)"
          >
            <img v-if="o.icon" :src="o.icon" alt="" class="size-5 shrink-0 rounded-[4px] object-contain" />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-[12px] font-medium text-tx-dbe7ef">{{ o.label }}</span>
              <span v-if="o.description" class="block truncate text-[10px] text-tx-95aab7">{{ o.description }}</span>
            </span>
            <Check class="size-4 shrink-0 text-accent" :class="o.value === modelValue ? 'opacity-100' : 'opacity-0'" aria-hidden="true" />
          </button>
          <p v-if="filtered.length === 0" class="px-3 py-5 text-center text-[12px] text-muted">No provider found.</p>
        </div>
      </PopoverContent>
    </Popover>
  </div>
</template>
