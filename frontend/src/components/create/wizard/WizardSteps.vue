<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, useId } from 'vue'
import { Check, ChevronDown, Loader2 } from 'lucide-vue-next'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { WizardStepItem, WizardStepKey } from './progress'
const { t } = useI18n()

/**
 * The six-step journey, as a compact row of header buttons (it lives in the app top bar). A locked step never
 * selects: it emits `blocked` so the host can show its reason. Under 1280px only the open step keeps its label; under
 * 760px the row collapses into one "3/6 · Outline" button that opens the same list as a menu.
 */
const props = defineProps<{ items: WizardStepItem[]; current: WizardStepKey; disabled?: boolean }>()
const emit = defineEmits<{ select: [key: WizardStepKey]; blocked: [item: WizardStepItem] }>()

const index = computed(() => Math.max(0, props.items.findIndex((i) => i.key === props.current)))
const currentItem = computed(() => props.items[index.value])

/** The old step bar's glass tile, compacted to the header's height. */
const tile =
  'inline-flex h-[40px] flex-none items-center gap-2 rounded-card border px-2.5 text-[12px] font-semibold whitespace-nowrap transition-[background,border-color] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

const uid = useId()
const reasonId = (key: WizardStepKey) => `${uid}-reason-${key}`
const stateText = (state: WizardStepItem['state']) => (state === 'done' ? t('create.stepState.completed') : state === 'running' ? t('create.stepState.inProgress') : '')

function pick(item: WizardStepItem) {
  if (props.disabled) return
  // A locked step says why in the footer; the tooltip alone would never reach touch or keyboard users.
  if (item.state === 'locked') return void emit('blocked', item)
  emit('select', item.key)
}
const tip = (s: WizardStepItem) => (s.state === 'locked' ? (s.reason ?? undefined) : s.summary ? `${s.label}: ${s.summary}` : s.label)
</script>

