<script setup lang="ts">
import { computed, useId } from 'vue'
import { Check, Loader2, Lock } from 'lucide-vue-next'
import { Progress } from '@/components/ui/progress'
import type { WizardStepItem, WizardStepKey } from './progress'

/** The seven-step journey bar. Locked steps explain themselves and never emit. */
const props = defineProps<{ items: WizardStepItem[]; current: WizardStepKey; disabled?: boolean }>()
const emit = defineEmits<{ select: [key: WizardStepKey] }>()

const index = computed(() => Math.max(0, props.items.findIndex((i) => i.key === props.current)))
const currentItem = computed(() => props.items[index.value])
const percent = computed(() => Math.round(((index.value + 1) / Math.max(1, props.items.length)) * 100))

const uid = useId()
const reasonId = (key: WizardStepKey) => `${uid}-reason-${key}`
const STATE_TEXT: Partial<Record<WizardStepItem['state'], string>> = { done: 'Completed', running: 'In progress' }

const BADGE = 'rounded-full border border-white/[0.12] px-1.5 py-px text-[9.5px] leading-[1.4] whitespace-nowrap text-[#a9c4d2]'

function pick(item: WizardStepItem) {
  if (props.disabled || item.state === 'locked') return
  emit('select', item.key)
}
</script>

<template>
  <nav aria-label="Create steps">
    <div data-testid="steps-compact" class="hidden flex-col gap-2 max-[519px]:flex">
      <p class="text-[12px] font-semibold text-[#e4ecf0]">Step {{ index + 1 }} of {{ items.length }} · {{ currentItem?.label }}</p>
      <Progress :model-value="percent" class="h-1" aria-label="Create progress" />
    </div>
    <ol class="flex min-w-0 items-stretch gap-1.5 max-[1050px]:gap-1 max-[519px]:hidden">
      <li v-for="(s, i) in items" :key="s.key" class="flex min-w-0" :class="s.key === current ? 'flex-[2_1_0%]' : 'flex-1'">
        <button
          type="button"
          :aria-current="s.key === current ? 'step' : undefined"
          :aria-disabled="s.state === 'locked' ? 'true' : undefined"
          :disabled="disabled"
          :title="s.state === 'locked' ? (s.reason ?? undefined) : undefined"
          :aria-describedby="s.state === 'locked' && s.reason ? reasonId(s.key) : undefined"
          :data-testid="`step-${s.key}`"
          :data-state="s.state"
          class="group relative flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden rounded-card border px-3 py-2.5 text-left transition-[background,border-color] duration-200"
          :class="[
            s.key === current ? 'border-[#bee3f347] bg-[#bee3f30f]' : 'border-white/[0.06] bg-white/[0.015]',
            s.state === 'locked' ? 'cursor-not-allowed opacity-55' : s.key !== current && 'hover:border-white/[0.12] hover:bg-white/[0.035]',
          ]"
          @click="pick(s)"
        >
          <span
            class="grid size-[24px] flex-none place-items-center rounded-full text-[11px] font-semibold tabular-nums transition-colors duration-200"
            :class="
              s.key === current
                ? 'bg-accent text-accent-ink'
                : s.state === 'done'
                  ? 'bg-[#bee3f324] text-accent'
                  : 'border border-white/[0.14] text-[#a5b3ba]'
            "
            aria-hidden="true"
          >
            <Loader2 v-if="s.state === 'running'" data-icon="spinner" class="size-3.5 animate-spin motion-reduce:animate-none" />
            <Check v-else-if="s.state === 'done'" data-icon="check" class="size-3.5" />
            <Lock v-else-if="s.state === 'locked'" data-icon="lock" class="size-3" />
            <template v-else>{{ i + 1 }}</template>
          </span>
          <span class="flex min-w-0 flex-col" :class="s.key !== current && 'max-[1050px]:sr-only'">
            <span class="flex min-w-0 items-center gap-1.5">
              <span class="truncate text-[12px] font-semibold" :class="s.key === current ? 'text-[#eef6fa]' : 'text-[#c9d5db]'">{{ s.label }}</span>
              <span v-if="STATE_TEXT[s.state]" class="sr-only" :data-testid="`step-${s.key}-state`">({{ STATE_TEXT[s.state] }})</span>
              <!-- Under 1050px only the current label shows, so its badge has room beside it. -->
              <span v-if="s.badge" class="hidden flex-none max-[1050px]:inline" :class="BADGE">{{ s.badge }}</span>
            </span>
            <!-- From 1050px the steps share the width: the badge gets the second line, ahead of the summary. -->
            <span v-if="s.badge || s.summary" class="flex min-w-0 items-center gap-1.5 max-[1050px]:hidden">
              <span v-if="s.badge" class="min-w-0 truncate" :class="BADGE" :title="s.badge">{{ s.badge }}</span>
              <span v-if="s.summary" class="min-w-0 truncate text-[10.5px] text-[#8e9ca4]">{{ s.summary }}</span>
            </span>
          </span>
          <span v-if="s.key === current" class="absolute inset-x-3 bottom-0 h-[2px] rounded-full bg-accent" aria-hidden="true" />
        </button>
        <span v-if="s.state === 'locked' && s.reason" :id="reasonId(s.key)" class="sr-only">{{ s.reason }}</span>
      </li>
    </ol>
  </nav>
</template>
