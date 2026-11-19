<script setup lang="ts">
import { Check, ChevronRight } from 'lucide-vue-next'

export interface StepItem {
  key: string
  label: string
  /** What the step currently holds, shown under its label. */
  value: string
  done: boolean
}

/** The create journey: three free-to-visit steps on this page, then what happens next. */
defineProps<{ steps: StepItem[]; disabled?: boolean }>()
const current = defineModel<number>({ required: true })
</script>

<template>
  <nav aria-label="Create steps" class="flex items-stretch gap-1.5 max-[760px]:gap-1">
    <ol class="flex min-w-0 flex-1 items-stretch gap-1.5 max-[760px]:gap-1">
      <li v-for="(s, i) in steps" :key="s.key" class="flex min-w-0 flex-1">
        <button
          type="button"
          :aria-current="current === i ? 'step' : undefined"
          :disabled="disabled"
          :data-testid="`step-${s.key}`"
          class="group relative flex min-w-0 flex-1 items-center gap-3 overflow-hidden rounded-card border px-3.5 py-3 text-left transition-[background,border-color] duration-200 max-[760px]:gap-2 max-[760px]:px-2.5 max-[760px]:py-2.5"
          :class="current === i ? 'border-[#bee3f347] bg-[#bee3f30f]' : 'border-white/[0.06] bg-white/[0.015] hover:border-white/[0.12] hover:bg-white/[0.035]'"
          @click="current = i"
        >
          <span
            class="grid size-[26px] flex-none place-items-center rounded-full text-[11px] font-semibold tabular-nums transition-colors duration-200 max-[760px]:size-[22px] max-[760px]:text-[10px]"
            :class="
              current === i
                ? 'bg-accent text-accent-ink'
                : s.done
                  ? 'bg-[#bee3f324] text-accent'
                  : 'border border-white/[0.14] text-[#a5b3ba]'
            "
            aria-hidden="true"
          >
            <Check v-if="s.done && current !== i" class="size-3.5" />
            <template v-else>{{ i + 1 }}</template>
          </span>
          <span class="flex min-w-0 flex-col">
            <span class="text-[12px] font-semibold" :class="current === i ? 'text-[#eef6fa]' : 'text-[#c9d5db]'">{{ s.label }}</span>
            <span class="truncate text-[10.5px] text-[#8e9ca4] max-[760px]:hidden">{{ s.value }}</span>
          </span>
          <span
            v-if="current === i"
            class="absolute inset-x-3 bottom-0 h-[2px] rounded-full bg-accent"
            aria-hidden="true"
          />
        </button>
      </li>
    </ol>
    <p class="flex flex-none items-center gap-1 pl-2 text-[11px] text-[#76848c] max-[1050px]:hidden">
      <span class="sr-only">After this page:</span>
      <ChevronRight class="size-3.5" aria-hidden="true" />
      <span>Outline</span>
      <ChevronRight class="size-3.5" aria-hidden="true" />
      <span>Slides</span>
    </p>
  </nav>
</template>
