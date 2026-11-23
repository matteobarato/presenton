<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
const { t } = useI18n()

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
        <DialogTitle>{{ t('create.outline.regenerate.title') }}</DialogTitle>
        <DialogDescription>{{ t('create.outline.regenerate.description') }}</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" @click="open = false">{{ t('common.actions.cancel') }}</Button>
        <Button variant="destructive" @click="confirm">{{ t('create.outline.regenerate.confirm') }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
