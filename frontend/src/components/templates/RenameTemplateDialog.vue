<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

const open = defineModel<boolean>('open', { required: true })
const props = defineProps<{ name: string; pending?: boolean }>()
const emit = defineEmits<{ submit: [name: string] }>()

const draft = ref(props.name)
watch(open, (isOpen) => {
  if (isOpen) draft.value = props.name
})

const trimmed = computed(() => draft.value.trim())
const canSave = computed(() => !props.pending && !!trimmed.value && trimmed.value !== props.name)

function submit() {
  if (canSave.value) emit('submit', trimmed.value)
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <form class="grid gap-4" @submit.prevent="submit">
        <DialogHeader>
          <DialogTitle>Rename template</DialogTitle>
          <DialogDescription>Choose a new name for this template.</DialogDescription>
        </DialogHeader>
        <Input v-model="draft" aria-label="Template name" autocomplete="off" />
        <DialogFooter>
          <Button type="button" variant="ghost" @click="open = false">Cancel</Button>
          <Button type="submit" :disabled="!canSave">Save</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
