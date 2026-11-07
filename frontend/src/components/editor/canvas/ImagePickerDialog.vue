<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { Loader2, Search, Sparkles, Upload, X } from 'lucide-vue-next'
import { generateImage, imageKeys, listGeneratedImages, listUploadedImages, searchStockImages, uploadImage, type ImageAsset } from '@/api/images'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { resolveAssetUrl } from '@/render/legacy/lib/template-v2-json-to-html'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean]; pick: [src: string] }>()

type TabName = 'upload' | 'uploaded' | 'generate' | 'stock'
const tab = ref<TabName>('upload')
const queryClient = useQueryClient()

function message(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
function choose(src: string) {
  emit('pick', src)
  emit('update:open', false)
}

// Upload
const dragging = ref(false)
const uploading = ref(false)
const uploadError = ref('')
async function upload(file: File | undefined) {
  if (!file || uploading.value) return
  if (file.type && !file.type.startsWith('image/')) {
    uploadError.value = 'Choose an image file.'
    return
  }
  uploading.value = true
  uploadError.value = ''
  try {
    const asset = await uploadImage(file)
    void queryClient.invalidateQueries({ queryKey: imageKeys.uploaded })
    choose(asset.path)
  } catch (e) {
    uploadError.value = message(e, 'Failed to upload image.')
  } finally {
    uploading.value = false
  }
}
function onFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  void upload(file)
  input.value = ''
}
function onDrop(event: DragEvent) {
  dragging.value = false
  void upload(event.dataTransfer?.files?.[0])
}

// Uploaded and previously generated lists
const uploaded = useQuery({
  queryKey: imageKeys.uploaded,
  queryFn: listUploadedImages,
  enabled: computed(() => props.open && tab.value === 'uploaded'),
})
const generatedList = useQuery({
  queryKey: imageKeys.generated,
  queryFn: listGeneratedImages,
  enabled: computed(() => props.open && tab.value === 'generate'),
})

// Generate
const prompt = ref('')
const generating = ref(false)
const generateError = ref('')
const generatedSrc = ref('')
let generateController: AbortController | null = null
async function generate() {
  const text = prompt.value.trim()
  if (!text || generating.value) return
  const controller = new AbortController()
  generateController = controller
  generating.value = true
  generateError.value = ''
  generatedSrc.value = ''
  try {
    const src = await generateImage(text, controller.signal)
    if (controller.signal.aborted) return
    generatedSrc.value = src
    void queryClient.invalidateQueries({ queryKey: imageKeys.generated })
  } catch (e) {
    if (!controller.signal.aborted) generateError.value = message(e, 'Failed to generate image.')
  } finally {
    if (generateController === controller) generateController = null
    generating.value = false
  }
}
function cancelGenerate() {
  generateController?.abort()
}

// Stock
const stockQuery = ref('')
const searching = ref(false)
const stockError = ref('')
const stockResults = ref<string[]>([])
const stockSearched = ref(false)
let stockController: AbortController | null = null
async function search() {
  const text = stockQuery.value.trim()
  if (!text) return
  stockController?.abort()
  const controller = new AbortController()
  stockController = controller
  searching.value = true
  stockError.value = ''
  try {
    const results = await searchStockImages(text, controller.signal)
    if (controller.signal.aborted) return
    stockResults.value = results
    stockSearched.value = true
  } catch (e) {
    if (!controller.signal.aborted) stockError.value = message(e, 'Failed to search stock images.')
  } finally {
    if (stockController === controller) {
      stockController = null
      searching.value = false
    }
  }
}

function stopRequests() {
  generateController?.abort()
  stockController?.abort()
}
watch(
  () => props.open,
  (open) => {
    if (!open) stopRequests()
  },
)
onBeforeUnmount(stopRequests)

const errorText = (error: unknown) => message(error, 'Failed to load images.')
const assets = (list: ImageAsset[] | undefined) => list ?? []

const tabClass = 'mt-4 flex flex-col gap-3 outline-none'
const fieldClass =
  'h-9 min-w-0 flex-1 rounded-control border border-white/[0.06] bg-field px-3 text-[12px] text-[#dce3e7] outline-none focus:border-accent/60'
const primary =
  'inline-flex h-9 items-center gap-2 rounded-control bg-accent px-3.5 text-[12px] font-semibold text-[#0b1a22] disabled:opacity-40'
const gridClass = 'grid grid-cols-3 gap-2'
const thumb =
  'aspect-[4/3] w-full overflow-hidden rounded-control border border-white/[0.06] bg-field hover:border-accent/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent'
const alertClass = 'rounded-control bg-danger px-3 py-2 text-[12px] text-danger-text'
</script>

