<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const open = defineModel<boolean>('open', { required: true })
defineProps<{ title: string }>()
defineEmits<{ confirm: [] }>()
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Delete presentation?</DialogTitle>
        <DialogDescription>"{{ title }}" and all of its slides will be permanently deleted.</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="ghost" @click="open = false">Cancel</Button>
        <Button variant="destructive" @click="$emit('confirm')">Delete</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
