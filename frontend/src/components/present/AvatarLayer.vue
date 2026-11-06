<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  src: string
  rect: { x: number; y: number; width: number; height: number }
  /** Stage-to-screen factor, the same one the slide is drawn with. */
  scale: number
  playing: boolean
}>()

const video = ref<HTMLVideoElement | null>(null)

const style = computed(() => ({
  left: `${props.rect.x * props.scale}px`,
  top: `${props.rect.y * props.scale}px`,
  width: `${props.rect.width * props.scale}px`,
  height: `${props.rect.height * props.scale}px`,
}))

// The avatar is lip-synced to the narration, so it follows the audio's play state.
watch(
  () => [props.playing, props.src] as const,
  ([playing]) => {
    const el = video.value
    if (!el) return
    if (playing) void Promise.resolve(el.play?.()).catch(() => {})
    else el.pause?.()
  },
  { flush: 'post', immediate: true },
)
</script>

<template>
  <!-- Always muted: TTS is the only soundtrack. -->
  <video
    ref="video"
    :key="src"
    :src="src"
    muted
    playsinline
    preload="auto"
    data-avatar
    class="absolute object-cover"
    :style="style"
  />
</template>