<template>
  <Dialog :open="props.open" @update:open="emit('update:open', $event)">
    <DialogContent class="w-[min(640px,calc(100vw-32px))]" data-inline-edit-ignore="true">
      <DialogHeader>
        <DialogTitle>Replace image</DialogTitle>
        <DialogDescription>Upload a picture, pick one you already have, generate one, or search stock photos.</DialogDescription>
      </DialogHeader>
      <Tabs v-model="tab" class="mt-4">
        <TabsList class="flex w-full gap-1">
          <TabsTrigger value="upload">Upload</TabsTrigger>
          <TabsTrigger value="uploaded">Uploaded</TabsTrigger>
          <TabsTrigger value="generate">Generate</TabsTrigger>
          <TabsTrigger value="stock">Stock</TabsTrigger>
        </TabsList>

        <TabsContent value="upload" :class="tabClass">
          <label
            class="flex cursor-pointer flex-col items-center gap-2 rounded-button border border-dashed px-4 py-8 text-[12px] text-muted transition-colors hover:text-text"
            :class="dragging ? 'border-accent bg-field' : 'border-line'"
            data-testid="image-dropzone"
            @dragover.prevent="dragging = true"
            @dragleave="dragging = false"
            @drop.prevent="onDrop"
          >
            <Loader2 v-if="uploading" class="size-5 animate-spin" aria-hidden="true" />
            <Upload v-else class="size-5" aria-hidden="true" />
            <span>{{ uploading ? 'Uploading...' : 'Choose an image or drop it here' }}</span>
            <input type="file" class="sr-only" accept="image/*" :disabled="uploading" @change="onFile" />
          </label>
          <p v-if="uploadError" role="alert" :class="alertClass">{{ uploadError }}</p>
        </TabsContent>

        <TabsContent value="uploaded" :class="tabClass">
          <p v-if="uploaded.isError.value" role="alert" :class="alertClass">{{ errorText(uploaded.error.value) }}</p>
          <p v-else-if="uploaded.isPending.value" class="text-[12px] text-muted">Loading...</p>
          <p v-else-if="assets(uploaded.data.value).length === 0" class="text-[12px] text-muted">No uploaded images yet.</p>
          <div v-else :class="gridClass">
            <button v-for="(asset, i) in assets(uploaded.data.value)" :key="asset.id" type="button" :class="thumb" :aria-label="`Use image ${i + 1}`" @click="choose(asset.path)">
              <img :src="resolveAssetUrl(asset.path)" alt="" class="size-full object-cover" />
            </button>
          </div>
        </TabsContent>

        <TabsContent value="generate" :class="tabClass">
          <form class="flex gap-2" @submit.prevent="generate">
            <input v-model="prompt" type="text" aria-label="Image prompt" placeholder="Describe the image" :class="fieldClass" :disabled="generating" />
            <button type="submit" :class="primary" aria-label="Generate image" :disabled="generating || !prompt.trim()">
              <Sparkles class="size-3.5" aria-hidden="true" />
              Generate
            </button>
          </form>
          <div v-if="generating" class="flex items-center gap-3 text-[12px] text-muted">
            <span role="status" aria-label="Generating image" class="inline-flex"><Loader2 class="size-4 animate-spin" aria-hidden="true" /></span>
            <span>Generating...</span>
            <button type="button" class="ml-auto inline-flex items-center gap-1 rounded-control px-2 py-1 hover:bg-white/[0.04] hover:text-text" aria-label="Cancel generation" @click="cancelGenerate">
              <X class="size-3.5" aria-hidden="true" />
              Cancel
            </button>
          </div>
          <p v-if="generateError" role="alert" :class="alertClass">{{ generateError }}</p>
          <button v-if="generatedSrc" type="button" :class="[thumb, 'max-w-[240px]']" aria-label="Use generated image" @click="choose(generatedSrc)">
            <img :src="resolveAssetUrl(generatedSrc)" alt="" class="size-full object-cover" />
          </button>
          <div v-if="assets(generatedList.data.value).length" :class="gridClass">
            <button v-for="(asset, i) in assets(generatedList.data.value)" :key="asset.id" type="button" :class="thumb" :aria-label="`Use earlier image ${i + 1}`" @click="choose(asset.path)">
              <img :src="resolveAssetUrl(asset.path)" alt="" class="size-full object-cover" />
            </button>
          </div>
        </TabsContent>

        <TabsContent value="stock" :class="tabClass">
          <form class="flex gap-2" @submit.prevent="search">
            <input v-model="stockQuery" type="search" aria-label="Search stock images" placeholder="Search stock photos" :class="fieldClass" />
            <button type="submit" :class="primary" aria-label="Search" :disabled="searching || !stockQuery.trim()">
              <Loader2 v-if="searching" class="size-3.5 animate-spin" aria-hidden="true" />
              <Search v-else class="size-3.5" aria-hidden="true" />
              Search
            </button>
          </form>
          <p v-if="stockError" role="alert" :class="alertClass">{{ stockError }}</p>
          <p v-else-if="stockSearched && stockResults.length === 0" class="text-[12px] text-muted">No results.</p>
          <div v-if="stockResults.length" :class="gridClass">
            <button v-for="(url, i) in stockResults" :key="url" type="button" :class="thumb" :aria-label="`Use image ${i + 1}`" @click="choose(url)">
              <img :src="resolveAssetUrl(url)" alt="" class="size-full object-cover" />
            </button>
          </div>
        </TabsContent>
      </Tabs>
    </DialogContent>
  </Dialog>
</template>
