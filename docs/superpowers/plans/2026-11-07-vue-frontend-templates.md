# Vue Frontend Templates Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Templates gallery (`/templates`) and template detail page (`/templates/:id`) to the Vue frontend, with rename/delete for custom templates and a "Use this template" handoff that preselects the template through `/new` → outline.

**Architecture:** Two new lazy-loaded views under the app shell, a small `components/templates/` folder, an extended `api/templates.ts`, and a `useTemplateLayouts` composable extracted from `TemplatePicker` so every template preview shares the `templateDetailKey` cache. The template choice travels only in the URL query (`?template=<id>`).

**Tech Stack:** Vue 3 `<script setup>` + TS, vue-router, @tanstack/vue-query, shadcn-vue (`components/ui/*`), Tailwind v4, lucide-vue-next, Vitest + @vue/test-utils, Playwright (mocked e2e).

**Spec:** `docs/superpowers/specs/2026-11-07-vue-frontend-templates-design.md`

## Global Constraints

- All work in `frontend/`. Never modify `servers/nextjs` or the backend.
- Template-based generation only; no smart-mode UI.
- Aera design fidelity: dark shell tokens, `rounded-card`, Manrope UI / DM Sans display, 150–250ms motion with fade + 5px rise, breakpoints 1050px / 760px. Match `PresentationCard`, `LibraryToolbar`, `PageHeader`, `DeleteDeckDialog` styling.
- No "create template" entry point anywhere.
- Copy (verbatim): gallery heading "A head start on something great."; subline "Every layout your next deck can be built from."; card affordance "View template"; no-match "No templates match “{q}”"; custom-empty "Custom templates will appear here once they’re created."; chip "Using {name}"; primary action "Use this template".
- Query keys: list `['templates']` (already used by `OutlineView`), layouts `templateDetailKey(id)` from `@/api/outlines`.
- Run from `frontend/`: `pnpm vitest run <file>` for single tests, `pnpm check` at the end.
- Commit with only the files the task touched (the working tree has unrelated uncommitted changes — never `git add -A`). Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Deleting the template you're viewing — the open detail page must not refetch it and flash a 404/error before navigating away (remove the detail query, then `router.replace`). Test in Task 5.
2. `/new?template=<deleted-or-garbage id>` — no chip, param dropped, generation flow unaffected. Test in Task 7.
3. Rename to whitespace-only or unchanged name — submit disabled, no request. Test in Task 5.
4. A custom template whose layouts fail to load — gallery card still renders and links; detail shows Retry, not a blank grid. Test in Task 3 (card) and Task 4 (detail).
5. Outline step with `?template=` when the user then picks another template — query follows the selection so a reload keeps the latest choice, and Generate sends the selected id as `layout`. Test in Task 8.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/api/templates.ts` (modify) | `TemplateSummary.kind/description`, `renameTemplate`, `deleteTemplate`, `templatesKey` |
| `src/composables/useTemplateLayouts.ts` (create) | lazy layouts/theme/fonts for one summary via `templateDetailKey` |
| `src/components/create/TemplatePicker.vue` (modify) | use the composable; scroll selected into view |
| `src/components/templates/TemplateCard.vue` (create) | gallery card |
| `src/components/templates/TemplatesToolbar.vue` (create) | search + kind filter |
| `src/components/templates/RenameTemplateDialog.vue` (create) | rename dialog |
| `src/components/templates/DeleteTemplateDialog.vue` (create) | delete confirm |
| `src/components/templates/LayoutLightbox.vue` (create) | large layout preview with prev/next |
| `src/components/templates/layoutSlide.ts` (create) | `layoutToSlide(templateId, layout, i)` helper |
| `src/views/TemplatesView.vue`, `src/views/TemplateDetailView.vue` (create) | the two pages |
| `src/router.ts`, `src/components/shell/NavRail.vue` (modify) | routes + rail link |
| `src/views/NewView.vue`, `src/views/OutlineView.vue` (modify) | handoff |

---

### Task 1: API layer

**Files:**
- Modify: `frontend/src/api/templates.ts`
- Test: `frontend/tests/unit/api/resources.test.ts` (`describe('templates')`)

**Interfaces:**
- Produces:
  - `export type TemplateKind = 'builtin' | 'custom'`
  - `TemplateSummary` adds `kind: TemplateKind; description?: string`
  - `export const templatesKey = ['templates'] as const`
  - `renameTemplate(id: string, name: string): Promise<void>` → `PATCH /api/v1/ppt/template/{template_id}` body `{ name }`
  - `deleteTemplate(id: string): Promise<void>` → `DELETE /api/v1/ppt/template/{template_id}`

- [ ] **Step 1: Write failing tests** in the existing `describe('templates')`:
  - extend `merges built-in and custom…`: scan item `general` → `{ kind: 'builtin', description: 'd' }`; add `is_default: false, description: 'cd'` to `c1` (which loses to the scan's `c1`, still `builtin`), and `c2` with `is_default: false, description: null` → `{ kind: 'custom', description: undefined }`; add `c3` with `is_default: true` → `kind: 'builtin'`.
  - `renameTemplate sends PATCH with {name}`: mock 200 `{}`; assert method `PATCH`, URL ends `/api/v1/ppt/template/c1`, body `{"name":"New"}`.
  - `deleteTemplate sends DELETE`: mock 204; assert method `DELETE`, URL ends `/api/v1/ppt/template/c1`.
  - `renameTemplate rejects with ApiError on 403`: mock 403 `{ detail: 'Built-in templates are read-only' }`; `await expect(...).rejects.toBeInstanceOf(ApiError)`.
- [ ] **Step 2: Run** `pnpm vitest run tests/unit/api/resources.test.ts` — Expected: new assertions FAIL.
- [ ] **Step 3: Implement** in `src/api/templates.ts`. Scan entries: `kind: 'builtin'`, `description: settings?.description`. List items: `kind: t.is_default ? 'builtin' : 'custom'`, `description: t.description ?? undefined`. Mutations via `unwrap(api.PATCH/DELETE(...))`, strip a `template-v2-` prefix like `getTemplate` does.
- [ ] **Step 4: Run** same command — Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): template kind, rename and delete API`.

