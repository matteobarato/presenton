<script setup lang="ts">
import { computed } from 'vue'
import { Check, Languages, UserRound } from 'lucide-vue-next'
import TtsLanguageSelect from '@/components/editor/inspector/narration/TtsLanguageSelect.vue'
import { injectDeckNarration } from '@/components/editor/inspector/narration/useDeckNarration'
import PortraitHero from '@/components/editor/inspector/video/PortraitHero.vue'
import { injectDeckAvatars } from '@/components/editor/inspector/video/useDeckAvatars'

/**
 * Step 2 of a created deck: the narration language and the presenter photo, editable. Generation (Narration
 * step) only reads them. Locked while a narration run is going, because it uses both.
 */
const props = defineProps<{ running: boolean; languageOk: boolean; avatarWork: boolean }>()

const narration = injectDeckNarration()
const avatars = injectDeckAvatars()
const { languages, language, setLanguage } = narration
const { videos, portraitMut } = avatars
const portraitOk = computed(() => Boolean(videos.value?.portrait))
const running = computed(() => props.running)
const languageOk = computed(() => props.languageOk)
const avatarWork = computed(() => props.avatarWork)
</script>

<template>
    <div class="mx-auto flex w-full max-w-[720px] flex-col gap-3" data-testid="avatar-setup">
      <!-- Language: one full-width row -->
      <section
        class="flex items-center gap-3 rounded-card border border-white/[0.06] bg-white/[0.015] px-4 py-3 max-[560px]:flex-col max-[560px]:items-stretch"
        data-testid="setup-language"
        :data-ok="String(languageOk)"
      >
        <div class="flex min-w-0 flex-1 items-center gap-2.5">
          <span class="grid size-8 flex-none place-items-center rounded-full bg-accent/10 text-accent"><Languages class="size-4" aria-hidden="true" /></span>
          <div class="flex min-w-0 flex-col">
            <h3 class="text-[13px] font-semibold text-[#f6f8f9]">Language</h3>
            <span class="text-[11px] text-muted">The voice speaks in this language</span>
          </div>
        </div>
        <div class="flex w-[260px] flex-none items-center gap-2 max-[560px]:w-full">
          <div class="min-w-0 flex-1">
            <TtsLanguageSelect :languages="languages ?? []" :model-value="language" :disabled="running" @update:model-value="setLanguage" />
          </div>
          <Check v-if="languageOk" class="size-4 flex-none text-accent" role="img" aria-label="Done" />
        </div>
      </section>

      <!-- Avatar: the big card -->
      <section
        v-if="avatarWork"
        class="flex flex-col gap-4 rounded-card border border-white/[0.06] bg-white/[0.015] p-5"
        data-testid="setup-portrait"
        :data-ok="String(portraitOk)"
      >
        <div class="flex items-center gap-2.5">
          <span class="grid size-8 flex-none place-items-center rounded-full bg-accent/10 text-accent"><UserRound class="size-4" aria-hidden="true" /></span>
          <div class="flex flex-col">
            <h3 class="text-[13px] font-semibold text-[#f6f8f9]">Avatar</h3>
            <span class="text-[11px] text-muted">{{ portraitOk ? 'Your presenter for this deck' : 'Add a photo of your presenter' }}</span>
          </div>
          <Check v-if="portraitOk" class="ml-auto size-4 text-accent" role="img" aria-label="Done" />
        </div>
        <PortraitHero
          class="mx-auto w-full max-w-[380px]"
          :portrait="videos?.portrait"
          :busy="running || portraitMut.isPending.value"
          @upload="portraitMut.mutate($event)"
          @remove="portraitMut.mutate(null)"
        />
      </section>
    </div>
</template>
