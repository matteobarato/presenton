<script setup lang="ts">
import PageHeader from '@/components/shell/PageHeader.vue'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuery } from '@tanstack/vue-query'
import { MAX_OUTLINE_SLIDES, preparePresentation, saveOutline } from '@/api/outlines'
import { listTemplates } from '@/api/templates'
import { useTemplateLayouts } from '@/composables/useTemplateLayouts'
import { withSourceTheme } from '@/render/retint'
import { updatePresentation } from '@/api/presentations'
import { toast } from '@/components/ui/sonner'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import OutlineList from '@/components/create/OutlineList.vue'
import TemplatePicker from '@/components/create/TemplatePicker.vue'
import TemplateCardThumb from '@/components/create/TemplateCardThumb.vue'
import ThemePicker from '@/components/create/ThemePicker.vue'
import ThemeSwatch from '@/components/editor/inspector/ThemeSwatch.vue'
import AiProgress from '@/components/shell/AiProgress.vue'
import { ArrowRight, Check } from 'lucide-vue-next'
import { useOutlineStream } from '@/composables/useOutlineStream'
import { useThemeParam } from '@/composables/useThemeParam'

const SAVE_DEBOUNCE_MS = 500

const route = useRoute()
const router = useRouter()
const id = computed(() => String(route.params.id ?? ''))

const { items, status, streaming, error, retry } = useOutlineStream(id)
const templates = useQuery({ queryKey: ['templates'], queryFn: listTemplates })
const selectedTemplate = ref<string | null>(null)
const { themeList, isPending: themesPending, isError: themesError, selectedThemeId, chosenTheme } = useThemeParam()
// A theme in the URL that the list has not resolved yet (or failed to load) must not be dropped silently.
const themeRequested = computed(() => typeof route.query.theme === 'string' && route.query.theme !== '')
// A theme already chosen on the New page is shown as a summary; the picker opens only on Change.
const themePickerOpen = ref(true)
let themePreselected = false
watch(
  chosenTheme,
  (t) => {
    if (t && !themePreselected) {
      themePreselected = true
      themePickerOpen.value = false
    }
  },
  { immediate: true },
)
// A template already chosen on the New page is shown as a summary; the full picker opens only on Change.
const pickerOpen = ref(true)
const chosenTemplate = computed(() => templates.data.value?.find((t) => t.id === selectedTemplate.value))
// The template's own palette travels with the theme, so the deck recolours by role instead of only setting variables.
const { theme: templatePalette } = useTemplateLayouts(chosenTemplate)
const progressDetail = computed(() => {
  const n = items.value.length
  return n ? `${n} ${n === 1 ? 'slide' : 'slides'} drafted` : 'Starting…'
})

// One-shot: preselect from ?template once the list is known.
let preselected = false
watch(
  () => templates.data.value,
  (list) => {
    if (!list || preselected) return
    preselected = true
    const wanted = route.query.template
    if (!selectedTemplate.value && typeof wanted === 'string' && list.some((t) => t.id === wanted)) {
      selectedTemplate.value = wanted
      pickerOpen.value = false
    }
  },
  { immediate: true },
)
watch(selectedTemplate, (v) => {
  void router.replace({ query: { ...route.query, template: v ?? undefined } })
})
const generating = ref(false)
const actionError = ref<string | null>(null)
const saveError = ref<string | null>(null)

// Debounced autosave of user edits. Streamed updates are never saved: only
// changes made after streaming finished differ from the baseline.
let baseline = ''
let saveTimer: ReturnType<typeof setTimeout> | null = null
// The route param is already gone when a leaving view flushes, so remember the deck the edit belongs to.
let pendingId = ''
const snapshot = () => JSON.stringify(items.value)

// Sync flush: items are assigned just before streaming flips, so the baseline
// must be taken before the items watcher below can see the final list.
watch(
  streaming,
  (now) => {
    if (!now) baseline = snapshot()
  },
  { flush: 'sync' },
)

watch(
  items,
  () => {
    if (streaming.value || snapshot() === baseline) return
    if (saveTimer) clearTimeout(saveTimer)
    pendingId = id.value
    saveTimer = setTimeout(() => void saveNow(), SAVE_DEBOUNCE_MS)
  },
  { deep: true },
)

async function saveNow() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = null
  const body = items.value.map((i) => ({ content: i.content }))
  const sent = snapshot()
  try {
    await saveOutline(pendingId || id.value, body)
    baseline = sent
    saveError.value = null
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : 'Could not save your outline.'
  }
}

// Leaving inside the debounce window must not drop the user's last edit.
onBeforeUnmount(() => {
  if (saveTimer) void saveNow()
})

const canGenerate = computed(
  () =>
    !!selectedTemplate.value &&
    !streaming.value &&
    !generating.value &&
    !(themeRequested.value && themesPending.value) &&
    items.value.length > 0 &&
    items.value.length <= MAX_OUTLINE_SLIDES,
)
const generateLabel = computed(() => (selectedTemplate.value ? 'Generate presentation' : 'Select a template'))

