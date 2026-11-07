<script setup lang="ts">
import { MousePointer2 } from 'lucide-vue-next'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useHelpDialog } from '@/composables/useHelpDialog'

const { open } = useHelpDialog()
const mod = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'

const groups: { title: string; rows: { label: string; keys: string[] }[] }[] = [
  {
    title: 'Editor',
    rows: [
      { label: 'Move between slides', keys: ['↑', '↓'] },
      { label: 'Add a slide', keys: [mod, '↵'] },
      { label: 'Delete the selected slide', keys: ['Del'] },
      { label: 'Undo a change', keys: [mod, 'Z'] },
      { label: 'Redo a change', keys: [mod, '⇧', 'Z'] },
      { label: 'Open or close Ask AI', keys: [mod, 'K'] },
    ],
  },
  {
    title: 'Presenting',
    rows: [
      { label: 'Next and previous slide', keys: ['←', '→'] },
      { label: 'Exit presentation', keys: ['Esc'] },
    ],
  },
]
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>A little help along the way.</DialogTitle>
        <DialogDescription>Keyboard shortcuts for building and presenting your decks.</DialogDescription>
      </DialogHeader>
      <div v-for="group in groups" :key="group.title" class="mt-6">
        <h3 class="text-[11px] font-medium text-[#c5d6e0]">{{ group.title }}</h3>
        <dl class="mt-1">
          <div
            v-for="row in group.rows"
            :key="row.label"
            class="flex items-center justify-between border-b border-[#a7cbe012] py-3 text-[11px] text-[#c3d4e0] last:border-b-0"
          >
            <dt>{{ row.label }}</dt>
            <dd class="flex items-center gap-1"><kbd v-for="k in row.keys" :key="k">{{ k }}</kbd></dd>
          </div>
        </dl>
      </div>
      <div class="mt-5 flex items-start gap-[13px] rounded-[9px] bg-[#3449554d] px-[13px] py-[15px] text-[#aec6d7]">
        <MousePointer2 class="mt-0.5 size-[18px] shrink-0" aria-hidden="true" />
        <p class="text-[11px] leading-[1.7]">Drag thumbnails by their handle to reorder your story. Ask AI from the floating toolbar to rewrite the slide you are on.</p>
      </div>
    </DialogContent>
  </Dialog>
</template>
