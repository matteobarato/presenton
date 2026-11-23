<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { MousePointer2 } from 'lucide-vue-next'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useHelpDialog } from '@/composables/useHelpDialog'

const { t } = useI18n()
const { open } = useHelpDialog()
const mod = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'

const groups = computed<{ title: string; rows: { label: string; keys: string[] }[] }[]>(() => [
  {
    title: t('shell.help.editor'),
    rows: [
      { label: t('shell.help.moveSlides'), keys: ['↑', '↓'] },
      { label: t('shell.help.addSlide'), keys: [mod, '↵'] },
      { label: t('shell.help.deleteSlide'), keys: ['Del'] },
      { label: t('shell.help.undo'), keys: [mod, 'Z'] },
      { label: t('shell.help.redo'), keys: [mod, '⇧', 'Z'] },
      { label: t('shell.help.askAi'), keys: [mod, 'K'] },
    ],
  },
  {
    title: t('shell.help.presenting'),
    rows: [
      { label: t('shell.help.nextPrevious'), keys: ['←', '→'] },
      { label: t('shell.help.exit'), keys: ['Esc'] },
    ],
  },
])
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ t('shell.help.title') }}</DialogTitle>
        <DialogDescription>{{ t('shell.help.description') }}</DialogDescription>
      </DialogHeader>
      <div v-for="group in groups" :key="group.title" class="mt-6">
        <h3 class="text-[11px] font-medium text-tx-c5d6e0">{{ group.title }}</h3>
        <dl class="mt-1">
          <div
            v-for="row in group.rows"
            :key="row.label"
            class="flex items-center justify-between border-b border-lx-a7cbe012 py-3 text-[11px] text-tx-c3d4e0 last:border-b-0"
          >
            <dt>{{ row.label }}</dt>
            <dd class="flex items-center gap-1"><kbd v-for="k in row.keys" :key="k">{{ k }}</kbd></dd>
          </div>
        </dl>
      </div>
      <div class="mt-5 flex items-start gap-[13px] rounded-[9px] bg-sx-3449554d px-[13px] py-[15px] text-tx-aec6d7">
        <MousePointer2 class="mt-0.5 size-[18px] shrink-0" aria-hidden="true" />
        <p class="text-[11px] leading-[1.7]">{{ t('shell.help.tip') }}</p>
      </div>
    </DialogContent>
  </Dialog>
</template>
