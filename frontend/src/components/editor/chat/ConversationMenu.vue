<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { ref } from 'vue'
import { History, Plus, Trash2 } from 'lucide-vue-next'
import type { ChatConversation } from '@/api/chat'
import { relativeTime } from '@/lib/relativeTime'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

defineProps<{ conversations: ChatConversation[]; currentId: string | null }>()
const emit = defineEmits<{ select: [id: string]; new: []; delete: [id: string] }>()
const { t } = useI18n()

const confirmId = ref<string | null>(null)
function confirmDelete() {
  if (confirmId.value) emit('delete', confirmId.value)
  confirmId.value = null
}
</script>

<template>
  <div class="flex items-center gap-1">
    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <Button variant="ghost" size="sm" :aria-label="t('editor.chat.conversations.menu')"><History class="size-3.5" />{{ t('editor.chat.conversations.menu') }}</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" class="w-64">
        <DropdownMenuItem data-testid="new-conversation" @select="emit('new')"><Plus class="size-3.5" />{{ t('editor.chat.conversations.new') }}</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel v-if="!conversations.length">{{ t('editor.chat.conversations.none') }}</DropdownMenuLabel>
        <DropdownMenuItem
          v-for="c in conversations"
          :key="c.conversation_id"
          :data-current="c.conversation_id === currentId || undefined"
          class="flex-col items-start gap-0"
          @select="emit('select', c.conversation_id)"
        >
          <span class="w-full truncate">{{ c.last_message_preview || t('editor.chat.conversations.empty') }}</span>
          <span v-if="c.updated_at" class="text-[10px] text-muted">{{ relativeTime(c.updated_at) }}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <Button
      v-if="currentId"
      variant="ghost"
      size="sm"
      :aria-label="t('editor.chat.conversations.deleteAria')"
      data-testid="delete-conversation"
      @click="confirmId = currentId"
    >
      <Trash2 class="size-3.5" />
    </Button>

    <Dialog :open="confirmId !== null" @update:open="(o: boolean) => !o && (confirmId = null)">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ t('editor.chat.conversations.deleteTitle') }}</DialogTitle>
          <DialogDescription>{{ t('editor.chat.conversations.deleteDescription') }}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="secondary" @click="confirmId = null">{{ t('common.actions.cancel') }}</Button>
          <Button variant="destructive" data-testid="confirm-delete" @click="confirmDelete">{{ t('common.actions.delete') }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
