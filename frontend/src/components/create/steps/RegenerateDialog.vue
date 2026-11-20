<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

/** Confirms unlocking the outline of a deck that already has slides: generating again replaces them all. */
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ confirm: [] }>()

function confirm() {
  open.value = false
  emit('confirm')
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Regenerate slides from the outline?</DialogTitle>
        <DialogDescription>Regenerating replaces every slide. Slide edits, narration and avatars will be lost.</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" @click="open = false">Cancel</Button>
        <Button variant="destructive" @click="confirm">Regenerate slides</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