async function generate() {
  if (!canGenerate.value || !selectedTemplate.value) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = null
  generating.value = true
  actionError.value = null
  try {
    await preparePresentation({
      presentation_id: id.value,
      outlines: items.value.map((i) => ({ content: i.content })),
      layout: selectedTemplate.value,
    })
    // Template colours is the default: only an explicit theme is applied. A failure must not block the editor.
    if (themeRequested.value && themesError.value) {
      toast.error("Couldn't apply theme — set it in Design")
    } else if (chosenTheme.value) {
      try {
        await updatePresentation({ id: id.value, theme: withSourceTheme(chosenTheme.value, templatePalette.value) })
      } catch {
        toast.error("Couldn't apply theme — set it in Design")
      }
    }
    await router.replace({
      name: 'editor',
      params: { id: id.value },
      query: { stream: '1' },
    })
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : 'Error in presentation generation.'
  } finally {
    generating.value = false
  }
}
</script>

<template>
  <PageHeader title="Outline" :parent="{ label: 'New presentation', to: '/new' }" />
  <section class="workspace-card">
    <div class="mx-auto flex w-full max-w-[880px] flex-col gap-7">
      <header>
        <h1 class="text-[30px] leading-[1.22] font-medium tracking-[-0.04em] text-[#e4ecf0] max-[1050px]:text-[27px] max-[760px]:text-[24px]">
          Shape the story.
        </h1>
        <p class="mt-[11px] max-w-[60ch] text-[12px] leading-[1.7] text-[#9aabb4]">
          {{
            streaming
              ? 'Your outline is being written. You can edit, reorder and add slides as soon as it’s done.'
              : 'Each card becomes one slide. Click a card to edit it, drag to reorder.'
          }}
        </p>
      </header>

      <Transition name="step-panel">
        <AiProgress v-if="streaming" :stage="status" :detail="progressDetail" label="Outline progress" />
      </Transition>

      <Alert v-if="error" variant="destructive" class="flex items-center justify-between gap-3 py-2 text-[12px]">
        <span>{{ error }}</span>
        <Button type="button" size="sm" variant="secondary" @click="retry()">Retry</Button>
      </Alert>
      <Alert v-if="saveError" variant="destructive" class="py-2 text-[12px]">{{ saveError }}</Alert>

      <div v-if="streaming && !items.length" class="flex flex-col gap-2" aria-hidden="true">
        <div v-for="n in 4" :key="n" class="skeleton-shimmer h-[62px] rounded-card" :style="{ opacity: 1 - n * 0.18 }" />
      </div>
      <OutlineList v-else v-model="items" :disabled="streaming" />

      <div class="flex flex-col gap-3">
        <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 class="text-[16px] font-medium tracking-[-0.02em] text-[#e4ecf0]">{{ chosenTemplate && !pickerOpen ? 'Template' : 'Choose a template' }}</h2>
        </div>
        <Skeleton v-if="templates.isPending.value" class="h-32 w-full" />
        <Alert v-else-if="templates.isError.value" variant="destructive" class="py-2 text-[12px]">
          Templates could not be loaded.
        </Alert>
        <div
          v-else-if="chosenTemplate && !pickerOpen"
          class="flex items-center gap-4 rounded-card border border-white/[0.07] bg-white/[0.02] p-2.5 pr-4"
          data-testid="chosen-template"
        >
          <TemplateCardThumb :template="chosenTemplate" :width="132" :theme-override="chosenTheme" />
          <div class="flex min-w-0 flex-1 flex-col gap-1">
            <span class="flex items-center gap-2 text-[13px] font-medium text-[#e4ecf0]">
              <Check class="size-[16px] rounded-full bg-accent p-[3px] text-accent-ink" aria-hidden="true" />
              <span class="truncate">{{ chosenTemplate.name }}</span>
            </span>
            <span class="text-[11px] text-[#8e9ca4]">Chosen on the previous step</span>
          </div>
          <Button type="button" variant="outline" size="sm" @click="pickerOpen = true">Change</Button>
        </div>
        <TemplatePicker v-else v-model="selectedTemplate" :templates="templates.data.value ?? []" />
      </div>

      <div class="flex flex-col gap-3">
        <h2 class="text-[16px] font-medium tracking-[-0.02em] text-[#e4ecf0]">Theme</h2>
        <div
          v-if="chosenTheme && !themePickerOpen"
          class="flex items-center gap-4 rounded-card border border-white/[0.07] bg-white/[0.02] p-2.5 pr-4"
          data-testid="chosen-theme"
        >
          <div class="w-[132px] flex-none">
            <ThemeSwatch :name="chosenTheme.name" :theme="chosenTheme" :selected="false" :custom="false" @select="themePickerOpen = true" />
          </div>
          <div class="flex min-w-0 flex-1 flex-col gap-1">
            <span class="flex items-center gap-2 text-[13px] font-medium text-[#e4ecf0]">
              <Check class="size-[16px] rounded-full bg-accent p-[3px] text-accent-ink" aria-hidden="true" />
              <span class="truncate">{{ chosenTheme.name }}</span>
            </span>
            <span class="text-[11px] text-[#8e9ca4]">Chosen on the previous step</span>
          </div>
          <Button type="button" variant="outline" size="sm" @click="themePickerOpen = true">Change</Button>
        </div>
        <ThemePicker v-else v-model="selectedThemeId" :themes="themeList" />
      </div>

      <Alert v-if="actionError" variant="destructive" class="py-2 text-[12px]">{{ actionError }}</Alert>
      <div class="flex justify-end">
        <Button type="button" class="h-[43px] min-w-[240px] text-[12px] max-[760px]:w-full" :disabled="!canGenerate" @click="generate">
          {{ generating ? 'Preparing…' : generateLabel }}
          <ArrowRight v-if="!generating && selectedTemplate" class="size-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  </section>
</template>
