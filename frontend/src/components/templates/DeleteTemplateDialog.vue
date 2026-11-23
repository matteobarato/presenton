<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const open = defineModel<boolean>('open', { required: true })
defineProps<{ name: string; pending?: boolean }>()
defineEmits<{ confirm: [] }>()
const { t } = useI18n()
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ t('templates.deleteTemplate.title') }}</DialogTitle>
        <DialogDescription>{{ t('templates.deleteTemplate.description', { name }) }}</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="ghost" @click="open = false">{{ t('common.actions.cancel') }}</Button>
        <Button variant="destructive" :disabled="pending" @click="$emit('confirm')">{{ t('common.actions.delete') }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
