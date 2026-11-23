<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const open = defineModel<boolean>('open', { required: true })
defineProps<{ title: string }>()
defineEmits<{ confirm: [] }>()
const { t } = useI18n()
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ t('library.deleteDeck.title') }}</DialogTitle>
        <DialogDescription>{{ t('library.deleteDeck.description', { title }) }}</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="ghost" @click="open = false">{{ t('common.actions.cancel') }}</Button>
        <Button variant="destructive" @click="$emit('confirm')">{{ t('common.actions.delete') }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
