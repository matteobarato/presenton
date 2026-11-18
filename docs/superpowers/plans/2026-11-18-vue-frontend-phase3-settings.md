# Vue Frontend Phase 3, Slice 1: Settings and Providers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the rail's "Settings (classic app)" link with a native `/settings` where an admin configures text, image and web-search providers (read-only summary for everyone else).

**Architecture:** A provider table plus a generic form drives the 15 key-based text providers; dedicated components exist only for Ollama, Vertex/Azure and Bedrock. One draft object (`useSettingsDraft`) holds the whole config across sections and is saved with a single `PUT /api/v1/admin/provider-settings` after the old page's normalise, validate and live checks. Access mode (edit / locked / managed) is decided once per page load.

**Tech Stack:** Vue 3 `<script setup lang="ts">`, Pinia, vue-router 5, shadcn-vue (reka-ui), Tailwind v4, vue-sonner, Vitest + @vue/test-utils, Playwright (mocked).

**Spec:** `docs/superpowers/specs/2026-11-17-vue-frontend-phase3-settings-design.md` (read it first; this plan only records decisions the spec leaves open). The branch `feat/vue-frontend-phase3-settings` already exists; work on it.

## Global Constraints

- Work only inside `frontend/` (plus this plan and the spec). Never modify `servers/nextjs`, `servers/fastapi`, or any Next.js/backend code.
- Ported code is a copy with a first-line comment `// Ported from servers/nextjs/<path>` (Vue files: `<!-- Ported from … -->` is not needed; put the comment as the first line of `<script setup>`).
- Template-based generation only: no Smart-mode option appears anywhere.
- Aera look: reuse `PageHeader`, `workspace-card`, existing tokens and `components/ui/*`; match `views/TemplatesView.vue`. UI copy is Presenton-branded, British spelling.
- Secrets: keys travel only in request bodies or the `X-Provider-Api-Key` header; never in URLs, query keys, toasts, logs, `console.*`, or test names. Key inputs are `type="password"`, `autocomplete="off"`, with a show/hide toggle. Fixtures use fake keys (`sk-test-fake`, `sk-ant-test-fake`).
- API calls go through `src/api/client.ts` (`requestJson`, `guardedFetch`; errors are `ApiError`). One module per area.
- Sign-in providers (ChatGPT/Codex, Presenton Cloud) and the Privacy toggle are out of scope; no admin, onboarding, community or fonts work.
- Section ids (route param): `text | images | web-search | account`. Config key names are the UPPER_SNAKE names of `servers/nextjs/types/llm_config.ts`.
- Commands run from `frontend/`: `npx vitest run <file>`, `npx vue-tsc -b`, `npm run check`, `npx playwright test tests/e2e/mocked.spec.ts -g "<name>"`.
- Commit after each task. Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01Ri2m3d8u4AWWWGEeMcuLRe`.

## Review Focus

Each line below has a pinning test in the task named in brackets.

1. Models discovered for provider A are never shown after switching to provider B, or after the key or base URL changes. [Task 9]
2. An error from a failed discovery, check or save never echoes a key (toast text, thrown message). [Tasks 3, 6]
3. Switching provider A → B → A keeps A's entered values; a brand-new install (`LLM` unset, mostly empty config) renders every section without error. [Tasks 7, 9]
4. A failed save (network, 403, 5xx) keeps the draft and leaves it dirty; typing then deleting a value is not "dirty". [Task 6]
5. A stored `codex` or `presenton` config loads, validates and shows read-only without the user being able to corrupt it, and "Switch to another provider" works. [Tasks 2, 9]

---

### Task 1: Config type, provider tables, icons

**Files:**
- Create: `src/settings/types.ts`, `src/settings/providers.ts`
- Create: `public/providers/*` (copy every file from `servers/nextjs/public/providers/` incl. `LICENSE.lobe-icons`; drop `OpenAI-black.png`/`OpenAI-white.png` if unreferenced)
- Test: `tests/unit/settings/providers.test.ts`

**Interfaces:**
- Produces (`types.ts`): `interface ProviderConfig` — copy of `LLMConfig` from `servers/nextjs/types/llm_config.ts` (drop `USE_CUSTOM_URL`, `DISABLE_ANONYMOUS_TRACKING`), plus `PRESENTON_CONNECTED?: boolean; PRESENTON_EMAIL?: string | null; [key: string]: unknown`. `const OAUTH_MANAGED_FIELDS: readonly string[]` = `CODEX_ACCESS_TOKEN, CODEX_REFRESH_TOKEN, CODEX_TOKEN_EXPIRES, CODEX_ACCOUNT_ID, PRESENTON_CONNECTED, PRESENTON_EMAIL`. `type SettingsSection = 'text' | 'images' | 'web-search' | 'account'`; `const SETTINGS_SECTIONS: SettingsSection[]`.
- Produces (`providers.ts`):
  - `type DiscoveryKind = 'openai-compatible' | 'google' | 'anthropic' | 'ollama' | 'manual'`
  - `interface TextProviderRow { value; label; description; icon; keyField?; keyLabel?; keyOptional?; keyPlaceholder?; modelField; urlField?; urlLabel?; urlPlaceholder?; urlOptional?; defaultUrl?; discovery: DiscoveryKind; discoveryNeeds: ('key'|'url')[]; preferredModel?; getApiKeyUrl?; fields?: 'ollama'|'vertex-azure'|'bedrock'; advancedUrl?: boolean }`
  - `const TEXT_PROVIDERS: TextProviderRow[]` (15 rows, order below), `textProvider(value?: string): TextProviderRow | undefined`
  - `const SIGN_IN_PROVIDERS: Record<'codex'|'presenton', { label; icon; modelField?: string }>`
  - `const IMAGE_PROVIDERS: ImageProviderRow[]` (9), `WEB_SEARCH_PROVIDERS: WebSearchProviderRow[]` (5): copy values from `utils/providerConstants.ts` (field names `apiKeyField`, `apiKeyFieldLabel`, `getApiKeyUrl`, `urlField`, `urlLabel`, `apiKeyLabel` unchanged); `DALLE_3_QUALITY_OPTIONS`, `GPT_IMAGE_1_5_QUALITY_OPTIONS`
  - `resolveDiscoveryUrl(row: TextProviderRow, config: ProviderConfig): string` — `(row.urlField ? trimmed config[urlField] : '') || row.defaultUrl || ''`
  - `canDiscover(row: TextProviderRow, config: ProviderConfig): boolean` — every entry of `discoveryNeeds` is non-empty (`'key'` → `config[keyField]`, `'url'` → `resolveDiscoveryUrl`)
  - `DEFAULT_OLLAMA_URL = 'http://host.docker.internal:11434'`, `LOCALHOST_OLLAMA_URL = 'http://localhost:11434'`
  - `CLASSIC_SETTINGS_URL = \`${__PRESENTON_BACKEND_URL__}/settings\`` (the classic app lives on the backend origin; same-origin `/settings` is now this app)

Text rows, in picker order (`keyLabel` / `modelField` / `urlField` / `defaultUrl` / `discovery`, `discoveryNeeds` / `preferredModel`). Labels, descriptions, icons, `getApiKeyUrl` come from `LLM_PROVIDERS` in `providerConstants.ts`:

| value | keyField (label) | modelField | urlField | defaultUrl | discovery · needs | preferredModel |
|---|---|---|---|---|---|---|
| openai | OPENAI_API_KEY ("OpenAI API key") | OPENAI_MODEL | — | https://api.openai.com/v1 | openai-compatible · key | gpt-4.1 |
| deepseek | DEEPSEEK_API_KEY | DEEPSEEK_MODEL | DEEPSEEK_BASE_URL (optional, `advancedUrl`) | https://api.deepseek.com/v1 | openai-compatible · key | deepseek-chat |
| google | GOOGLE_API_KEY | GOOGLE_MODEL | — | — | google · key | models/gemini-2.5-flash |
| vertex | VERTEX_API_KEY | VERTEX_MODEL | — | — | manual · — (`fields:'vertex-azure'`) | — |
| azure | AZURE_OPENAI_API_KEY | AZURE_OPENAI_MODEL | — | — | manual · — (`fields:'vertex-azure'`) | — |
| bedrock | BEDROCK_API_KEY ("Bedrock API key (optional)", `keyOptional`) | BEDROCK_MODEL | — | — | manual · — (`fields:'bedrock'`) | — |
| openrouter | OPENROUTER_API_KEY | OPENROUTER_MODEL | — | https://openrouter.ai/api/v1 | openai-compatible · key | openai/gpt-4o |
| cerebras | CEREBRAS_API_KEY | CEREBRAS_MODEL | — | https://api.cerebras.ai/v1 | openai-compatible · key | llama-3.3-70b |
| litellm | LITELLM_API_KEY (optional; placeholder "Optional if your proxy does not require auth") | LITELLM_MODEL | LITELLM_BASE_URL (required, "LiteLLM base URL", placeholder `e.g. http://host.docker.internal:4000/v1`) | — | openai-compatible · url | gpt-4.1 |
| fireworks | FIREWORKS_API_KEY | FIREWORKS_MODEL | FIREWORKS_BASE_URL (optional) | https://api.fireworks.ai/inference/v1 | openai-compatible · key | accounts/fireworks/models/llama-v3p1-8b-instruct |
| together | TOGETHER_API_KEY | TOGETHER_MODEL | TOGETHER_BASE_URL (optional) | https://api.together.ai/v1 | openai-compatible · key | openai/gpt-oss-20b |
| lmstudio | LMSTUDIO_API_KEY (optional) | LMSTUDIO_MODEL | LMSTUDIO_BASE_URL (optional) | http://localhost:1234/v1 | openai-compatible · — | openai/gpt-oss-20b |
| anthropic | ANTHROPIC_API_KEY | ANTHROPIC_MODEL | — | — | anthropic · key | claude-sonnet-4-20250514 |
| ollama | — | OLLAMA_MODEL | OLLAMA_URL | — | ollama · — (`fields:'ollama'`) | — |
| custom | CUSTOM_LLM_API_KEY ("Custom LLM API key") | CUSTOM_MODEL | CUSTOM_LLM_URL (required, placeholder "OpenAI-compatible URL") | — | openai-compatible · url | — |

- [ ] **Step 1: Write the failing tests** in `tests/unit/settings/providers.test.ts`: (a) `it.each` over the table above asserting `TEXT_PROVIDERS` order and, per row, `keyField`, `modelField`, `urlField`, `discovery`, `preferredModel`; (b) `TEXT_PROVIDERS.length === 15`, no `presenton`/`codex` row; (c) `resolveDiscoveryUrl`: openai → default; deepseek with `DEEPSEEK_BASE_URL: ' https://x/v1 '` → `'https://x/v1'`; custom empty → `''`; (d) `canDiscover`: openai false without key, true with `sk-test-fake`; litellm false without URL, true with it and no key; lmstudio always true; (e) `IMAGE_PROVIDERS.map(p => p.value)` equals `['pexels','pixabay','dall-e-3','gpt-image-1.5','gemini_flash','nanobanana_pro','comfyui','open_webui','openai_compatible']`; `WEB_SEARCH_PROVIDERS` values `['auto','searxng','tavily','exa','brave']`.
- [ ] **Step 2:** Run `npx vitest run tests/unit/settings/providers.test.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement `types.ts`, `providers.ts`; copy icons (`cp -r ../servers/nextjs/public/providers public/providers`; icon paths in rows are `/providers/<file>`). Add `src/env.d.ts` nothing (the define already exists).
- [ ] **Step 4:** Run the test → PASS; `npx vue-tsc -b` → clean.
- [ ] **Step 5:** `git add frontend/src/settings frontend/public/providers frontend/tests/unit/settings && git commit -m "feat(frontend): settings provider tables and config type"`

---

### Task 2: Normalise and validate

**Files:**
- Create: `src/settings/codexModels.ts`, `src/settings/normalise.ts`, `src/settings/validate.ts`
- Test: `tests/unit/settings/normalise.test.ts`, `tests/unit/settings/validate.test.ts`

**Interfaces:**
- Consumes: `ProviderConfig`, `SettingsSection` (Task 1).
- Produces:
  - `codexModels.ts`: `CODEX_MODEL_IDS` (copy of the ids in `utils/codexModels.ts`), `isSupportedCodexModel(model?: string): boolean`.
  - `normalise.ts`: `normaliseConfig(config: ProviderConfig): ProviderConfig` — port of `normalizeLLMConfig` (`// Ported from servers/nextjs/utils/storeHelpers.ts`), pure, returns a copy.
  - `validate.ts`: `interface ConfigIssue { message: string; section: Exclude<SettingsSection, 'account'> }`; `validateConfig(config: ProviderConfig): ConfigIssue | null` — port of `getLLMConfigValidationError` (normalises first; messages copied **verbatim**, codex branch included). Section: text-provider checks and "Select a text provider." / max-tokens → `'text'`; the "Select an image provider…" check and every image-provider branch → `'images'`; web-search checks → `'web-search'`.

- [ ] **Step 1: Write failing tests.** `normalise.test.ts` cases: `'true'|'1'|'yes'|'on'` → `true` and `'false'|'0'|'no'|'off'` → `false` for `DISABLE_IMAGE_GENERATION`, `WEB_GROUNDING`, `OPENROUTER_ALLOW_FALLBACKS`; garbage string left as is; `LLM_MAX_OUTPUT_TOKENS: '4096'` → `4096`, `'abc'` stays; `LLM_GENERATION_PROFILE` is `''` unless it is `'model_max'` with no manual token limit; `LLM_REASONING_BUDGET_TOKENS` always `''`; `LLM_REASONING_EFFORT: 'none'` → `''`; `OPENROUTER_PROVIDER_ORDER: 'a, b,,c'` → `['a','b','c']`; input not mutated. `validate.test.ts`: `it.each` rows `[patch, message, section]`, one row **per message and branch in `getLLMConfigValidationError`** (every text provider's key/model/URL branch, vertex both-modes conflict, bedrock key-or-AWS, each image provider, openai_compatible needing three fields, each web-search provider, `'Select a text provider.'`, `'Unsupported or unknown text provider.'`, codex without/with unsupported model), expected strings copied from the old file; plus valid configs returning `null` for: presenton, a complete openai config with images disabled, a complete codex config (`CODEX_MODEL: 'gpt-5.4'`), lmstudio with only a model, WEB_GROUNDING with `auto`.
- [ ] **Step 2:** Run both files → FAIL.
- [ ] **Step 3:** Implement the three modules as ports; keep `isProvided` semantics (`'' | null | undefined` are "not provided").
- [ ] **Step 4:** Run both files → PASS.
- [ ] **Step 5:** Commit `feat(frontend): settings normalise and validate ports`.

---

### Task 3: API modules

**Files:**
- Create: `src/api/providerSettings.ts`, `src/api/providerModels.ts`
- Test: `tests/unit/api/providerSettings.test.ts`, `tests/unit/api/providerModels.test.ts` (mock `fetch` like `tests/unit/api/next-routes.test.ts`)

**Interfaces:**
- Consumes: `requestJson`, `guardedFetch`, `readSse` (`src/api/sse.ts`), `ProviderConfig`, `DEFAULT_OLLAMA_URL`, `LOCALHOST_OLLAMA_URL`.
- Produces (`providerSettings.ts`): `getProviderSettings(): Promise<ProviderConfig>` (`GET /api/v1/admin/provider-settings`); `saveProviderSettings(config: ProviderConfig): Promise<ProviderConfig>` (`PUT`, JSON body); `getCodexAuthStatus(): Promise<string>` (`GET /api/v1/ppt/codex/auth/status` → `.status`, `''` on any failure); `getPresentonLinkStatus(): Promise<boolean>` (`GET /api/v1/auth/presenton/status` → `.linked === true`, `false` on failure).
- Produces (`providerModels.ts`):
  - `listOpenAiCompatibleModels(p: { url: string; apiKey: string }): Promise<string[]>` → `POST /api/v1/ppt/openai/models/available` body `{ url, api_key }`
  - `listGoogleModels(apiKey: string): Promise<string[]>`, `listAnthropicModels(apiKey: string): Promise<string[]>` → `POST /api/v1/ppt/{google|anthropic}/models/available` body `{ api_key }`
  - All three: result filtered to strings; a non-array body → `[]`.
  - `interface OllamaModelInfo { name: string; parameters: string | null; size: number | null }`, `interface OllamaLibraryModel { name; description; parameters; size: string }`, `type OllamaPullEvent = { type: 'status'|'progress'|'complete'|'error'; status?; total?; completed?; progress?; model?; detail? }`
  - `listOllamaModels(url: string): Promise<OllamaModelInfo[]>` → `GET /api/v1/ppt/ollama/models/available?ollama_url=` (trailing slashes stripped; non-array → throws `Error('Ollama returned an invalid model list')`)
  - `listReachableOllamaModels(url?: string): Promise<{ models: OllamaModelInfo[]; resolvedUrl: string; usedFallback: boolean }>` — tries `url || DEFAULT_OLLAMA_URL`; if that equals `DEFAULT_OLLAMA_URL` and fails, retries `LOCALHOST_OLLAMA_URL` (port of `getReachableOllamaModels`).
  - `listOllamaLibrary(): Promise<OllamaLibraryModel[]>` → `GET /api/v1/ppt/ollama/models/library`
  - `pullOllamaModel(name: string, url: string, onEvent: (e: OllamaPullEvent) => void, signal?: AbortSignal): Promise<void>` → `POST …/pull?model_name=&ollama_url=` read with `readSse`; a `complete` or `error` event ends it (port of `pullOllamaModel` in `utils/providerUtils.ts`).
  - `listOpenRouterProviders(p: { model: string; apiKey: string; baseUrl?: string }): Promise<string[]>` → port the request from `components/AdvancedTextProviderSettings.tsx` (`POST /api/v1/ppt/openrouter/providers/available`).
  - `getGenerationDefaults(): Promise<{ defaultMaxOutputTokens: number }>` → `POST /api/v1/ppt/generation/defaults`, mapped as the old component does, falling back to `8192` on failure.
  - `checkStockImageKey(provider: 'pexels' | 'pixabay', apiKey: string): Promise<void>` → `GET /api/v1/ppt/images/search?query=business&limit=1&provider=<provider>&strict_api_key=true`; key sent as header `X-Provider-Api-Key` only (omitted when empty or `'__configured__'`); non-2xx → throws `ApiError` whose message is the server detail or `Unable to reach <provider> with the provided API key. Please verify your settings and try again.`

- [ ] **Step 1: Write failing tests.** Per function: URL, method, body, headers asserted from `fetch.mock.calls`. Shared assertion helper `expectNoSecretInUrl(call, 'sk-test-fake')` used for every function that takes a key: the URL string never contains it. `checkStockImageKey`: header present with the key; absent for `'__configured__'`; failure message does not contain the key. `listReachableOllamaModels`: falls back to localhost once; does not fall back when a custom URL fails (rejects). `pullOllamaModel`: feeds an SSE `Response` (`event: progress\ndata: {...}\n\n`…) and expects ordered `onEvent` calls and stop at `complete`. `saveProviderSettings` 403 rejects with `ApiError` status 403.
- [ ] **Step 2:** Run both files → FAIL.
- [ ] **Step 3:** Implement. Use `requestJson` for JSON endpoints; `guardedFetch` + `readSse` for the pull.
- [ ] **Step 4:** Run both files → PASS; `npx vue-tsc -b` clean.
- [ ] **Step 5:** Commit `feat(frontend): provider settings and model discovery api`.

---

### Task 4: Session runtime refresh, summaries, section helpers

**Files:**
- Modify: `src/stores/session.ts` (export `refreshRuntime`)
- Create: `src/settings/summary.ts`
- Test: `tests/unit/settings/summary.test.ts`; extend the existing session-store test if one exists (search `tests/unit` for `useSessionStore`), else add `tests/unit/settings/session-refresh.test.ts`

**Interfaces:**
- Consumes: tables from Task 1, `getRuntimeConfig`.
- Produces:
  - `session.refreshRuntime(): Promise<void>` — re-fetches `/api/runtime-config` and replaces `runtime`; on failure keeps the previous value. (Expose the existing private `loadRuntime`.)
  - `summary.ts`: `textSummary(config): string` (`"OpenAI (gpt-4.1)"`, label alone without model, `"No text provider"`; unknown value → the raw value), `imageSummary(config): string` (`"Cloud images"` for presenton, `"Image generation disabled"`, provider label, `"No image provider"`), `webSearchSummary(config): string` (`"Cloud web search"`, `"Web: <label>"`, `"Web search disabled"`), `sectionSubtitle(section: SettingsSection, config): string` (account → `''`). Port the logic of `SettingPage.tsx` lines "textProviderKey … webSearchSummary"; codex/presenton labels from `SIGN_IN_PROVIDERS`; model field from `textProvider(...)?.modelField` or `CODEX_MODEL`.
  - `isSecretKey(name: string): boolean` — `/(_API_KEY|_SECRET|_TOKEN|PASSWORD)/` pattern used by the read-only summary to guarantee it never shows secrets.

- [ ] **Step 1: Failing tests.** `summary.test.ts`: one case per summary string above; `config.LLM='codex', CODEX_MODEL='gpt-5.4'` → `"ChatGPT (gpt-5.4)"`; the rendered subtitles for `{ LLM:'openai', OPENAI_API_KEY:'sk-test-fake', OPENAI_MODEL:'gpt-4.1' }` never contain `sk-test-fake`; `isSecretKey('OPENAI_API_KEY')` true, `isSecretKey('OPENAI_MODEL')` false. Session test: after `refreshRuntime`, `runtime.value.config.LLM` equals the new mock response; a rejected fetch leaves the old runtime.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS (`npx vitest run tests/unit/settings tests/unit/AppShell.test.ts`).
- [ ] **Step 5:** Commit `feat(frontend): settings summaries and runtime refresh`.

---

### Task 5: `useSettingsAccess`

**Files:**
- Create: `src/composables/useSettingsAccess.ts`
- Test: `tests/unit/settings/useSettingsAccess.test.ts`

**Interfaces:**
- Consumes: `useSessionStore` (`user.role`), `getProviderSettings`, `ApiError`.
- Produces: `type AccessMode = 'loading' | 'edit' | 'locked' | 'managed' | 'error'`; `useSettingsAccess(): { mode: Ref<AccessMode>; config: Ref<ProviderConfig | null>; error: Ref<string>; reload(): Promise<void> }`. Calling `reload()` is done once on creation. Rules (spec §1): role `!== 'admin'` → `managed` and the admin endpoint is **never called**; admin + GET ok → `edit` with `config`; admin + `ApiError` 403 → `locked`; any other failure → `error` with a message from `extractApiErrorMessage` (`src/api/errors.ts`). A stale `reload` must not overwrite a newer one.

- [ ] **Step 1: Failing tests** (mock `@/api/providerSettings`, set the Pinia session user): non-admin → `managed` and `getProviderSettings` not called; no user at all → `managed`; admin ok → `edit` and config returned; admin 403 → `locked`; admin 500 and network `TypeError`-style `BackendUnreachableError` → `error` with non-empty `error`; `reload()` after error recovers to `edit`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(frontend): settings access modes`.

---

### Task 6: `useSettingsDraft`

**Files:**
- Create: `src/composables/useSettingsDraft.ts`
- Test: `tests/unit/settings/useSettingsDraft.test.ts`

**Interfaces:**
- Consumes: `normaliseConfig`, `validateConfig`, `OAUTH_MANAGED_FIELDS`, `saveProviderSettings`, `getCodexAuthStatus`, `getPresentonLinkStatus`, `checkStockImageKey`, `listOllamaModels`, `useSessionStore().refreshRuntime`, `toast` (vue-sonner).
- Produces: `type SaveResult = { ok: true } | { ok: false; section?: SettingsSection }`; `useSettingsDraft(): { draft: Ref<ProviderConfig>; original: Ref<ProviderConfig>; dirty: ComputedRef<boolean>; saving: Ref<boolean>; load(config: ProviderConfig): void; set(field: string, value: unknown): void; discard(): void; save(): Promise<SaveResult> }`.
- Rules:
  - `load` strips `OAUTH_MANAGED_FIELDS` and stores a deep copy in `original` and `draft`.
  - `dirty` compares `draft` and `original` after dropping keys whose value is `undefined` or `''` (typing then deleting is clean). Array/boolean/number values compare deeply.
  - `save()` steps, stopping at the first failure (toast + `{ ok:false }`): (1) `LLM==='codex'` and `getCodexAuthStatus() !== 'authenticated'` → `toast.error('Sign in to ChatGPT again', { description: 'Open the classic app to sign in, or switch to another provider.' })`; `LLM==='presenton'` and not linked → `toast.warning('Connect Presenton first', { description: 'Sign in to Presenton Cloud before selecting it as the text provider.' })`; (2) `normaliseConfig`; (3) `validateConfig` issue → `toast.warning('Cannot save settings', { description: issue.message })` and `{ ok:false, section: issue.section }`; (4) live checks: if `LLM !== 'presenton'` and not `DISABLE_IMAGE_GENERATION` and `IMAGE_PROVIDER` is pexels/pixabay → `checkStockImageKey`; if `LLM==='ollama'` and `OLLAMA_MODEL` → `listOllamaModels(OLLAMA_URL)` must contain it, else error `The selected model "<m>" is not available at <url>. Check models and select an available model.`; live-check failures → `toast.error('Cannot save settings', { description: message })` where `message` is the thrown `Error.message`; (5) `saveProviderSettings(normalised)` (body = normalised draft; OAuth fields are already absent); (6) on success `load(response)`, `await session.refreshRuntime()`, `toast.success('Settings saved', { description: 'Your configuration was saved successfully.' })`, `{ ok:true }`. Any PUT failure → `toast.error('Could not save settings', { description: extractApiErrorMessage(...) })`, draft untouched (still dirty), `{ ok:false }`. `saving` is true from step 1 to the end.
  - Guard: `save()` while `saving` returns `{ ok:false }` without a second request.

- [ ] **Step 1: Failing tests** (all collaborators mocked): `load` strips `CODEX_ACCESS_TOKEN`/`PRESENTON_EMAIL` from both copies; `set` makes dirty, `discard` restores and clears dirty; set a value then set it back to `''`/original → not dirty; save success sends a body without OAuth fields and with normalised booleans, refreshes runtime, and `dirty` is false afterwards; validation failure → no PUT, result carries `section:'images'` for a missing Pexels key; codex unauthenticated → no PUT; presenton unlinked → no PUT; Pexels check rejection → no PUT and toast text contains no key; Ollama model missing → no PUT; PUT 403 / 500 / `BackendUnreachableError` → `{ ok:false }`, `draft` unchanged, still dirty, error toast text does not contain the draft's `sk-test-fake` key; double `save()` sends one PUT; stock check skipped when `DISABLE_IMAGE_GENERATION` is true or `LLM` is presenton.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(frontend): settings draft and save flow`.

---

### Task 7: Route, nav, settings shell

**Files:**
- Modify: `src/router.ts`, `src/components/shell/NavRail.vue`
- Create: `src/views/SettingsView.vue`, `src/components/settings/SettingsSidebar.vue`, `SettingsSaveBar.vue`, `ReadOnlySummary.vue`, `AccountSection.vue`, `SectionPlaceholder.vue` (temporary, removed in Tasks 9/13/14)
- Modify tests: `tests/unit/AppShell.test.ts` (rail test + "opens Settings in a new tab" → "links Settings inside the app", add a `settings` route to its router), `tests/unit/router.test.ts`, `tests/e2e/mocked.spec.ts:68` (assert `getByRole('link', { name: 'Settings' })` has `href` `/settings/text`)
- Test: `tests/unit/settings/SettingsView.test.ts`

**Interfaces:**
- Consumes: Tasks 4–6 composables and helpers; `PageHeader`, `Alert`, `Button`, `Skeleton`.
- Produces:
  - Routes: `{ path: '/settings', redirect: '/settings/text' }`, `{ path: '/settings/:section', name: 'settings', component: () => import('@/views/SettingsView.vue'), meta: { layout: 'app' }, beforeEnter }` where an unknown `section` redirects to `{ name: 'settings', params: { section: 'text' } }`.
  - `NavRail`: Settings is a `RouterLink` to `{ name: 'settings', params: { section: 'text' } }`, `active` when `route.name === 'settings'`, no `aria-label`, no `target`.
  - Shared contract for section components (used in Tasks 9–14): props `{ config: ProviderConfig }`, emit `set: [field: string, value: unknown]`. `SettingsView` renders `<TextSection|ImagesSection|WebSearchSection :config="draft" @set="set" />` in `edit` mode.
  - `SettingsSidebar` props `{ section: SettingsSection; config: ProviderConfig }`, emits `select: [SettingsSection]`; renders each section's name and `sectionSubtitle`; vertical list, below 760px a horizontal tab row (`role="tablist"`).
  - `SettingsSaveBar` props `{ dirty: boolean; saving: boolean }`, emits `save`, `discard`; rendered only when `dirty`; Save shows a spinner while `saving` and is disabled.
  - `ReadOnlySummary` props `{ mode: 'locked' | 'managed'; config: Record<string, unknown> }` (the redacted `session.runtime.config`): shows the three summary lines and the mode message ("Provider settings are locked by this deployment." / "An administrator manages these settings."); contains no input element and no value of any key matching `isSecretKey`.
  - `AccountSection`: username and role from the session store, **Sign out** → `session.signOut()` then `router.push({ name: 'login' })`.
  - `SettingsView`: loading → `Skeleton`; `error` → destructive `Alert` + Retry (`reload`); `edit` → sidebar + section + save bar; `locked`/`managed` → sidebar (Account only is editable-free; Text/Images/Web search all render `ReadOnlySummary`) . Save: `const r = await save(); if (!r.ok && r.section) go(r.section)`. Section navigation uses `router.push({ name:'settings', params:{ section } })` and keeps the draft (same component instance). `onBeforeRouteLeave`: if `dirty`, `window.confirm('You have unsaved changes. Leave without saving?')` → cancel navigation on false. `beforeunload` listener added while dirty, removed on unmount. When `LLM==='presenton'` and the section is images/web-search, still render the section (it shows its "Managed by Presenton Cloud" notice, Tasks 13/14).
  - Until Tasks 9/13/14 land, `SectionPlaceholder` renders `Coming in this slice` for text/images/web-search.

- [ ] **Step 1: Failing tests.** `SettingsView.test.ts` (mock `useSettingsAccess`'s API module + a memory router): admin/edit shows the sidebar with all four entries and no save bar until a field is set via `set` on the draft; non-admin shows "An administrator manages these settings." and `wrapper.find('input').exists() === false`; 403 admin shows the locked message; error mode shows Retry and clicking it calls the API again; the summary never contains `sk-test-fake` even when `runtime.config` has `OPENAI_API_KEY: '__configured__'` or a real-looking key; Sign out calls `signOut` and navigates to `login`; leaving while dirty with `confirm → false` keeps the route. `router.test.ts`: `/settings` → `/settings/text`; `/settings/bogus` → `/settings/text`; `/settings/images` stays. `AppShell.test.ts`: the Settings link has `href="/settings/text"`, no `target`, text `Settings`, and `aria-current="page"` on `/settings/images`.
- [ ] **Step 2:** Run the three unit files → FAIL.
- [ ] **Step 3:** Implement the route, nav change, view and components (look at `TemplatesView.vue` for the page chrome and `workspace-card`; subtitle styling follows `TemplateCard.vue` muted text; save bar is `sticky bottom-0` inside the card).
- [ ] **Step 4:** Run `npx vitest run tests/unit/settings tests/unit/AppShell.test.ts tests/unit/router.test.ts` → PASS; `npx vue-tsc -b` clean.
- [ ] **Step 5:** Commit `feat(frontend): native settings route, nav link and shell`.

---

### Task 8: Form primitives

**Files:**
- Create: `src/components/settings/SecretInput.vue`, `ProviderPicker.vue`, `ModelCombobox.vue`
- Test: `tests/unit/settings/SecretInput.test.ts`, `ProviderPicker.test.ts`, `ModelCombobox.test.ts`

**Interfaces:**
- `SecretInput` — props `{ modelValue: string; label: string; placeholder?: string; optional?: boolean; id?: string }`, emits `update:modelValue`. Renders a `<label>` (appends " (optional)" when `optional` and the label lacks it), an `<input type="password" autocomplete="off">` that becomes `type="text"` when shown, and a toggle `button` with `aria-label` `Show API key` / `Hide API key`.
- `ProviderPicker` — props `{ modelValue: string; options: { value: string; label: string; description?: string; icon?: string }[]; placeholder: string; searchPlaceholder?: string; label?: string }`, emits `update:modelValue`. A `Popover` whose trigger shows icon + label of the selected option (or `placeholder`); content: search `Input` filtering by label/description (case-insensitive) and a list of buttons (`role="option"`, `aria-selected`), empty state "No provider found."; choosing closes the popover. Implement with plain buttons (no cmdk dependency).
- `ModelCombobox` — props `{ modelValue: string; options: string[]; providerLabel: string }`, emits `update:modelValue`. Port the behaviour of `components/CreatableModelInput.tsx`: the current value is always listed first; options de-duplicated; typing filters; a non-matching query offers a "Use “<query>”" entry; selecting emits and closes.

- [ ] **Step 1: Failing tests:** `SecretInput` — default `type=password` with `autocomplete="off"`; toggle flips to `text` and back and updates `aria-label`; typing emits the value; the label shows "(optional)" only when asked. `ProviderPicker` — opening lists all options; typing "an" filters to matching labels; clicking an option emits its `value` and closes; no match shows the empty text; trigger shows the selected label. `ModelCombobox` — current value first, duplicates removed; typing a novel id offers the "Use" entry and selecting it emits the typed id; an existing option selected emits that option.
- [ ] **Step 2:** FAIL. **Step 3:** Implement (shadcn `Popover`, `Input`, `Button`). **Step 4:** PASS (jsdom + reka-ui popover: attach to `document.body`, query via `document.body`, as other tests in `tests/unit/editor` do).
- [ ] **Step 5:** Commit `feat(frontend): settings form primitives`.

---

### Task 9: Text section (generic form, discovery, sign-in notice)

**Files:**
- Create: `src/composables/useModelDiscovery.ts`, `src/components/settings/TextSection.vue`, `ProviderFields.vue`, `SignInProviderNotice.vue`
- Modify: `src/views/SettingsView.vue` (render `TextSection` for `text`); delete `SectionPlaceholder` usage for `text`
- Test: `tests/unit/settings/useModelDiscovery.test.ts`, `tests/unit/settings/TextSection.test.ts`

**Interfaces:**
- Consumes: `TEXT_PROVIDERS`, `textProvider`, `canDiscover`, `resolveDiscoveryUrl`, `SIGN_IN_PROVIDERS`, `CLASSIC_SETTINGS_URL`, `DEFAULT_OLLAMA_URL`, discovery API functions, Task 8 primitives, `toast`.
- Produces:
  - `useModelDiscovery(opts: { row: Ref<TextProviderRow | undefined>; config: Ref<ProviderConfig>; set: (field: string, value: unknown) => void }): { models: Ref<string[]>; checked: Ref<boolean>; loading: Ref<boolean>; check(): Promise<void> }`. `check()` is a no-op when loading, `row.discovery` is `manual`/`ollama`, or `!canDiscover`. It picks the API by `row.discovery`, with `{ url: resolveDiscoveryUrl(row, config), apiKey }` for openai-compatible. On success: `models` set, `checked = true`; if models are non-empty and `config[modelField]` is empty, `set(modelField, preferredModel if listed else models[0])`. On `ApiError`/other failure: `models = []`, `checked = true`, `toast.error('Could not load models', { description: \`${message} You can enter a model ID manually.\` })` (message from the error, never including the key). A watcher on `row.value?.value`, the row's key value and `resolveDiscoveryUrl` result resets `models=[]`, `checked=false`.
  - `TextSection` props `{ config: ProviderConfig }`, emit `set`. Layout per spec §3: `ProviderPicker` (15 rows; `placeholder` "Select text provider"); picking a provider emits `set('LLM', value)` and, for ollama with an empty `OLLAMA_URL`, `set('OLLAMA_URL', DEFAULT_OLLAMA_URL)`; line "ChatGPT sign-in and Presenton Cloud are set up in the classic app." with a link (`SignInProviderNotice`, `href=CLASSIC_SETTINGS_URL`, `target=_blank`, `rel=noopener`). Below: `ProviderFields` for the selected row, then `AdvancedTextSettings` (Task 12; omitted until then).
  - When `config.LLM` is `codex` or `presenton`: render only a read-only card (icon, label, model or `PRESENTON_EMAIL`/"Connected account" — never any token), the classic-app link and a **Switch to another provider** button that reveals the picker (local `switching` ref); picking any provider leaves read-only mode. `PRESENTON_*`/`CODEX_*` secrets are never rendered.
  - `ProviderFields` props `{ row: TextProviderRow; config: ProviderConfig }`, emit `set`. Renders, for rows with no `fields` and not `ollama`: `SecretInput` for `keyField` (label from `keyLabel`, optional flag, placeholder from `keyPlaceholder` else `Enter your <keyLabel>`), the row's `urlField` input (plain text, label `urlLabel` + " (optional)" when `urlOptional`; DeepSeek's sits in a collapsible "Advanced settings" that starts open when the value is non-empty), a "Get an API key" link when `getApiKeyUrl`, a **Check models** button (disabled unless `canDiscover`, spinner "Checking for models…" while loading), and after `checked` a `ModelCombobox` bound to `modelField`. If `checked` and `models` is empty show the note "No models were discovered. You can still enter a valid model ID or alias manually above." For `fields` rows (`ollama`, `vertex-azure`, `bedrock`) it delegates to the dedicated component (Tasks 10–11) — until those land, render nothing for them.

- [ ] **Step 1: Failing tests.** `useModelDiscovery.test.ts` (mock discovery APIs, `toast`): openai check calls `listOpenAiCompatibleModels({ url:'https://api.openai.com/v1', apiKey:'sk-test-fake' })` and, with an empty model, selects `gpt-4.1` when listed else the first; keeps an existing model; google/anthropic call their own APIs; lmstudio checks with no key; failure sets `checked` true with empty models and calls `toast.error('Could not load models', …)` whose description contains "You can enter a model ID manually." and not the key; **stale models cleared** when the provider changes, when the key changes, and when `DEEPSEEK_BASE_URL` changes (Review Focus 1); `check()` is a no-op when `canDiscover` is false. `TextSection.test.ts`: picker shows the 15 providers and no ChatGPT/Presenton; picking Anthropic emits `set('LLM','anthropic')`; picking Ollama with empty URL also emits `set('OLLAMA_URL', DEFAULT_OLLAMA_URL)`; typing a key emits `set('ANTHROPIC_API_KEY', …)`; **Check models** disabled until a key; a config with `LLM:'codex'` shows the read-only card, the classic link with `href` starting `http://backend.test:5001/settings`, no input, and **Switch to another provider** reveals the picker; `LLM:'presenton'` with `PRESENTON_EMAIL:'a@b.test'` shows the email, no token text; **empty config** (`{}`) renders without error and shows the picker placeholder (Review Focus 3); a switch A→B→A in a harness that keeps the config object retains A's key value.
- [ ] **Step 2:** Run both files → FAIL. **Step 3:** Implement. **Step 4:** PASS; `npx vue-tsc -b` clean.
- [ ] **Step 5:** Commit `feat(frontend): settings text provider section`.

---

### Task 10: Vertex/Azure and Bedrock fields

**Files:**
- Create: `src/components/settings/VertexAzureFields.vue`, `BedrockFields.vue`
- Modify: `ProviderFields.vue` (delegate for `fields: 'vertex-azure' | 'bedrock'`)
- Test: `tests/unit/settings/VertexAzureFields.test.ts`, `BedrockFields.test.ts`

**Interfaces:** props `{ provider: 'vertex' | 'azure'; config: ProviderConfig }` / `{ config: ProviderConfig }`; emit `set: [field: string, value: unknown]`. Ported from `components/VertexAzureManualFields.tsx` and `components/BedrockManualFields.tsx` (read both; keep every field, label, placeholder, and the show/hide of secret inputs via `SecretInput`).
- Vertex: model (`VERTEX_MODEL`, placeholder `e.g. gemini-2.5-flash`), API key (`VERTEX_API_KEY`) **or** project (`VERTEX_PROJECT`), region (`VERTEX_LOCATION`, placeholder `e.g. us-central1`), custom endpoint (`VERTEX_BASE_URL`), exactly as the old component arranges key vs project modes.
- Azure: API key (`AZURE_OPENAI_API_KEY`), endpoint (`AZURE_OPENAI_ENDPOINT`), model name (`AZURE_OPENAI_MODEL`), API version (`AZURE_OPENAI_API_VERSION`, placeholder `e.g. 2024-12-01-preview`), plus the old component's optional base URL / deployment fields.
- Bedrock: model, region, API key (optional), AWS access key ID, AWS secret access key (secret input), and the collapsed advanced pair session token / profile name.

- [ ] **Step 1: Failing tests:** each visible input emits `set` with the exact config key (`it.each` over field label → key); secret fields are `type=password`; Vertex in project mode does not show the key input and vice versa, mirroring the old component; Bedrock advanced pair hidden until expanded (or open when a value exists).
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(frontend): vertex, azure and bedrock provider fields`.

---

### Task 11: Ollama fields

**Files:**
- Create: `src/components/settings/OllamaFields.vue`
- Modify: `ProviderFields.vue` (delegate for `fields: 'ollama'`)
- Test: `tests/unit/settings/OllamaFields.test.ts`

**Interfaces:** props `{ config: ProviderConfig }`, emit `set`. Ported from `components/OllamaConfig.tsx` (read it). Behaviour: URL input (`OLLAMA_URL`; editing it clears `OLLAMA_MODEL`); **Check models** → `listReachableOllamaModels(OLLAMA_URL)`: sets `OLLAMA_URL` to `resolvedUrl` when it differs, lists installed models in a select bound to `OLLAMA_MODEL` (pick the first when none chosen), and fetches `listOllamaLibrary()`; a failure toasts `Could not connect to Ollama` (`${message} You can enter a model ID manually.`) and clears `OLLAMA_MODEL`. Library entries not installed show a **Pull** button → `pullOllamaModel(name, url, onEvent, signal)` with a `Progress` bar (percent from `progress` or `completed/total`), status text, **Cancel** (aborts), and on `complete` re-checks the models and selects the pulled model; `error` events show the detail.

- [ ] **Step 1: Failing tests** (mock `@/api/providerModels`): Check models with a reachable fallback emits `set('OLLAMA_URL', 'http://localhost:11434')` and lists installed models; selecting one emits `set('OLLAMA_MODEL', …)`; failure toasts and emits `set('OLLAMA_MODEL','')`; editing the URL emits `set('OLLAMA_URL', …)` and `set('OLLAMA_MODEL','')`; pulling streams `progress` events into the bar (assert `aria-valuenow`), `complete` triggers a re-check and selects the pulled model; Cancel aborts the signal passed to `pullOllamaModel`; an `error` event shows its detail and leaves the model unchanged.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(frontend): ollama provider fields`.

---

### Task 12: Advanced text settings

**Files:**
- Create: `src/components/settings/AdvancedTextSettings.vue`
- Modify: `TextSection.vue` (render for every non-sign-in provider)
- Test: `tests/unit/settings/AdvancedTextSettings.test.ts`

**Interfaces:** props `{ config: ProviderConfig }`, emit `set`. Ported from `components/AdvancedTextProviderSettings.tsx` (read it; keep its controls, copy and field semantics): "Use model maximum" checkbox (`LLM_GENERATION_PROFILE: 'model_max'` with `LLM_MAX_OUTPUT_TOKENS` cleared; unchecking clears the profile) and Max output tokens input (`LLM_MAX_OUTPUT_TOKENS`, placeholder from `getGenerationDefaults()`); reasoning mode (`LLM_REASONING_MODE`: model default → `''`, `auto|enabled|disabled`; changing it resets effort/budget as the old component does) and reasoning effort (`LLM_REASONING_EFFORT`); when `config.LLM==='openrouter'` the routing options: provider order (chips from `listOpenRouterProviders({ model: OPENROUTER_MODEL, apiKey: OPENROUTER_API_KEY, baseUrl: OPENROUTER_BASE_URL })`, stored as `OPENROUTER_PROVIDER_ORDER: string[]`), allow fallbacks, require parameters, data collection (`allow|deny`), ZDR; a **Reset to defaults** that sets to `''`/`[]` exactly the fields the old `reset` handler clears (`LLM_GENERATION_PROFILE`, `LLM_MAX_OUTPUT_TOKENS`, `LLM_REASONING_MODE`, `LLM_REASONING_EFFORT`, `LLM_REASONING_BUDGET_TOKENS`, `DISABLE_THINKING`, `EXTENDED_REASONING`, `OPENROUTER_PROVIDER_ORDER`, `OPENROUTER_ALLOW_FALLBACKS`, `OPENROUTER_REQUIRE_PARAMETERS`, `OPENROUTER_DATA_COLLECTION`, `OPENROUTER_ZDR`).

- [ ] **Step 1: Failing tests** (mock `getGenerationDefaults`, `listOpenRouterProviders`): ticking "Use model maximum" emits `set('LLM_GENERATION_PROFILE','model_max')` and `set('LLM_MAX_OUTPUT_TOKENS','')`; typing 4096 emits `set('LLM_MAX_OUTPUT_TOKENS','4096')` (normalise converts it); changing reasoning mode emits the reset of effort/budget; OpenRouter routing controls only render for `openrouter`; **Reset to defaults** emits `set` for each listed field with an empty value; defaults fetch failure still renders with placeholder `8192`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(frontend): advanced text provider settings`.

---

### Task 13: Images section

**Files:**
- Create: `src/components/settings/ImagesSection.vue`
- Modify: `SettingsView.vue` (render for `images`)
- Test: `tests/unit/settings/ImagesSection.test.ts`

**Interfaces:** props `{ config: ProviderConfig }`, emit `set`. Ported from `settings/ImageProvider.tsx` (read it): "Generate images" `Switch` (checked = `!DISABLE_IMAGE_GENERATION`; toggling emits `set('DISABLE_IMAGE_GENERATION', !checked)`); `ProviderPicker` over `IMAGE_PROVIDERS` writing `IMAGE_PROVIDER`; per provider: key field via `SecretInput` (`apiKeyField`/`apiKeyFieldLabel`, "Get an API key" link from `getApiKeyUrl`) for pexels, pixabay, dall-e-3, gpt-image-1.5, gemini_flash, nanobanana_pro; quality `Select` for dall-e-3 (`DALL_E_3_QUALITY`, shown default `standard`) and gpt-image-1.5 (`GPT_IMAGE_1_5_QUALITY`, shown default `low`); ComfyUI: URL (`COMFYUI_URL`, placeholder `http://192.168.1.7:8188`) and workflow `<textarea>` (`COMFYUI_WORKFLOW`, placeholder as the old file); Open WebUI: `OPEN_WEBUI_IMAGE_URL` (placeholder `http://localhost:3000/api/v1`) and `OPEN_WEBUI_IMAGE_API_KEY`; `openai_compatible`: `OPENAI_COMPAT_IMAGE_BASE_URL`, `OPENAI_COMPAT_IMAGE_API_KEY` (secret), `OPENAI_COMPAT_IMAGE_MODEL` (placeholder `e.g. dall-e-3, gpt-image-1`). When switched off the provider controls are hidden. When `config.LLM==='presenton'`: only "Managed by Presenton Cloud".

- [ ] **Step 1: Failing tests:** `it.each` over the 9 providers asserting the exact set of fields rendered and the `set` key each emits (DALL·E 3 and GPT Image both bind `OPENAI_API_KEY`; Gemini Flash and NanoBanana Pro bind `GOOGLE_API_KEY`); quality selects present only for the two OpenAI models; switch off hides the picker and emits `DISABLE_IMAGE_GENERATION: true`; presenton shows "Managed by Presenton Cloud" and no inputs; empty config renders the picker placeholder.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(frontend): settings images section`.

---

### Task 14: Web search section

**Files:**
- Create: `src/components/settings/WebSearchSection.vue`
- Modify: `SettingsView.vue` (render for `web-search`; delete `SectionPlaceholder.vue`)
- Test: `tests/unit/settings/WebSearchSection.test.ts`

**Interfaces:** props `{ config: ProviderConfig }`, emit `set`. Ported from `settings/WebSearchProvider.tsx` (read it for the switch's default-provider behaviour and copy): "Web search" `Switch` → `WEB_GROUNDING`; `ProviderPicker` over `WEB_SEARCH_PROVIDERS` → `WEB_SEARCH_PROVIDER`; the provider's field (`urlField` plain input with placeholder `https://search.example.com` for SearXNG; `apiKeyField` via `SecretInput` for Tavily/Exa/Brave); max results number input → `WEB_SEARCH_MAX_RESULTS` (displayed default `"5"`, emitted as a string). `LLM==='presenton'` → "Managed by Presenton Cloud".

- [ ] **Step 1: Failing tests:** `it.each` over the 5 providers: field rendered and `set` key (`SEARXNG_BASE_URL`, `TAVILY_API_KEY`, `EXA_API_KEY`, `BRAVE_SEARCH_API_KEY`; `auto` has none); switch emits `WEB_GROUNDING`; provider controls hidden when off; max results shows `5` by default and emits a string; presenton notice; empty config renders.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(frontend): settings web search section`.

---

### Task 15: Mocked e2e and full check

**Files:**
- Modify: `tests/e2e/mocked.spec.ts` (new `test.describe('settings', …)` block; extend `mockApi` overrides only via the existing `overrides` parameter)
- Modify: `frontend/README.md` only if it lists routes (add `/settings/:section`)

**Interfaces:** consumes the whole slice. Mocked admin config used by every settings test: `{ LLM:'openai', OPENAI_API_KEY:'sk-test-fake', OPENAI_MODEL:'gpt-4.1', DISABLE_IMAGE_GENERATION:true, WEB_GROUNDING:false }` served by `GET /api/v1/admin/provider-settings`.

- [ ] **Step 1: Write the e2e tests** (they fail until the full slice works end to end):
  1. `rail Settings link opens the in-app settings page`: from `/`, click the `Settings` link → URL `/settings/text`, heading "Settings", no new page opened.
  2. `admin switches to Anthropic and saves`: pick Anthropic, type `sk-ant-test-fake` into the key field, **Check models** (mock `POST /api/v1/ppt/anthropic/models/available` → `["claude-sonnet-4-20250514","claude-haiku-4-5"]`), choose `claude-sonnet-4-20250514`, **Save** (mock `PUT …/provider-settings`, capture `route.request().postDataJSON()`, respond with the body); assert the body has `LLM:'anthropic'`, `ANTHROPIC_API_KEY:'sk-ant-test-fake'`, `ANTHROPIC_MODEL:'claude-sonnet-4-20250514'`, contains no `CODEX_*`/`PRESENTON_*` keys; a "Settings saved" toast appears; the save bar disappears; `GET /api/runtime-config` was requested again; `unexpected` is empty.
  3. `admin save with a missing key shows the validation toast and sends no request`: pick Anthropic without a key → Save → toast "Cannot save settings" with "Anthropic API key is required."; zero PUTs.
  4. `regular user sees the read-only summary`: auth status role `user`, runtime config `{LLM:'openai',OPENAI_MODEL:'gpt-4.1',OPENAI_API_KEY:'__configured__'}` → text "An administrator manages these settings.", `page.locator('input')` count 0 inside the settings card, `provider-settings` never requested, page text does not contain `__configured__`.
  5. `locked deployment shows the locked message`: `GET provider-settings` → 403 → "Provider settings are locked by this deployment."
  6. `leaving with unsaved changes asks for confirmation`: dirty draft, click Library, `page.on('dialog')` dismisses once → still on `/settings/text`; accept → navigates to `/`.
  7. `a failed save keeps the draft`: PUT → 500 → toast "Could not save settings", Save bar still shown, the typed key still in the input.
- [ ] **Step 2:** Run `npx playwright test tests/e2e/mocked.spec.ts -g "settings|Settings"` → expect all pass (fix defects found in earlier tasks in their own files).
- [ ] **Step 3:** Run `npm run check` from `frontend/`; paste the real tail of the output into the report. Run the full mocked suite `npx playwright test tests/e2e/mocked.spec.ts` and report pass/fail counts. Do not run `live.spec.ts` (needs `E2E_USER`/`E2E_PASSWORD`); say it was not run.
- [ ] **Step 4:** Confirm scope: `git diff --stat main..HEAD -- . ':!frontend' ':!docs'` prints nothing (no file outside `frontend/` and `docs/` changed).
- [ ] **Step 5:** Commit `test(frontend): mocked e2e for settings`.

---

## Self-review

- **Spec coverage:** §1 routes/nav/access → Tasks 5, 7; §2 layout, save bar, unsaved-changes guard → Task 7; §3 Text (picker, generic form, discovery, Ollama, Vertex/Azure, Bedrock, DeepSeek advanced, Advanced panel, sign-in notice and read-only state) → Tasks 9–12; Images → 13; Web search → 14; Account → 7; §4 API modules → 3, draft/save flow → 6, summary → 4, secrets → constraints plus tests in 3, 6, 8; assets → 1; §5 errors → 6, 7, 9; §6 tests → each task plus 15. Success criterion 4 (no file outside `frontend/`) → Task 15 step 4.
- **Decisions the plan makes beyond the spec (report these):** the classic-app link uses the backend origin (`__PRESENTON_BACKEND_URL__ + '/settings'`) because same-origin `/settings` now belongs to this app; leaving with unsaved changes uses `window.confirm`; the Ollama models cache from the old app is not ported; `dirty` ignores empty-string vs absent.
- **Type consistency:** `ProviderConfig`, `SettingsSection`, `TextProviderRow`, `ConfigIssue`, `SaveResult`, `AccessMode` are defined in Tasks 1, 2, 5, 6 and used with the same names later; section components share `{ config }` + `set` from Task 7.
