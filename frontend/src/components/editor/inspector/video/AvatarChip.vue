<script setup lang="ts">
import { Badge } from '@/components/ui/badge'
import { CHIP_LABEL, type AvatarChipKind } from './avatar-state'

defineProps<{ kind: AvatarChipKind }>()
const VARIANT: Partial<Record<AvatarChipKind, 'default' | 'secondary' | 'destructive' | 'outline'>> = {
  failed: 'destructive',
  audio_stale: 'destructive',
  video_stale: 'destructive',
  ready: 'default',
  done: 'default',
  uploaded: 'outline',
}
</script>

<template>
  <Badge :variant="VARIANT[kind] ?? 'secondary'" :data-chip="kind">{{ CHIP_LABEL[kind] }}</Badge>
</template>