### Task 2: `useTemplateLayouts` + TemplatePicker refactor

**Files:**
- Create: `frontend/src/composables/useTemplateLayouts.ts`, `frontend/src/components/templates/layoutSlide.ts`, `frontend/src/components/create/TemplatePickerOption.vue` (one radio option; calls the composable — composables can't run inside `v-for`)
- Modify: `frontend/src/components/create/TemplatePicker.vue`
- Test: `frontend/tests/unit/templates/useTemplateLayouts.test.ts`; existing `tests/unit/create/OutlineView.test.ts` must stay green.

**Interfaces:**
- Consumes: `TemplateSummary` (Task 1), `getTemplate`, `templateDetailKey`, `TemplateDetail` from `@/api/outlines`.
- Produces:
  - `useTemplateLayouts(template: MaybeRefOrGetter<TemplateSummary | undefined>): { layouts: ComputedRef<Record<string, unknown>[]>; theme: ComputedRef<unknown>; fonts: ComputedRef<unknown>; pending: ComputedRef<boolean>; failed: ComputedRef<boolean>; retry: () => void }`
    Backed by `useQuery({ queryKey: computed(() => templateDetailKey(id)), queryFn: () => getTemplate(id), enabled: !!template && !hasRealLayouts && layouts.length > 0 })`. When the summary already has object layouts, returns those without fetching. `retry` = `refetch`.
  - `layoutToSlide(templateId: string, layout: Record<string, unknown>, index: number): Slide` — the object `TemplatePicker.previewsFor` builds today (`id: \`${templateId}-preview-${index}\``, `content: {}`, `ui: layout`, `layout: layout.id ?? \`slide-${index}\``, `layout_group: 'template-v2'`).

- [ ] **Step 1: Write failing tests** (mount a tiny host component with `VueQueryPlugin`, mock `@/api/outlines` `getTemplate`):
  - `returns summary layouts without fetching when they are objects` → `getTemplate` not called, `layouts.value.length === 2`.
  - `fetches custom layouts and exposes theme/fonts` → `pending` true then false; `layouts`, `theme`, `fonts` from the mock.
  - `shares the templateDetailKey cache` → after load, `queryClient.getQueryData(templateDetailKey('c1'))` equals the mock detail; a second host for `c1` does not call `getTemplate` again.
  - `reports failure and retries` → first call rejects: `failed` true; `retry()` with a resolving mock → `failed` false, layouts loaded.
  - `does not fetch for zero layouts` → summary `layouts: []`: no call, `pending` false.
  - `layoutToSlide builds a template-v2 slide` → `{ id: 't-preview-0', ui: layout, layout: 'l0', layout_group: 'template-v2' }`.
- [ ] **Step 2: Run** `pnpm vitest run tests/unit/templates/useTemplateLayouts.test.ts` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** the composable and helper. Refactor `TemplatePicker.vue`: move each option's markup into `TemplatePickerOption.vue` (props `{ template: TemplateSummary; selected: boolean }`, emits `select`), which calls `useTemplateLayouts` and `layoutToSlide`; delete the `details`/`requested`/`watch` block; keep markup, `data-testid`s and `PREVIEW_COUNT`/`PREVIEW_SCALE` unchanged. Also: when `selected` changes or on mount with a value, `scrollIntoView({ block: 'nearest' })` the selected radio (guard `typeof el.scrollIntoView === 'function'` for jsdom).
- [ ] **Step 4: Run** `pnpm vitest run tests/unit/templates tests/unit/create` — Expected: PASS (OutlineView picker tests unchanged).
- [ ] **Step 5: Commit** `refactor(frontend): share template layout loading via useTemplateLayouts`.

### Task 3: Gallery, routes, nav

**Files:**
- Create: `frontend/src/views/TemplatesView.vue`, `frontend/src/components/templates/TemplateCard.vue`, `frontend/src/components/templates/TemplatesToolbar.vue`, `frontend/src/views/TemplateDetailView.vue` (placeholder `<div />` with `PageHeader`, filled in Task 4)
- Modify: `frontend/src/router.ts`, `frontend/src/components/shell/NavRail.vue`
- Test: `frontend/tests/unit/templates/TemplatesView.test.ts`, `frontend/tests/unit/router.test.ts`, `frontend/tests/unit/AppShell.test.ts`

**Interfaces:**
- Consumes: `listTemplates`, `templatesKey`, `TemplateSummary` (Task 1); `useTemplateLayouts`, `layoutToSlide` (Task 2).
- Produces: routes `templates` (`/templates`) and `template` (`/templates/:id`), both `meta: { layout: 'app' }`. `TemplateCard` props `{ template: TemplateSummary }`, root `data-testid="template-card"`. `TemplatesToolbar` `v-model:search` (string) and `v-model:kind` (`'all' | TemplateKind`).

- [ ] **Step 1: Write failing tests.**
  - `router.test.ts`: add `templates` and `template` to the named-route list and the `app` layout assertion.
  - `AppShell.test.ts`: rail renders a `Templates` link to `/templates`; it has `aria-current="page"` on `/templates/abc`.
  - `TemplatesView.test.ts` (mock `@/api/templates` `listTemplates`, `@/api/outlines` `getTemplate`, stub `SlideView` as in OutlineView test; memory router with `templates` + `template` routes):
    - `renders built-in then custom cards with meta` → names in order; meta text `2 layouts · Built-in` / `3 layouts · Custom`; each card links to `/templates/<id>`.
    - `filters by search, case-insensitive`.
    - `reads and writes ?kind` → mount at `/templates?kind=custom` shows only custom; clicking "All" leaves route query without `kind`.
    - `shows no-match state and Clear resets` → text `No templates match “zzz”`; clicking Clear restores all cards and removes `kind`.
    - `custom filter with no custom templates` → shows `Custom templates will appear here once they’re created.` and no button.
    - `list error shows Retry` → `listTemplates` rejects once; click Retry → cards render.
    - `card whose layouts fail still links` → `getTemplate` rejects; card present with link to `/templates/c1`, no skeleton.
- [ ] **Step 2: Run** `pnpm vitest run tests/unit/templates/TemplatesView.test.ts tests/unit/router.test.ts tests/unit/AppShell.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Router: two lazy routes before the catch-all.
  - NavRail: `LayoutTemplate` link after New, active when `route.name` is `templates` or `template`.
  - `TemplatesView`: `PageHeader title="Templates"`, Aera intro (copy from Global Constraints), `TemplatesToolbar`, grid with the Library grid's column classes, skeleton grid while pending, `Alert` + Retry on error, empty/no-match/custom-empty states. `kind` is a computed over `route.query.kind` (invalid → `'all'`), setter does `router.replace({ query: { ...route.query, kind: v === 'all' ? undefined : v } })`. Sort: built-in first, stable.
  - `TemplateCard`: one `RouterLink` (`aria-label="View {name}"`) wrapping cover (`SlideView` of `layoutToSlide(id, layouts[0], 0)`, `fit="width"`, `lazy`; `Skeleton` while pending; neutral placeholder if failed/none), name, meta (`{n} layouts · Built-in|Custom`, n = `template.layouts.length`), and the "View template" + `ArrowUpRight` affordance revealed on hover/focus-visible.
- [ ] **Step 4: Run** same command — Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): templates gallery and rail entry`.

### Task 4: Detail page (header, layouts grid, states)

**Files:**
- Modify: `frontend/src/views/TemplateDetailView.vue`
- Test: `frontend/tests/unit/templates/TemplateDetailView.test.ts`

**Interfaces:**
- Consumes: `listTemplates`/`templatesKey` (summary lookup by `route.params.id`), `useTemplateLayouts`, `layoutToSlide`.
- Produces: in-page DOM hooks later tasks use: `data-testid="layout-card"` buttons (with index label `01`…), `data-testid="template-actions"` overflow trigger (custom only), "Use this template" button.

- [ ] **Step 1: Write failing tests** (same mocks/router as Task 3 plus a `new` route):
  - `renders header and every layout` → name, badge `Custom`, `3 layouts`, description; 3 `layout-card`s labelled `01`,`02`,`03`.
  - `hides management actions for built-ins` → no `template-actions` for `kind: 'builtin'`.
  - `unknown id shows not-found with link back` → list loaded without the id: text `Template not found`, link to `/templates`; route unchanged.
  - `layout load error shows Retry` → `getTemplate` rejects, Retry → grid renders.
  - `zero layouts disables Use this template`.
  - `Use this template navigates to /new?template=<id>`.
  - `breadcrumb keeps the gallery filter` → at `/templates/c1` the parent link is `/templates`; at `/templates/c1?from=custom` it is `/templates?kind=custom`; an invalid `from` falls back to `/templates`. (Gallery cards link with `query: { from: kind }` when a filter is active — Task 4 Step 3 updates `TemplateCard` with a `from?: TemplateKind` prop.)
- [ ] **Step 2: Run** `pnpm vitest run tests/unit/templates/TemplateDetailView.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.** `PageHeader` with `:parent="{ label: 'Templates', to }"` and `:title="name"`; header block (display font name, `Badge`, meta, description); actions slot: primary "Use this template", and for custom a `DropdownMenu` trigger (`data-testid="template-actions"`, items wired in Task 5). Layout grid uses Aera `overview-grid` rhythm; each card a `<button data-testid="layout-card">` with `SlideView` (`lazy`, theme/fonts from composable) and the zero-padded index. Skeletons while list or layouts pend. Update `TemplateCard` link per the breadcrumb test.
- [ ] **Step 4: Run** `pnpm vitest run tests/unit/templates` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): template detail page`.

### Task 5: Rename and delete

**Files:**
- Create: `frontend/src/components/templates/RenameTemplateDialog.vue`, `frontend/src/components/templates/DeleteTemplateDialog.vue`
- Modify: `frontend/src/views/TemplateDetailView.vue`
- Test: `frontend/tests/unit/templates/TemplateDetailView.test.ts`

**Interfaces:**
- Consumes: `renameTemplate`, `deleteTemplate`, `templatesKey` (Task 1); `templateDetailKey`.
- Produces: `RenameTemplateDialog` props `{ name: string; pending?: boolean }`, `v-model:open`, emits `submit: [name: string]`. `DeleteTemplateDialog` props `{ name: string; pending?: boolean }`, `v-model:open`, emits `confirm: []`.

- [ ] **Step 1: Write failing tests:**
  - `rename updates optimistically and toasts` → open menu → Rename → input prefilled `Custom 1`; type `  Pitch  `, press Enter → `renameTemplate('c1', 'Pitch')`; header shows `Pitch` before the promise resolves.
  - `rename rolls back on failure` → reject with `ApiError` 403 → header back to `Custom 1`, `toast.error` called with the backend detail.
  - `rename submit disabled for blank or unchanged` → `'   '` and `'Custom 1'` both disable the Save button; Enter sends nothing.
  - `delete confirms, removes caches and returns to gallery` → Delete → dialog text mentions existing decks keep their slides → confirm → `deleteTemplate('c1')`, route becomes `templates`, `getTemplate` call count unchanged after confirm (no refetch flash), `toast.success` called.
  - `delete failure stays on page` → reject → still on `/templates/c1`, `toast.error`.
- [ ] **Step 2: Run** `pnpm vitest run tests/unit/templates/TemplateDetailView.test.ts` — Expected: new tests FAIL.
- [ ] **Step 3: Implement.** Mutations with `useMutation`, error text via `ApiError` + `extractApiErrorMessage` as in `LibraryView`. Rename: `onMutate` cancels and patches `templatesKey` cache entry name, `onError` restores snapshot, `onSettled` invalidates `templatesKey`. Delete: `onSuccess` → `queryClient.removeQueries({ queryKey: templateDetailKey(id) })`, `router.replace({ name: 'templates' })`, then `setQueryData(templatesKey, list without id)` and invalidate. Delete dialog copy: title `Delete template?`, description `"{name}" will be permanently deleted. Presentations already made from it keep their slides.` Dialogs mirror `DeleteDeckDialog` structure.
- [ ] **Step 4: Run** `pnpm vitest run tests/unit/templates` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): rename and delete custom templates`.

### Task 6: Layout lightbox

**Files:**
- Create: `frontend/src/components/templates/LayoutLightbox.vue`
- Modify: `frontend/src/views/TemplateDetailView.vue`
- Test: `frontend/tests/unit/templates/LayoutLightbox.test.ts`

**Interfaces:**
- Produces: `LayoutLightbox` props `{ slides: Slide[]; theme?: unknown; fonts?: unknown; title: string }`, `v-model:index` (`number | null`; `null` = closed). Detail view sets index on `layout-card` click.

- [ ] **Step 1: Write failing tests:**
  - `opens at the given index with a counter` → index 1 of 3 shows `2 / 3` and the slide with id `t-preview-1`.
  - `arrow keys and buttons move, clamped at ends` → ArrowRight → `3 / 3`; ArrowRight again stays `3 / 3`; Previous button → `2 / 3`; at 0 Previous is disabled.
  - `Escape closes` → emitted `update:index` with `null`.
  - (in `TemplateDetailView.test.ts`) `clicking a layout opens the lightbox and focus returns on close`.
- [ ] **Step 2: Run** `pnpm vitest run tests/unit/templates` — Expected: FAIL.
- [ ] **Step 3: Implement** with `Dialog`/`DialogContent` (glass overlay per Aera), large `SlideView` `fit="width"`, `ChevronLeft`/`ChevronRight` buttons with `aria-label="Previous layout"/"Next layout"`, keydown handler on the content, `DialogTitle` = `{title} — layout {n}` (visually hidden is fine). Restore focus to the triggering card via the dialog's close auto-focus hook.
- [ ] **Step 4: Run** `pnpm vitest run tests/unit/templates` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): template layout lightbox`.

