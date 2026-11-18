<script setup lang="ts">
import { computed } from 'vue'
import type { Presentation } from '@/api/types'
import { provideDeckNarration, useDeckNarration } from './inspector/narration/useDeckNarration'
import { provideDeckAvatars, useDeckAvatars } from './inspector/video/useDeckAvatars'

/**
 * Renderless: creates the deck's narration state (language, TTS task) and avatar state (portrait, runs) once, so the
 * footer's Voice tab and the inspector's Avatar tab share one instance of each.
 */
const props = defineProps<{ presentationId: string; presentation: Presentation }>()

const idRef = computed(() => props.presentationId)
const deck = computed(() => props.presentation)
const narration = useDeckNarration(idRef, deck)
provideDeckNarration(narration)
provideDeckAvatars(useDeckAvatars(idRef, deck, narration))
</script>

<template>
  <slot />
</template>
