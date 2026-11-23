<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Badge } from '@/components/ui/badge'
import type { AvatarChipKind } from './avatar-state'

const { t } = useI18n()

defineProps<{ kind: AvatarChipKind }>()
const VARIANT: Partial<Record<AvatarChipKind, 'default' | 'secondary' | 'destructive' | 'outline'>> = {
  failed: 'destructive',
  audio_stale: 'destructive',
  video_stale: 'destructive',
  other_language: 'destructive',
  ready: 'default',
  done: 'default',
  uploaded: 'outline',
}
</script>

<template>
  <Badge :variant="VARIANT[kind] ?? 'secondary'" :data-chip="kind">{{ t(`editorInspector.avatar.chip.${kind}`) }}</Badge>
</template>
