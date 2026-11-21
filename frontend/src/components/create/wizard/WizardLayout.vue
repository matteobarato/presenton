<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import PageHeader from '@/components/shell/PageHeader.vue'
import WizardSteps from './WizardSteps.vue'
import type { WizardStepItem, WizardStepKey } from './progress'

/** Shared shell: header, step bar, heading, step body, sticky footer. */
const props = defineProps<{
  title: string
  heading: string
  lede: string
  items: WizardStepItem[]
  current: WizardStepKey
  /** What re-keys the body (and plays the step transition); defaults to `current`. Keep it steady to keep a body mounted. */
  panelKey?: string
  parent?: { label: string; to: RouteLocationRaw }
}>()
const emit = defineEmits<{ select: [key: WizardStepKey]; blocked: [item: WizardStepItem]; navigate: [dir: 'back' | 'next'] }>()

const headingEl = ref<HTMLElement | null>(null)
watch(
  () => props.current,
  async () => {
    await nextTick()
    headingEl.value?.focus({ preventScroll: true })
  },
)

function typing(el: Element | null) {
  if (!(el instanceof HTMLElement)) return false
  return el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT'
}
function onKey(e: KeyboardEvent) {
  if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
  if (typing(document.activeElement) || typing(e.target as Element | null)) return
  e.preventDefault()
  emit('navigate', e.key === 'ArrowLeft' ? 'back' : 'next')
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <PageHeader :title="title" :parent="parent">
    <template #center>
      <WizardSteps :items="items" :current="current" @select="emit('select', $event)" @blocked="emit('blocked', $event)" />
    </template>
  </PageHeader>
  <section class="workspace-card">
    <div class="mx-auto flex min-h-full w-full max-w-[880px] flex-col">
      <div class="relative flex-1">
        <Transition name="step-panel">
          <section :key="panelKey ?? current" class="flex flex-col gap-5">
            <header>
              <h2
                ref="headingEl"
                tabindex="-1"
                class="text-[22px] leading-[1.22] font-medium tracking-[-0.03em] text-balance text-[#e4ecf0] outline-none max-[760px]:text-[19px]"
              >
                {{ heading }}
              </h2>
              <p class="mt-[9px] max-w-[60ch] text-[12px] leading-[1.7] text-[#9aabb4]">{{ lede }}</p>
            </header>
            <slot />
          </section>
        </Transition>
      </div>

      <slot name="footer" />
    </div>
  </section>
</template>
