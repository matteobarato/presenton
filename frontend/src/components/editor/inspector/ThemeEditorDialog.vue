<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ThemeCreateBody, ThemeRecord } from '@/api/themes'
import {
  DEFAULT_TEMPLATE_THEME,
  TEMPLATE_THEME_COLOR_KEYS,
  normalizeTemplateTheme,
  type TemplateThemeColorKey,
} from '@/render/legacy/lib/template-theme'

const open = defineModel<boolean>('open', { required: true })
const props = defineProps<{ theme: ThemeRecord | null; saving?: boolean }>()
const emit = defineEmits<{ save: [body: ThemeCreateBody] }>()

const name = ref('')
const description = ref('')
const fontName = ref('')
const fontUrl = ref('')
const colors = reactive<Record<TemplateThemeColorKey, string>>({ ...DEFAULT_TEMPLATE_THEME })

function load() {
  const t = props.theme ? normalizeTemplateTheme(props.theme) : null
  name.value = props.theme?.name ?? ''
  description.value = props.theme?.description ?? ''
  fontName.value = t?.fonts?.textFont?.name ?? ''
  fontUrl.value = t?.fonts?.textFont?.url ?? ''
  Object.assign(colors, DEFAULT_TEMPLATE_THEME, t ?? {})
}
watch(open, (isOpen) => {
  if (isOpen) load()
}, { immediate: true })

const label = (key: string) => key.replace('_', ' ')

function submit() {
  const data: Record<string, unknown> = { ...(props.theme?.data ?? {}), colors: { ...colors } }
  const font = fontName.value.trim()
  const url = fontUrl.value.trim()
  const existing = (data.fonts as Record<string, unknown> | undefined) ?? {}
  if (font && url) data.fonts = { ...existing, textFont: { name: font, url } }
  else delete data.fonts
  emit('save', { name: name.value.trim(), description: description.value.trim(), data })
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{{ theme ? 'Edit theme' : 'New theme' }}</DialogTitle>
        <DialogDescription>Colours and text font applied to every slide.</DialogDescription>
      </DialogHeader>
      <form class="flex flex-col gap-3" @submit.prevent="submit">
        <div class="flex flex-col gap-1">
          <Label for="theme-name">Name</Label>
          <Input id="theme-name" v-model="name" required />
        </div>
        <div class="flex flex-col gap-1">
          <Label for="theme-description">Description</Label>
          <Input id="theme-description" v-model="description" />
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div v-for="key in TEMPLATE_THEME_COLOR_KEYS" :key="key" class="flex items-center gap-2">
            <input
              v-model="colors[key]"
              type="color"
              class="size-8 shrink-0 cursor-pointer rounded-[6px] border border-white/10 bg-transparent"
              :aria-label="`${label(key)} colour`"
            />
            <span class="truncate text-[11px] capitalize text-[#c0cfd6]">{{ label(key) }}</span>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div class="flex flex-col gap-1">
            <Label for="theme-font-name">Font name</Label>
            <Input id="theme-font-name" v-model="fontName" placeholder="Inter" />
          </div>
          <div class="flex flex-col gap-1">
            <Label for="theme-font-url">Font URL</Label>
            <Input id="theme-font-url" v-model="fontUrl" placeholder="https://…/font.woff2" />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" @click="open = false">Cancel</Button>
          <Button type="submit" :disabled="saving || !name.trim()">Save theme</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
