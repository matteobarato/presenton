<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpToLine, Check, CircleHelp, ExternalLink, Link2, Presentation, Settings2, Sparkles, Unplug } from 'lucide-vue-next'
import { TabsRoot, TabsList, TabsTrigger, TabsContent } from 'reka-ui'
import { Button } from '@/components/ui/button'
import Dialog from '@/components/ui/dialog/Dialog.vue'
import SlideCanvas from '@/components/SlideCanvas.vue'
import type { Deck } from '@/lib/deck'
import { copyDeck, defaultModel, modelProviders, presentationProviders, type AccessMode, type ModelProvider, type ProviderId, type WorkspaceSettings } from '@/lib/workspace-settings'

const props = defineProps<{ deck: Deck; linkedProvider: ProviderId | null }>()
const settings = defineModel<WorkspaceSettings>('settings', { required: true })
const emit = defineEmits<{
  import: [provider: ProviderId]
  status: [message: string]
}>()
const tab = defineModel<string>('tab', { required: true })
const ids = Object.keys(presentationProviders) as ProviderId[]
const connecting = ref<ProviderId | null>(null)
const step = ref(1)
const access = ref<AccessMode>('write')
const openWizard = computed({
  get: () => connecting.value !== null,
  set: (value: boolean) => { if (!value) connecting.value = null },
})
const connectionTitle = computed(() => connecting.value ? 'Connect ' + presentationProviders[connecting.value].name : 'Connect a presentation app')
const providerEditor = ref<ProviderId | null>(null)
const providerTitle = ref('')
const providerHeadline = ref('')
const draft = ref({ ...settings.value.ai })
const modelStatus = ref('')
const modelDirty = computed(() => JSON.stringify(draft.value) !== JSON.stringify(settings.value.ai))
const syncLabel = computed(() => {
  if (!props.linkedProvider) return ''
  const providerDeck = settings.value.connections[props.linkedProvider].document
  return JSON.stringify(copyDeck(props.deck)) === JSON.stringify(providerDeck) ? 'In sync' : 'Copies differ'
})

watch(draft, () => { modelStatus.value = '' }, { deep: true, flush: 'sync' })

function openConnection(id: ProviderId) {
  step.value = 1
  access.value = settings.value.connections[id].access || 'write'
  connecting.value = id
}
function confirmConnection() {
  if (!connecting.value) return
  settings.value.connections[connecting.value].access = access.value
  emit('status', 'Demo connection ready')
  connecting.value = null
}
function disconnect(id: ProviderId) {
  settings.value.connections[id].access = null
  emit('status', 'Demo connection disconnected')
}
function push(id: ProviderId) {
  if (props.linkedProvider !== id || settings.value.connections[id].access !== 'write') return
  settings.value.connections[id].document = copyDeck(props.deck)
  emit('status', 'Aera edits sent to the demo provider copy')
}
function editProvider(id: ProviderId) {
  const document = settings.value.connections[id].document
  providerTitle.value = document.title
  providerHeadline.value = document.slides[0].title
  providerEditor.value = id
}
function saveProvider() {
  if (!providerEditor.value || !providerTitle.value.trim() || !providerHeadline.value.trim()) return
  const document = settings.value.connections[providerEditor.value].document
  document.title = providerTitle.value.trim()
  document.slides[0].title = providerHeadline.value.trim()
  providerEditor.value = null
  emit('status', 'Demo provider copy updated')
}
function changeProvider(provider: ModelProvider) {
  draft.value.provider = provider
  draft.value.model = modelProviders[provider].models[0]
  draft.value.endpoint = ''
}
function validateModel() {
  if (!draft.value.model.trim()) return 'Enter a model name.'
  const endpoint = draft.value.endpoint.trim()
  if (draft.value.provider === 'custom' && !endpoint) return 'Enter an example endpoint.'
  if (endpoint) {
    try {
      const url = new URL(endpoint)
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw Error()
    } catch {
      return 'Use an HTTP or HTTPS URL without credentials.'
    }
  }
  return ''
}
function testModel() {
  modelStatus.value = validateModel() || 'Preview passed. The configuration is ready for this demo.'
}
function saveModel() {
  const error = validateModel()
  if (error) { modelStatus.value = error; return }
  settings.value.ai = { ...draft.value, model: draft.value.model.trim(), endpoint: draft.value.endpoint.trim() }
  draft.value = { ...settings.value.ai }
  modelStatus.value = 'Model settings saved.'
  emit('status', 'AI model settings saved')
}
</script>

