# Vue frontend — Phase 3, slice 1: Settings and providers — design

Date: 2026-11-17. Status: approved design, awaiting plan.

## Intent

**Goal:** remove the most common reason to open the classic app. The rail's
Settings link (`components/shell/NavRail.vue`, today "Settings (classic app)",
`href="/settings"` in a new tab) becomes a native `/settings` in the new
frontend, where an admin chooses and configures text, image and web-search
providers.

**Success criteria:**

1. The rail's Settings entry is an in-app `RouterLink`; the "classic app"
   label is gone.
2. An admin on a deployment that allows key changes can configure every
   key-based provider the old page offers, and a save is accepted or rejected
   exactly as the old page would (same normalisation, same validation, same
   live checks), producing the same stored config.
3. Users who cannot edit see a read-only summary without any secret.
4. No file outside `frontend/` and this spec/plan is modified.
5. `npm run check` passes; new unit and mocked e2e tests cover the slice.

**Decisions made with the user (2026-11-17):**

- Phase 3 slicing: settings/providers (this slice), then admin, onboarding,
  community, fonts. One spec and one plan per slice.
- Read and write the config through **FastAPI directly**
  (`/api/v1/admin/provider-settings`), not through the Next.js
  `/api/user-config` proxy.
- Slice 1 covers **everything except the two sign-in providers**
  (ChatGPT/Codex OAuth and Presenton Cloud device login), which become a
  follow-up slice.
- Users who cannot edit get a **read-only summary** (not a redirect).
- Provider forms are driven by a **provider table plus a generic form**, with
  dedicated components only where a provider genuinely differs.

**Assumptions:** the FastAPI endpoints listed below are stable; desktop first,
responsive like the rest of the app.

## Findings that shaped the design

- nginx routes `/api/v1/` and `/api/v2/` to FastAPI and everything else under
  `/api` to Next.js; Vite proxies all of `/api` to `:5001`. The Next.js routes
  are reachable from the new frontend (probed: 401 without a session).
- `/api/user-config` stores nothing itself. For admins it forwards to FastAPI
  `GET/PUT /api/v1/admin/provider-settings`
  (`servers/fastapi/api/v1/admin/router.py`), which keeps the config in one DB
  row (`ProviderSettings`) and mirrors it to `userConfig.json`. PUT merges the
  body into the existing config (`merge_provider_settings`): OAuth-managed
  fields (`CODEX_*`, `PRESENTON_*`) are always kept from the stored copy,
  empty optional advanced fields are removed. The endpoint returns 401
  unauthenticated, 403 for non-admins and 403 "You are not allowed to access
  this resource" when `CAN_CHANGE_KEYS=false`. GET adds
  `PRESENTON_CONNECTED` and `PRESENTON_EMAIL`.
- `/api/runtime-config` (Next.js, already used by `stores/session.ts`) is the
  redacted view for everyone: secrets replaced with `"__configured__"`.
- No Smart-mode option appears in settings.
- The Privacy toggle (`DISABLE_ANONYMOUS_TRACKING`) only drives the old app's
  Mixpanel; nothing in the new frontend or FastAPI reads it.

## Scope

In scope: routes and nav, the settings page shell, Text provider (15
key-based providers, model discovery, Ollama, advanced panel), Images (9
providers), Web search (5 providers), Account, read-only summary, save flow.

Out of scope (later slices): ChatGPT/Codex OAuth, Presenton Cloud device
login, Privacy toggle, Admin (users, API keys), onboarding (including any
"not configured yet" redirect), community, fonts. No backend or Next.js
change.

## 1. Routes, nav and access

### Routes (`frontend/src/router.ts`)

| Path | Name | View | Meta |
|---|---|---|---|
| `/settings` | — | redirect to `/settings/text` | |
| `/settings/:section` | `settings` | `views/SettingsView.vue` | `layout: 'app'` |

`section` ∈ `text | images | web-search | account`; any other value
redirects to `/settings/text`. Authenticated, lazily imported. The admin
slice will add its sections to the same list.

