<script setup lang="ts">
import { computed, type Component } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import { ChevronDown } from 'lucide-vue-next'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '@/components/ui/sheet'

/**
 * One setting on the chip row: a button showing the current value that opens its controls. From 560px it is a popover
 * under the chip; below that a bottom sheet, which has the room for touch targets. The default slot is the controls.
 */
const props = defineProps<{
  /** What the chip is, e.g. "Language". Also the popover's title. */
  label: string
  /** The current value, e.g. "English". */
  value: string
  icon: Component
  /** One line under the title inside the popover. */
  description?: string
  disabled?: boolean
  testid: string
}>()
const open = defineModel<boolean>('open', { default: false })

const compact = useMediaQuery('(max-width: 559px)')
const chip =
  'group inline-flex h-9 max-[559px]:h-11 max-w-full min-w-0 items-center gap-2 rounded-full border border-white/[0.09] bg-white/[0.025] pr-2.5 pl-3 text-left text-[12px] text-tx-d4dee3 transition-[background,border-color] duration-150 hover:border-white/[0.18] hover:bg-white/[0.05] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-40 data-[state=open]:border-lx-bee3f366 data-[state=open]:bg-sx-bee3f30f'
// The button's name says which setting it is, unless the value already does ("Extras: None").
const aria = computed(() => (props.value.startsWith(props.label) ? props.value : `${props.label}: ${props.value}`))
</script>

<template>
  <Sheet v-if="compact" v-model:open="open">
    <SheetTrigger as-child>
      <button type="button" :class="chip" :disabled="disabled" :aria-label="aria" :data-testid="testid">
        <component :is="icon" class="size-3.5 flex-none text-accent" aria-hidden="true" />
        <span class="min-w-0 truncate">{{ value }}</span>
        <ChevronDown class="size-3.5 flex-none text-tx-8e9ca4" aria-hidden="true" />
      </button>
    </SheetTrigger>
    <SheetContent side="bottom" class="gap-4 p-5">
      <div class="flex flex-col gap-1 pr-8">
        <SheetTitle class="text-[15px] tracking-[-0.02em]">{{ label }}</SheetTitle>
        <SheetDescription>{{ description ?? value }}</SheetDescription>
      </div>
      <div class="flex flex-col gap-4" :data-testid="`${testid}-panel`"><slot /></div>
      <!-- Closing in the thumb zone: the X is out of reach at the top. -->
      <div class="sticky -bottom-5 -mx-5 -mb-5 mt-1 bg-inspector px-5 pt-2 pb-5">
        <SheetClose as-child><button type="button" class="h-11 w-full rounded-button bg-accent text-[12px] font-semibold text-accent-ink" data-testid="chip-done">Done</button></SheetClose>
      </div>
    </SheetContent>
  </Sheet>
  <Popover v-else v-model:open="open">
    <PopoverTrigger as-child>
      <button type="button" :class="chip" :disabled="disabled" :aria-label="aria" :data-testid="testid">
        <component :is="icon" class="size-3.5 flex-none text-accent" aria-hidden="true" />
        <span class="min-w-0 truncate">{{ value }}</span>
        <ChevronDown class="size-3.5 flex-none text-tx-8e9ca4 transition-transform duration-150 group-data-[state=open]:rotate-180" aria-hidden="true" />
      </button>
    </PopoverTrigger>
    <PopoverContent
      align="start"
      :side-offset="8"
      :collision-padding="12"
      class="max-h-[min(560px,var(--reka-popover-content-available-height))] w-[min(460px,calc(100vw-24px))] overflow-y-auto"
      :data-testid="`${testid}-panel`"
    >
      <div class="mb-4 flex flex-col gap-0.5">
        <h3 class="text-[13px] font-semibold tracking-[-0.01em] text-tx-eef4f7">{{ label }}</h3>
        <p v-if="description" class="text-[12px] text-tx-8e9ca4">{{ description }}</p>
      </div>
      <slot />
    </PopoverContent>
  </Popover>
</template>
