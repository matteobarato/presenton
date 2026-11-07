<script setup lang="ts">
import { ref, watch } from 'vue'
import { ChevronDown, MessageSquare } from 'lucide-vue-next'
import type { Slide } from '@/api/types'
import { useEditorStore } from '@/stores/editor'
import NotesStrip from './NotesStrip.vue'

/** Aera speaker-notes footer of the canvas card: a labelled toggle, collapsed by default. */
defineProps<{ presentationId: string; slide: Slide | null }>()
const editor = useEditorStore()
// Mounted on first open, then kept: the body animates its height instead of popping, and the
// canvas above (and its slide) shrinks with it.
const mounted = ref(editor.notesOpen)
watch(
  () => editor.notesOpen,
  (open) => {
    if (open) mounted.value = true
  },
)
</script>

<template>
  <div class="flex-none rounded-b-panel border-t border-line bg-[#1b1f21] px-4 py-3 max-[760px]:p-3">
    <button
      type="button"
      class="flex w-full items-center gap-2 text-[11px] text-[#c5cdd1] hover:text-white"
      :aria-expanded="editor.notesOpen"
      aria-controls="speaker-notes-body"
      @click="editor.notesOpen = !editor.notesOpen"
    >
      <MessageSquare class="size-3.5 text-[#919fa7]" aria-hidden="true" />
      <span>Speaker notes</span>
      <ChevronDown class="size-3.5 transition-transform duration-200" :class="editor.notesOpen && 'rotate-180'" aria-hidden="true" />
      <span class="ml-auto text-[9px] text-[#97a3aa] max-[1279px]:hidden">Only you can see these</span>
    </button>
    <div id="speaker-notes-body" class="disclosure" :data-state="editor.notesOpen ? 'open' : 'closed'" :inert="!editor.notesOpen">
      <div>
        <div class="pt-2.5">
          <NotesStrip v-if="mounted && slide" :presentation-id="presentationId" :slide="slide" />
        </div>
      </div>
    </div>
  </div>
</template>