### Nav (`components/shell/NavRail.vue`)

The `<a href="/settings" target="_blank">` becomes a `RouterLink` to
`{ name: 'settings', params: { section: 'text' } }` with the same `link` /
`active` classes; active when the route name is `settings`. `aria-label`
"Settings (classic app)" is removed.

### Access modes

Decided once when the page loads, by `useSettingsAccess`:

| Mode | Detection | Shown |
|---|---|---|
| `edit` | `session.user.role === 'admin'` and `GET /api/v1/admin/provider-settings` succeeds | the forms |
| `locked` | admin, and that call returns 403 | summary + "Provider settings are locked by this deployment." |
| `managed` | role is not admin (the admin endpoint is never called) | summary + "An administrator manages these settings." |

Any other failure of the GET (network, 5xx) shows an error `Alert` with
Retry, not the summary.

### Read-only summary

Built from `session.runtime.config` (already redacted). Shows, per section:
text provider label and model; image provider label or "Image generation
off"; web-search provider label or "Web search off". Never shows a key or any
field matching the redaction pattern. The Account section is the same in all
modes.

## 2. Page layout

Uses `PageHeader` (title "Settings") and the `workspace-card` surface, in the
Aera look (dark studio palette, existing tokens and motion classes).

- **Section list** on the left inside the card: Text, Images, Web search,
  Account. Each entry shows its current value as a subtitle (e.g.
  "OpenAI (gpt-4.1)", "Pexels", "Web search off"), using the same summary
  rules as the old `SettingPage.tsx`. Below 760px the list becomes a
  horizontal row of tabs above the content.
- **Save bar**: one sticky bar at the bottom of the card with **Save** and
  **Discard**, shown only in `edit` mode and only when the draft differs from
  the loaded config. Save shows a spinner while running.
- **One save for the whole config**, as in the old page, because validation
  crosses sections (DALL·E 3 and GPT Image need the OpenAI key; Gemini Flash
  and NanoBanana Pro need the Google key).
- **Unsaved changes:** switching sections keeps the draft; leaving the
  settings route with a dirty draft asks for confirmation (router
  `onBeforeRouteLeave` + `beforeunload`).

## 3. Sections

### Text provider

- Searchable provider picker (shadcn `Popover` + list, icons) with the 15
  key-based providers: OpenAI, DeepSeek, Google, Vertex AI, Azure OpenAI,
  Amazon Bedrock, OpenRouter, Cerebras, LiteLLM, Fireworks, Together AI,
  LM Studio, Anthropic, Ollama, Custom.
- Selecting Ollama with no URL fills the default Ollama URL (as the old
  page).
