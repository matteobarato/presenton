import { initialDeck, validateDeck, type Deck } from './deck'

export const presentationProviders = {
  powerpoint: { name: 'Microsoft PowerPoint', workspace: 'Microsoft 365 · Demo workspace', color: '#ee9878' },
  slides: { name: 'Google Slides', workspace: 'Google Drive · Demo workspace', color: '#f5cb78' },
} as const

export type ProviderId = keyof typeof presentationProviders
export type AccessMode = 'read' | 'write'

export const modelProviders = {
  openai: { name: 'OpenAI', models: ['GPT-4.1 mini', 'GPT-4.1'] },
  anthropic: { name: 'Anthropic', models: ['Claude Sonnet 4', 'Claude Haiku 3.5'] },
  google: { name: 'Google Gemini', models: ['Gemini 2.5 Flash', 'Gemini 2.5 Pro'] },
  custom: { name: 'Custom endpoint', models: ['Example model'] },
} as const

export type ModelProvider = keyof typeof modelProviders
export interface ModelSettings {
  provider: ModelProvider
  model: string
  endpoint: string
  temperature: number
}
interface Connection {
  access: AccessMode | null
  document: Deck
}
export interface WorkspaceSettings {
  connections: Record<ProviderId, Connection>
  ai: ModelSettings
}

export const settingsKey = 'aera-workspace-settings-v1'
export const defaultModel = (): ModelSettings => ({
  provider: 'openai', model: modelProviders.openai.models[0], endpoint: '', temperature: 0.7,
})

export function copyDeck(deck: Deck): Deck {
  return { title: deck.title, slides: deck.slides.map(slide => ({ ...slide })) }
}

function sampleDeck(title: string, opening: string): Deck {
  const { slides } = initialDeck()
  slides[0].title = opening
  slides[0].subtitle = 'A sample presentation for exploring your workspace connection.'
  return { title, slides: slides.slice(0, 4) }
}

export function readWorkspaceSettings(): WorkspaceSettings {
  const settings: WorkspaceSettings = {
    connections: {
      powerpoint: { access: null, document: sampleDeck('Northstar strategy review', 'A clearer\nway forward.') },
      slides: { access: null, document: sampleDeck('Studio concept review', 'Make space\nfor good ideas.') },
    },
    ai: defaultModel(),
  }
  try {
    const saved = JSON.parse(localStorage.getItem(settingsKey) || 'null') as Partial<WorkspaceSettings> | null
    for (const id of Object.keys(presentationProviders) as ProviderId[]) {
      const connection = saved?.connections?.[id]
      if (connection && validateDeck(connection.document)) {
        settings.connections[id] = {
          access: connection.access === 'read' || connection.access === 'write' ? connection.access : null,
          document: copyDeck(connection.document),
        }
      }
    }
    const ai = saved?.ai
    if (ai && Object.hasOwn(modelProviders, ai.provider) && typeof ai.model === 'string' &&
        typeof ai.endpoint === 'string' && Number.isFinite(ai.temperature)) {
      settings.ai = { ...ai }
    }
  } catch {
    // A fresh demo remains available if browser storage is inaccessible.
  }
  return settings
}