<template>
  <nav :aria-label="t('create.wizard.stepsAria')" class="flex-none">
    <!-- Phone: one button, the full list in a menu. -->
    <DropdownMenu>
      <DropdownMenuTrigger
        data-testid="steps-compact"
        :class="cn(tile, 'relative hidden max-[759px]:inline-flex max-[759px]:h-11', 'border-lx-bee3f347 bg-sx-bee3f30f text-tx-eef6fa')"
        :aria-label="t('create.wizard.stepsAria')"
      >
        <span class="tabular-nums">{{ index + 1 }}/{{ items.length }}</span>
        <span aria-hidden="true">·</span>
        <span>{{ currentItem?.label }}</span>
        <ChevronDown class="size-3.5" aria-hidden="true" />
        <!-- Progress at a glance: one segment per step, done ones filled. -->
        <span class="pointer-events-none absolute inset-x-2.5 bottom-0 flex gap-[3px]" aria-hidden="true" data-testid="steps-compact-track">
          <span v-for="s in items" :key="s.key" class="h-[2px] flex-1 rounded-full" :class="s.key === current ? 'bg-accent' : s.state === 'done' ? 'bg-accent/65' : 'bg-ov/[0.1]'" />
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" class="max-h-[var(--reka-dropdown-menu-content-available-height)] max-w-[calc(100vw-1.5rem)] min-w-52 overflow-y-auto">
        <DropdownMenuItem
          v-for="(s, i) in items"
          :key="s.key"
          :data-testid="`menu-step-${s.key}`"
          :aria-current="s.key === current ? 'step' : undefined"
          :aria-disabled="s.state === 'locked' ? 'true' : undefined"
          :class="cn('min-h-11 gap-2.5 py-2.5 text-[13px]', s.state === 'locked' && 'opacity-60', s.key === current && 'text-accent')"
          @select="pick(s)"
        >
          <span class="grid size-5 flex-none place-items-center text-[12px] tabular-nums" aria-hidden="true">
            <Loader2 v-if="s.state === 'running'" class="size-3.5 animate-spin motion-reduce:animate-none" />
            <Check v-else-if="s.state === 'done'" class="size-3.5 text-accent" />
            <template v-else>{{ i + 1 }}</template>
          </span>
          <span class="flex min-w-0 flex-col">
            <span class="font-semibold">{{ s.label }}</span>
            <span v-if="s.summary && s.state !== 'locked'" class="text-[12px] font-normal break-words text-tx-9aabb4">{{ s.summary }}</span>
            <span v-else-if="s.state === 'locked' && s.reason" class="text-[12px] font-normal text-tx-9aabb4">{{ s.reason }}</span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>

    <ol class="flex items-center gap-3 max-[1279px]:gap-2 max-[759px]:hidden">
      <li v-for="(s, i) in items" :key="s.key" class="relative flex">
        <button
          type="button"
          :aria-current="s.key === current ? 'step' : undefined"
          :aria-disabled="s.state === 'locked' ? 'true' : undefined"
          :disabled="disabled"
          :title="tip(s)"
          :aria-describedby="s.state === 'locked' && s.reason ? reasonId(s.key) : undefined"
          :data-testid="`step-${s.key}`"
          :data-state="s.state"
          :class="
            cn(
              tile,
              'relative overflow-hidden',
              s.key === current ? 'border-lx-bee3f347 bg-sx-bee3f30f text-tx-eef6fa' : s.state === 'done' ? 'border-lx-bee3f31f bg-ov/[0.015] text-tx-dbe8ee' : 'border-ov/[0.06] bg-ov/[0.015] text-tx-c9d5db',
              s.state === 'locked' ? 'cursor-not-allowed opacity-55' : s.key !== current && 'hover:border-ov/[0.12] hover:bg-ov/[0.035]',
            )
          "
          @click="pick(s)"
        >
          <span
            class="grid size-[22px] flex-none place-items-center rounded-full text-[12px] leading-none font-semibold tabular-nums transition-colors duration-200"
            :class="s.key === current ? 'bg-accent text-accent-ink' : s.state === 'done' ? 'border border-lx-bee3f373 bg-sx-bee3f333 text-accent' : 'border border-ov/[0.14] text-tx-a5b3ba'"
            aria-hidden="true"
          >
            <Loader2 v-if="s.state === 'running'" data-icon="spinner" class="size-3.5 animate-spin motion-reduce:animate-none" />
            <Check v-else-if="s.state === 'done'" data-icon="check" class="size-3.5" />
            <template v-else>{{ i + 1 }}</template>
          </span>
          <span :class="s.key !== current && 'max-[1279px]:sr-only'">{{ s.label }}</span>
          <span v-if="stateText(s.state)" class="sr-only" :data-testid="`step-${s.key}-state`">({{ stateText(s.state) }})</span>
          <!-- Summaries live in the tooltip and for screen readers, not in the bar. -->
          <span v-if="s.summary" class="sr-only">{{ s.summary }}</span>
          <span v-if="s.key === current" class="absolute inset-x-2.5 bottom-0 h-[2px] rounded-full bg-accent" data-testid="step-underline" aria-hidden="true" />
        </button>
        <!-- A link into this step from the previous one: accent once the previous step is done and this one is done or open. -->
        <span
          v-if="i > 0"
          class="pointer-events-none absolute top-1/2 right-full h-0.5 w-3 -translate-y-1/2 rounded-full max-[1279px]:w-2"
          :class="items[i - 1]!.state === 'done' && (s.state === 'done' || s.key === current) ? 'bg-accent/65' : 'bg-ov/[0.1]'"
          :data-testid="`step-link-${s.key}`"
          aria-hidden="true"
        />
        <span v-if="s.state === 'locked' && s.reason" :id="reasonId(s.key)" class="sr-only">{{ s.reason }}</span>
      </li>
    </ol>
  </nav>
</template>
