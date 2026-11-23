<script lang="ts">
import { ref } from 'vue'

// Colours committed this session, newest first (shared by every ColorField).
const recent = ref<string[]>([])
</script>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { field, label as labelClass } from './styles'

const props = defineProps<{ modelValue: string | null; palette: string[]; label: string; allowNone?: boolean }>()
const emit = defineEmits<{ open: []; close: []; commit: [value: string | null] }>()

const HEX = /^#[0-9a-f]{6}$/i
const open = ref(false)
const draft = ref<string | null>(props.modelValue)
const hexText = ref(props.modelValue ?? '')
let committed = false
// The value the popover opened on; the selection may change while it is open.
let openedWith: string | null = null
const norm = (v: string | null) => (v ? v.toLowerCase() : null)

const current = computed(() => (props.modelValue && HEX.test(props.modelValue) ? props.modelValue.toLowerCase() : null))

function setDraft(value: string | null) {
  draft.value = value
  hexText.value = value ?? ''
}

watch(open, (isOpen) => {
  if (isOpen) {
    committed = false
    openedWith = props.modelValue
    setDraft(props.modelValue)
    emit('open')
    return
  }
  if (!committed && norm(draft.value) !== norm(openedWith)) done(draft.value)
  emit('close')
})

function done(value: string | null) {
  committed = true
  if (value) recent.value = [value, ...recent.value.filter((c) => c !== value)].slice(0, 8)
  emit('commit', value)
}

function pick(value: string | null) {
  if (committed) return
  done(value)
  setDraft(value)
  open.value = false
}

function onHex(event: Event) {
  const text = (event.target as HTMLInputElement).value.trim()
  hexText.value = text
  const withHash = text.startsWith('#') ? text : `#${text}`
  if (HEX.test(withHash)) draft.value = withHash.toLowerCase()
}

function onNative(event: Event) {
  setDraft((event.target as HTMLInputElement).value.toLowerCase())
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <button type="button" :class="[field, 'w-full cursor-pointer']" :aria-label="label">
        <span
          class="size-4 shrink-0 rounded-full border border-ov/20"
          :class="!current && 'bg-[linear-gradient(135deg,transparent_45%,#e5484d_45%,#e5484d_55%,transparent_55%)]'"
          :style="current ? { background: current } : undefined"
        />
        <span class="truncate">{{ current ?? 'None' }}</span>
      </button>
    </PopoverTrigger>
    <PopoverContent class="w-[220px] p-3" data-inline-edit-ignore="true">
      <div class="flex flex-wrap items-center gap-2.5">
        <button
          v-if="allowNone"
          type="button"
          class="size-6 rounded-full border border-ov/20 bg-[linear-gradient(135deg,transparent_45%,#e5484d_45%,#e5484d_55%,transparent_55%)]"
          aria-label="None"
          @click="pick(null)"
        />
        <button
          v-for="c in palette"
          :key="c"
          type="button"
          class="size-6 rounded-full border-0 outline outline-1 outline-offset-[3px] transition-transform hover:-translate-y-0.5"
          :class="c === current ? 'outline-lx-a9c2ce' : 'outline-transparent'"
          :style="{ background: c }"
          :aria-label="c"
          @click="pick(c)"
        />
      </div>
      <template v-if="recent.length">
        <div :class="[labelClass, 'mb-2 mt-4']"><h3>Recent</h3></div>
        <div class="flex flex-wrap items-center gap-2.5">
          <button
            v-for="c in recent"
            :key="c"
            type="button"
            class="size-6 rounded-full border-0 outline outline-1 outline-offset-[3px] outline-transparent transition-transform hover:-translate-y-0.5"
            :style="{ background: c }"
            :aria-label="c"
            @click="pick(c)"
          />
        </div>
      </template>
      <div class="mt-4 flex items-center gap-2">
        <input
          type="color"
          :aria-label="`${label} picker`"
          class="size-8 shrink-0 cursor-pointer rounded-control border-0 bg-transparent p-0"
          :value="draft ?? '#000000'"
          @input="onNative"
        />
        <label :class="[field, 'flex-1']">
          <input
            type="text"
            :aria-label="`${label} hex`"
            maxlength="7"
            class="h-full w-full min-w-0 bg-transparent text-[10px] text-tx-dce3e7 outline-none"
            :value="hexText"
            @input="onHex"
          />
        </label>
      </div>
    </PopoverContent>
  </Popover>
</template>
