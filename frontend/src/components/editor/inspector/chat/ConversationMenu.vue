<script setup lang="ts">
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
        <Button variant="ghost" size="sm" aria-label="Conversations"><History class="size-3.5" />Conversations</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" class="w-64">
        <DropdownMenuItem data-testid="new-conversation" @select="emit('new')"><Plus class="size-3.5" />New conversation</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel v-if="!conversations.length">No past conversations</DropdownMenuLabel>
        <DropdownMenuItem
          v-for="c in conversations"
          :key="c.conversation_id"
          :data-current="c.conversation_id === currentId || undefined"
          class="flex-col items-start gap-0"
          @select="emit('select', c.conversation_id)"
        >
          <span class="w-full truncate">{{ c.last_message_preview || 'Empty conversation' }}</span>
          <span v-if="c.updated_at" class="text-[10px] text-muted">{{ relativeTime(c.updated_at) }}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <Button
      v-if="currentId"
      variant="ghost"
      size="sm"
      aria-label="Delete conversation"
      data-testid="delete-conversation"
      @click="confirmId = currentId"
    >
<Trash2 class="size-3.5" />
</Button>

    <Dialog :open="confirmId !== null" @update:open="(o: boolean) => !o && (confirmId = null)">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this conversation?</DialogTitle>
          <DialogDescription>The messages are removed permanently. Slides are not affected.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="secondary" @click="confirmId = null">Cancel</Button>
          <Button variant="destructive" data-testid="confirm-delete" @click="confirmDelete">Delete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
