<script setup lang="ts">
import { ref } from 'vue'
import { ChevronDown } from 'lucide-vue-next'
import type { VideoRequest } from '@/api/exports'
import type { TtsLanguage } from '@/api/tts'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

const form = defineModel<VideoRequest>({ required: true })
defineProps<{ languages: TtsLanguage[]; disabled?: boolean }>()

const advanced = ref(false)
const RESOLUTIONS = ['720p', '1080p', '1440p']
const SUBTITLES = [
  { value: 'soft', label: 'Soft (toggle in player)' },
  { value: 'burned', label: 'Burned into video' },
  { value: 'none', label: 'None' },
]

function num(v: string | number): number | null {
  if (v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-col gap-1.5">
      <Label for="mp4-language">Language</Label>
      <Select v-model="form.language" :disabled="disabled">
        <SelectTrigger id="mp4-language" data-testid="mp4-language"><SelectValue placeholder="Choose a language" /></SelectTrigger>
        <SelectContent>
          <SelectItem v-for="l in languages" :key="l.code" :value="l.code">{{ l.name }}</SelectItem>
        </SelectContent>
      </Select>
    </div>
    <div class="flex flex-col gap-1.5">
      <Label for="mp4-resolution">Resolution</Label>
      <Select v-model="form.resolution as string" :disabled="disabled">
        <SelectTrigger id="mp4-resolution" data-testid="mp4-resolution"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem v-for="r in RESOLUTIONS" :key="r" :value="r">{{ r }}</SelectItem>
        </SelectContent>
      </Select>
    </div>
    <div class="flex flex-col gap-1.5">
      <Label for="mp4-subtitles">Subtitles</Label>
      <Select v-model="form.subtitles as string" :disabled="disabled">
        <SelectTrigger id="mp4-subtitles" data-testid="mp4-subtitles"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem v-for="s in SUBTITLES" :key="s.value" :value="s.value">{{ s.label }}</SelectItem>
        </SelectContent>
      </Select>
    </div>
    <div class="flex items-center justify-between">
      <Label for="mp4-avatars">Avatars</Label>
      <Switch id="mp4-avatars" v-model="form.avatars" :disabled="disabled" data-testid="mp4-avatars" />
    </div>

    <button
      type="button"
      class="flex items-center gap-1 self-start text-[11px] text-muted hover:text-[#f6f8f9]"
      :aria-expanded="advanced"
      data-testid="mp4-advanced-toggle"
      @click="advanced = !advanced"
    >
      <ChevronDown :size="13" :class="{ '-rotate-90': !advanced }" class="transition-transform duration-200 motion-reduce:transition-none" />
      Advanced
    </button>

    <div v-if="advanced" class="flex flex-col gap-3" data-testid="mp4-advanced">
      <div class="flex flex-col gap-1.5">
        <Label for="mp4-voice">Voice</Label>
        <Input id="mp4-voice" v-model="form.voice as string" placeholder="Provider default" :disabled="disabled" />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="mp4-fps">Frames per second</Label>
        <Select :model-value="String(form.fps)" :disabled="disabled" @update:model-value="form.fps = Number($event)">
          <SelectTrigger id="mp4-fps"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="24">24</SelectItem>
            <SelectItem value="30">30</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="mp4-min">Minimum seconds per slide</Label>
        <Input id="mp4-min" type="number" min="0" step="0.5" :model-value="form.min_slide_seconds ?? ''" :disabled="disabled" @update:model-value="form.min_slide_seconds = num($event)" />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="mp4-padding">Padding seconds</Label>
        <Input id="mp4-padding" type="number" min="0" step="0.1" :model-value="form.padding_seconds ?? ''" :disabled="disabled" @update:model-value="form.padding_seconds = num($event)" />
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="mp4-crossfade">Crossfade seconds</Label>
        <Input id="mp4-crossfade" type="number" min="0" step="0.1" :model-value="form.crossfade_seconds ?? ''" :disabled="disabled" @update:model-value="form.crossfade_seconds = num($event)" />
      </div>
      <div class="flex items-center justify-between">
        <Label for="mp4-gen-audio">Generate missing audio</Label>
        <Switch id="mp4-gen-audio" v-model="form.generate_missing_audio" :disabled="disabled" />
      </div>
      <div class="flex items-center justify-between">
        <Label for="mp4-indicator">Speaker indicator</Label>
        <Switch id="mp4-indicator" v-model="form.speaker_indicator" :disabled="disabled" />
      </div>
      <div class="flex items-center justify-between">
        <Label for="mp4-animate">Animate</Label>
        <Switch id="mp4-animate" v-model="form.animate" :disabled="disabled" />
      </div>
      <div class="flex items-center justify-between">
        <Label for="mp4-regenerate">Regenerate</Label>
        <Switch id="mp4-regenerate" v-model="form.regenerate" :disabled="disabled" />
      </div>
    </div>
  </div>
</template>
