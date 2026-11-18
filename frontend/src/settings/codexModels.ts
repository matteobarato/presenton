// Ported from servers/nextjs/utils/codexModels.ts
export const CODEX_MODEL_IDS: readonly string[] = [
  'gpt-5.6-sol',
  'gpt-5.6-terra',
  'gpt-5.6-luna',
  'gpt-5.5',
  'gpt-5.4',
  'gpt-5.4-mini',
  'gpt-5.3-codex-spark',
]

export function isSupportedCodexModel(model?: string): boolean {
  return Boolean(model && CODEX_MODEL_IDS.includes(model))
}