### Task 7: `/new` chip and forwarding

**Files:**
- Modify: `frontend/src/views/NewView.vue`
- Test: `frontend/tests/unit/create/NewView.test.ts`

**Interfaces:**
- Consumes: `listTemplates`, `templatesKey`.
- Produces: on submit, `router.push({ name: 'outline', params: { id }, query: template ? { template } : {} })`.

- [ ] **Step 1: Write failing tests.** Update `mountView` to accept a start path and install `VueQueryPlugin` with a fresh `QueryClient` (retry false); mock `@/api/templates` `listTemplates` → `[{ id: 'c1', name: 'Pitch', kind: 'custom', layouts: [{}] }]`.
  - `shows the template chip from ?template` → `/new?template=c1` shows `Using Pitch`.
  - `clearing the chip removes the param` → click its ✕ (`aria-label="Don’t use Pitch"`) → `route.query.template` undefined, chip gone.
  - `drops an unknown template id` → `/new?template=zzz` → after load, no chip and `route.query.template` undefined.
  - `forwards the template to the outline step` → submit → route `outline` with `query.template === 'c1'`; `createPresentation` payload has no template/layout field.
  - existing tests still pass with no `?template`.
- [ ] **Step 2: Run** `pnpm vitest run tests/unit/create/NewView.test.ts` — Expected: new tests FAIL.
- [ ] **Step 3: Implement.** `useQuery({ queryKey: templatesKey, queryFn: listTemplates, enabled: computed(() => !!route.query.template) })`; `chosen = computed(...)`; a `watch` on list success drops an unknown id via `router.replace`. Chip above `PromptField` in Aera pill style (accent dot, name in semibold, `X` icon button).
- [ ] **Step 4: Run** same — Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): carry chosen template through /new`.

### Task 8: Outline preselect

**Files:**
- Modify: `frontend/src/views/OutlineView.vue`
- Test: `frontend/tests/unit/create/OutlineView.test.ts`

**Interfaces:**
- Consumes: `route.query.template`; existing `selectedTemplate` ref and `TemplatePicker` (Task 2 scroll-into-view).

- [ ] **Step 1: Write failing tests** (extend `mountView(path = '/new/p1/outline')`):
  - `preselects ?template once templates load` → `/new/p1/outline?template=c1`: `template-c1` has `aria-checked="true"`, Generate label is `Generate presentation`.
  - `ignores an unknown ?template` → nothing checked, label `Select a template`.
  - `changing the selection updates the query and generates with it` → click `template-c2` → `route.query.template === 'c2'`; Generate → `preparePresentation` called with `layout: 'c2'`.
- [ ] **Step 2: Run** `pnpm vitest run tests/unit/create/OutlineView.test.ts` — Expected: new tests FAIL.
- [ ] **Step 3: Implement.** One-shot `watch` on `templates.data` that sets `selectedTemplate` from the query if present in the list (only while `selectedTemplate` is null); `watch(selectedTemplate)` → `router.replace({ query: { ...route.query, template: v ?? undefined } })`.
- [ ] **Step 4: Run** same — Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): preselect template on outline step from ?template`.