- **Generic form** (`ProviderFields.vue`), driven by the provider row:
  API key with show/hide (label from the row, "(optional)" where the row says
  so); optional base URL field with its placeholder; "Check models" button;
  model picker that lists discovered models and accepts free entry
  (`CreatableModelInput` behaviour: the current value is always listed first;
  a failed discovery toasts "Could not load models … You can enter a model ID
  manually." and leaves free entry available). After discovery with no model
  chosen, the row's preferred default is selected if listed, else the first
  model. Discovery results are cleared when the provider, key or base URL
  changes.
- **Dedicated parts:**
  - `OllamaFields.vue`: URL, "Check models" (`GET
    /api/v1/ppt/ollama/models/available?ollama_url=`), model select, library
    list and pull (`GET /api/v1/ppt/ollama/models/library`, `POST
    /api/v1/ppt/ollama/models/pull?model_name=&ollama_url=`) with progress,
    ported from `components/OllamaConfig.tsx` and `utils/providerUtils.ts`.
  - `VertexAzureFields.vue`: manual fields (Vertex key **or**
    project/location/base URL; Azure endpoint, base URL, API version,
    deployment, model), ported from `VertexAzureManualFields.tsx`.
  - `BedrockFields.vue`: region, API key or AWS access key ID + secret +
    session token, profile name, model, ported from
    `BedrockManualFields.tsx`.
  - DeepSeek's base URL sits under a collapsible "Advanced settings", open
    when a value is set.
- **Advanced panel** (`AdvancedTextSettings.vue`, ported from
  `components/AdvancedTextProviderSettings.tsx`): use model maximum / max
  output tokens (defaults from `POST /api/v1/ppt/generation/defaults` as the
  old component does), reasoning mode, reasoning effort; for OpenRouter the
  routing options (provider order from `POST
  /api/v1/ppt/openrouter/providers/available`, allow fallbacks, require
  parameters, data collection, ZDR); a "Reset" that clears these fields.
- **Sign-in providers** (ChatGPT, Presenton): not in the picker. A line under
  the picker reads "ChatGPT sign-in and Presenton Cloud are set up in the
  classic app." with a link to `/settings` on the old app (new tab). When the
  stored `LLM` is `codex` or `presenton`, the section shows that provider
  read-only (label, model or account email) with the same link and a
  **Switch to another provider** action that opens the picker. Saving while
  `codex` is selected first calls `GET /api/v1/ppt/codex/auth/status` and
  refuses with a toast if it is not `authenticated`; while `presenton` is
  selected it calls `GET /api/v1/auth/presenton/status` and refuses unless
  `linked`.

### Images

- "Generate images" switch (`DISABLE_IMAGE_GENERATION`).
- Searchable picker with the 9 providers: Pexels, Pixabay, DALL·E 3,
  GPT Image 1.5, Gemini Flash, NanoBanana Pro, ComfyUI, Open WebUI, Custom
  (OpenAI-compatible).
- Per provider: its key field (from `IMAGE_PROVIDERS.apiKeyField`), "Get an
  API key" link, quality select for DALL·E 3 (`standard | hd`) and
  GPT Image 1.5 (`low | medium | high`), ComfyUI URL + workflow JSON
  textarea, Open WebUI URL + key, OpenAI-compatible base URL + key + model.
- With `LLM === 'presenton'`, the section shows "Managed by Presenton Cloud"
  instead of the form.

### Web search

- "Web search" switch (`WEB_GROUNDING`).
- Picker with 5 providers: Default (Model), SearXNG, Tavily, Exa, Brave.
  Each shows its URL or key field from `WEB_SEARCH_PROVIDERS`.
- Max results (`WEB_SEARCH_MAX_RESULTS`, default "5").
- With `LLM === 'presenton'`: "Managed by Presenton Cloud".

### Account

Username and role from the session store, and **Sign out**
(`session.signOut()` then `/login`). Present in every access mode.

## 4. Data, state and save flow

### API modules (typed client conventions: `unwrap`, `ApiError`)

- `api/providerSettings.ts`:
  - `getProviderSettings(): Promise<ProviderConfig>` → `GET
    /api/v1/admin/provider-settings`.
  - `saveProviderSettings(config): Promise<ProviderConfig>` → `PUT` same path.
  - `getCodexAuthStatus()`, `getPresentonLinkStatus()` for the save guard.
- `api/providerModels.ts`:
  - `listOpenAiCompatibleModels({ url, apiKey })` → `POST
    /api/v1/ppt/openai/models/available` `{ url, api_key }`.
  - `listGoogleModels(apiKey)`, `listAnthropicModels(apiKey)` → `POST
    …/google|anthropic/models/available` `{ api_key }`.
  - `listOllamaModels(url)`, `listOllamaLibrary()`, `pullOllamaModel(name,
    url)`.
  - `listOpenRouterProviders({ model, apiKey, baseUrl })`.
  - `checkStockImageKey(provider, apiKey)` → `GET
    /api/v1/ppt/images/search?query=business&limit=1&provider=&strict_api_key=true`
    with the key in the `X-Provider-Api-Key` header.
- `ProviderConfig` is a hand-written type mirroring `types/llm_config.ts`
  (the endpoint returns `dict[str, Any]`).

### Settings logic (`frontend/src/settings/`)

- `providers.ts`: `TEXT_PROVIDERS`, `IMAGE_PROVIDERS`,
  `WEB_SEARCH_PROVIDERS`. A text row holds `value`, `label`, `description`,
  `icon`, `keyField?`, `keyLabel`, `keyOptional?`, `modelField`,
  `urlField?`, `defaultUrl?`, `urlPlaceholder?`, `discovery`
  (`'openai-compatible' | 'google' | 'anthropic' | 'ollama' | 'manual'`),
  `requiresKeyForDiscovery`, `preferredModel?`, `getApiKeyUrl?`, `fields?`
  (dedicated component id). The image and web-search tables are copied from
  `utils/providerConstants.ts`.
- `normalise.ts`, `validate.ts`: `normalizeLLMConfig` and
  `getLLMConfigValidationError` ported verbatim (codex model check included,
  since a stored codex config must still validate), with a
  `// Ported from servers/nextjs/utils/storeHelpers.ts` header.
- `summary.ts`: the per-section subtitles and the read-only summary.

### Draft (`composables/useSettingsDraft.ts`)

- Loads the config (in `edit` mode), strips the OAuth-managed fields
  (`CODEX_ACCESS_TOKEN`, `CODEX_REFRESH_TOKEN`, `CODEX_TOKEN_EXPIRES`,
  `CODEX_ACCOUNT_ID`, `PRESENTON_CONNECTED`, `PRESENTON_EMAIL`) from the
  editable copy, and keeps `original` and `draft`.
- `dirty` = deep inequality of draft and original; `set(field, value)`,
  `discard()`.
- `save()` steps, stopping at the first failure with a toast:
  1. sign-in guard (codex / presenton, §3);
  2. `normalise`;
  3. `validate` → toast "Cannot save settings" with the message, and switch
     to the section that owns the failing field;
  4. live checks: stock image key for Pexels/Pixabay (when image generation
     is on), Ollama model present at the URL;
  5. `PUT` (body = normalised draft without the stripped fields; the server
     keeps its own copy of those);
  6. replace `original` with the response, refresh `session.runtime` so
     Create and the editor see the change; toast "Settings saved".

### Secrets

- Keys travel only in request bodies or the `X-Provider-Api-Key` header,
  never in URLs, query keys, toasts or logs. No `console.*` of config
  objects.
- Key inputs are `type="password"` with a show/hide toggle and
  `autocomplete="off"`.
- Test fixtures use fake keys only (`sk-test-fake`, etc.).

### Assets

Provider icons are copied from `servers/nextjs/public/providers/` to
`frontend/public/providers/`, with `LICENSE.lobe-icons`.

## 5. Errors

- Load failure: inline `Alert` with Retry.
- 403 on GET → `locked` mode (see §1). 403 on PUT → toast with the server
  message, draft kept.
- Discovery failures: toast, free entry stays available.
- Save failures: toast "Could not save settings" with the extracted message;
  draft kept, still dirty.

## 6. Testing

- **Unit (Vitest):**
  - `validate.ts` / `normalise.ts`: one case per provider branch and per
    image/web-search provider, plus normalisation rules (booleans from
    strings, `LLM_MAX_OUTPUT_TOKENS`, profile reset, provider order split).
  - `providers.ts`: one test per text provider row (key, model, URL fields,
    discovery kind, preferred model) checked against the old branches.
  - `providerSettings.ts`, `providerModels.ts` against mocked fetch,
    including that no key appears in a request URL.
  - `useSettingsDraft`: dirty tracking, discard, stripped fields, each save
    step's failure, success refreshes the runtime config.
  - `useSettingsAccess`: the three modes and the error state.
  - `summary.ts`.
- **Mocked e2e (Playwright, `tests/e2e/mocked.spec.ts`):**
  - admin switches to Anthropic with a fake key, checks models, picks one,
    saves; the PUT body is asserted.
  - admin save with a missing key shows the validation toast and sends no
    PUT.
  - regular user sees the summary and no input fields.
  - locked admin sees the locked message.
  - the rail's Settings link navigates inside the app.
- `npm run check` passes.