<template>
  <main class="workspace-page settings-page">
    <div class="settings-shell">
      <header class="settings-intro">
        <div>
          <h1>Workspace settings</h1>
          <p>Connect presentation apps and choose the model behind Ask Aera.</p>
        </div>
        <span class="settings-badge">Design preview</span>
      </header>
      <TabsRoot v-model="tab">
        <TabsList class="settings-tabs" aria-label="Workspace settings">
          <TabsTrigger value="connections"><Link2 :size="16"/> Connections</TabsTrigger>
          <TabsTrigger value="ai"><Sparkles :size="16"/> AI models</TabsTrigger>
        </TabsList>

        <TabsContent value="connections" class="settings-section">
          <div class="settings-section-heading">
            <h2>Presentation connections</h2>
            <p>Walk through MCP setup with a sample workspace, then try moving edits between copies.</p>
          </div>
          <section v-for="id in ids" :key="id" class="connection-panel">
            <div class="connection-header">
              <span class="provider-mark" :style="{ '--provider-color': presentationProviders[id].color }"><Presentation :size="19"/></span>
              <div class="provider-info">
                <h3>{{ presentationProviders[id].name }}</h3>
                <p>{{ settings.connections[id].access ? presentationProviders[id].workspace : 'Guided MCP setup' }}</p>
              </div>
              <span v-if="settings.connections[id].access" class="connection-state"><Check :size="13"/> Demo connected</span>
              <Button v-else size="sm" variant="outline" @click="openConnection(id)">Set up <ArrowRight :size="14"/></Button>
            </div>
            <div v-if="settings.connections[id].access" class="connection-body">
              <div class="connection-document">
                <div class="connection-thumbnail" aria-hidden="true"><SlideCanvas :slide="settings.connections[id].document.slides[0]" :index="0" :total="settings.connections[id].document.slides.length" compact/></div>
                <div class="provider-info">
                  <strong>{{ settings.connections[id].document.title }}</strong>
                  <p>{{ settings.connections[id].document.slides.length }} slides · {{ settings.connections[id].access === 'write' ? 'Read and edit' : 'Import only' }}<template v-if="linkedProvider === id"> · {{ syncLabel }}</template></p>
                </div>
                <Button size="sm" variant="outline" @click="editProvider(id)"><ExternalLink :size="13"/> Edit demo copy</Button>
              </div>
              <div class="connection-actions">
                <Button size="sm" @click="emit('import', id)"><ArrowDownToLine :size="14"/> {{ linkedProvider === id ? 'Pull provider edits' : 'Import and link' }}</Button>
                <Button v-if="linkedProvider === id" size="sm" variant="outline" :disabled="settings.connections[id].access !== 'write'" @click="push(id)"><ArrowUpToLine :size="14"/> Push Aera edits</Button>
                <Button size="sm" variant="ghost" @click="openConnection(id)"><Settings2 :size="14"/> Access</Button>
                <Button size="sm" variant="ghost" @click="disconnect(id)"><Unplug :size="14"/> Disconnect</Button>
              </div>
              <p class="settings-note">{{ linkedProvider === id ? 'Pulling replaces the open deck with the provider copy. Use Undo in the editor to recover the previous copy.' : 'Import opens this sample in the editor. The current deck remains available through Undo.' }}</p>
            </div>
          </section>
          <p class="settings-note"><CircleHelp :size="15"/> These connections use sample presentations stored in this browser.</p>
        </TabsContent>

        <TabsContent value="ai" class="settings-section">
          <div class="settings-section-heading">
            <h2>AI model connection</h2>
            <p>Choose a provider, model, and response style for the Ask Aera preview.</p>
          </div>
          <form class="model-settings connection-panel" @submit.prevent="saveModel">
            <div class="model-fields">
              <label>Provider
                <select :value="draft.provider" @change="changeProvider(($event.target as HTMLSelectElement).value as ModelProvider)">
                  <option v-for="(provider, id) in modelProviders" :key="id" :value="id">{{ provider.name }}</option>
                </select>
              </label>
              <label>Model
                <input v-if="draft.provider === 'custom'" v-model="draft.model" maxlength="80"/>
                <select v-else v-model="draft.model"><option v-for="model in modelProviders[draft.provider].models" :key="model">{{ model }}</option></select>
              </label>
              <label class="wide-field">Example endpoint <span v-if="draft.provider !== 'custom'">(optional)</span>
                <input v-model="draft.endpoint" maxlength="180" type="text" inputmode="url" placeholder="https://model.example/v1" spellcheck="false"/>
              </label>
              <label class="wide-field temperature-field">
                <span>Temperature <output>{{ draft.temperature.toFixed(1) }}</output></span>
                <input v-model.number="draft.temperature" type="range" min="0" max="2" step="0.1"/>
                <small><span>More consistent</span><span>More varied</span></small>
              </label>
            </div>
            <p class="settings-note">Preview requests use sample responses. API credentials aren’t needed.</p>
            <div class="connection-actions">
              <Button type="button" size="sm" variant="outline" @click="testModel">Test preview</Button>
              <Button type="submit" size="sm" :disabled="!modelDirty">Save settings</Button>
              <Button type="button" size="sm" variant="ghost" @click="draft = defaultModel()">Reset defaults</Button>
            </div>
            <p v-if="modelStatus" class="settings-feedback" role="status">{{ modelStatus }}</p>
          </form>
        </TabsContent>
      </TabsRoot>
    </div>
  </main>

  <Dialog v-model:open="openWizard" :title="connectionTitle" :description="'Step ' + step + ' of 3 · Simulated MCP setup'">
    <div v-if="connecting" class="connection-wizard">
      <template v-if="step === 1">
        <h3>Choose a workspace</h3>
        <div class="wizard-workspace"><Presentation :size="20"/><span>{{ presentationProviders[connecting].workspace }}</span><Check :size="16"/></div>
        <p class="settings-note">This demo workspace includes one editable sample presentation.</p>
      </template>
      <template v-else-if="step === 2">
        <fieldset class="wizard-access">
          <legend>Choose access</legend>
          <label><input v-model="access" type="radio" value="read" name="mcp-access"/><span><strong>Import only</strong><small>Open a copy in Aera and pull later updates.</small></span></label>
          <label><input v-model="access" type="radio" value="write" name="mcp-access"/><span><strong>Read and edit</strong><small>Pull provider updates and send Aera edits back.</small></span></label>
        </fieldset>
      </template>
      <template v-else>
        <h3>Review the connection</h3>
        <div class="wizard-workspace"><Link2 :size="20"/><span>{{ presentationProviders[connecting].workspace }}</span><Check :size="16"/></div>
        <p class="settings-note">Access · {{ access === 'write' ? 'Read and edit' : 'Import only' }}</p>
      </template>
      <div class="connection-actions wizard-actions">
        <Button v-if="step > 1" type="button" variant="ghost" @click="step--"><ArrowLeft :size="15"/> Back</Button>
        <Button v-if="step < 3" type="button" @click="step++">Continue <ArrowRight :size="15"/></Button>
        <Button v-else type="button" @click="confirmConnection">Connect demo workspace <Check :size="15"/></Button>
      </div>
    </div>
  </Dialog>

  <Dialog :open="providerEditor !== null" title="Edit the demo provider copy" description="Save a provider-side change, then pull it into Aera from Connections." @update:open="value => { if (!value) providerEditor = null }">
    <form class="model-fields provider-edit-form" @submit.prevent="saveProvider">
      <label class="wide-field">Presentation title<input v-model="providerTitle" maxlength="80" required/></label>
      <label class="wide-field">Opening slide headline<textarea v-model="providerHeadline" maxlength="120" rows="3" required/></label>
      <Button type="submit" :disabled="!providerTitle.trim() || !providerHeadline.trim()">Save provider edit</Button>
    </form>
  </Dialog>
</template>