### Task 9: Mocked e2e and full check

**Files:**
- Modify: `frontend/tests/e2e/mocked.spec.ts`
- Create: `frontend/tests/e2e/fixtures/templates.json` (`{ items: [...], total, page, page_size }` with one custom template `c1` "Pitch", `is_default: false`, `layout_count: 2`), `frontend/tests/e2e/fixtures/template.json` (`GET /template/c1` body with 2 simple layouts — copy two layouts from `templates/general/template.json` and its `theme`).

- [ ] **Step 1: Write the test** `templates: gallery → detail → lightbox → use`: overrides `GET /api/templates` → `[]`, `GET /api/v1/ppt/template/all` → fixture, `GET /api/v1/ppt/template/c1` → fixture (plus any call `/new` makes on mount that `unexpected` reports). Steps: visit `/templates` → card "Pitch" visible → click → heading "Pitch", 2 `layout-card`s → click the first → dialog shows `1 / 2`, ArrowRight → `2 / 2`, Escape → closed → click "Use this template" → URL `/new?template=c1`, text `Using Pitch`. Assert `unexpected` is empty. (No mocked e2e covers the SSE outline stream; outline preselect is pinned by Task 8's unit tests.)
- [ ] **Step 2: Run** `pnpm e2e tests/e2e/mocked.spec.ts -g templates` — Expected: PASS (fix mocks if `unexpected` lists calls).
- [ ] **Step 3: Run** `pnpm check` — Expected: vue-tsc, vitest and eslint all exit 0.
- [ ] **Step 4: Commit** `test(frontend): e2e for templates gallery to outline handoff`.
