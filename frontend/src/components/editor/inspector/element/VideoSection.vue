<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed } from 'vue'
import { Film } from 'lucide-vue-next'
import type { Slide } from '@/api/types'
import { useSlideVideo } from '@/api/videos'
import SlideAvatarSection from '../video/SlideAvatarSection.vue'

const { t } = useI18n()

/** The avatar placeholder's video, previewed. Shows this slide's card state with its generate and upload buttons. */
const props = defineProps<{ presentationId: string; slide: Slide | null }>()

const { video, src, isPending } = useSlideVideo(() => props.presentationId, () => props.slide?.id)
const name = computed(() =>
  video.value ? video.value.original_filename || (video.value.source === 'heygen' ? t('editorInspector.element.video.generatedAvatar') : t('editorInspector.element.video.uploaded')) : null,
)
</script>

<template>
  <div class="border-t border-line py-[18px] min-[1600px]:py-[22px]" data-testid="element-video">
    <div class="mb-3 flex items-center justify-between text-[10px] font-medium text-tx-d0d7dc min-[1600px]:text-[11px]">
      <h3>{{ t('editorInspector.element.video.title') }}</h3>
      <span v-if="name" class="truncate pl-2 text-[9px] font-normal text-tx-9aa9b0">{{ name }}</span>
    </div>
    <video
      v-if="src"
      :key="src"
      :src="src"
      controls
      muted
      playsinline
      preload="metadata"
      class="aspect-video w-full rounded-control bg-black object-contain"
      :aria-label="t('editorInspector.element.video.preview')"
    />
    <div
      v-else
      class="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-control border border-dashed border-ov/[0.08] bg-field px-4 text-center text-[10px] leading-[1.5] text-tx-9aa9b0"
    >
      <Film class="size-5" aria-hidden="true" />
      <span v-if="isPending">{{ t('editorInspector.element.video.loading') }}</span>
      <span v-else>{{ t('editorInspector.element.video.empty') }}</span>
    </div>
    <SlideAvatarSection v-if="slide" :slide="slide" class="mt-3" />
  </div>
</template>
