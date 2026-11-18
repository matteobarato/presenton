# Theme Picker on New Presentation Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user pick a saved colour theme on the New page (and change it on the Outline page) so the generated deck opens already in that palette.

**Architecture:** Frontend only. A composable owns the `?theme=<id>` URL param and the themes query; a `ThemePicker` component renders a "Template colours" option plus saved themes using the editor's `ThemeSwatch`. On Generate, OutlineView calls `preparePresentation`, then `updatePresentation({ id, theme })` when a theme is chosen, then routes to the editor.

**Tech Stack:** Vue 3 `<script setup>`, vue-router, @tanstack/vue-query, Tailwind v4, Vitest + @vue/test-utils, Playwright (mocked e2e).

**Spec:** `docs/superpowers/specs/2026-11-18-new-page-theme-picker-design.md`

## Global Constraints

- No AI and no backend changes; do not touch `servers/nextjs`.
- Default is "Template colours": no theme chosen ⇒ no `updatePresentation` call, no `?theme` param.
- URL param name: `theme` (sits beside `template`).
- Theme-apply failure must not block navigation; toast text exactly: `Couldn't apply theme — set it in Design`.
- No create/edit/delete/generate theme controls on these pages.
- Keep the Aera look (dark surfaces, existing type sizes/colours used by the neighbouring template sections); additive only.

## Review Focus

- Themes query fails or returns non-array/null entries → picker shows only "Template colours" plus a quiet note; New/Outline still submit. (Test in Task 1 and Task 2.)
- `?theme=` holds a deleted/garbage id → param is dropped once the list loads, nothing applied on Generate. (Task 1.)
- `?theme` must survive New → Outline navigation alongside `?template`, and the Outline template `router.replace` must not wipe it. (Tasks 2, 3.)
- `updatePresentation` rejects → still navigates to the editor with `?stream=1`, toast shown. (Task 3.)
- Choosing a theme then "Template colours" removes `?theme` and Generate makes no update call. (Tasks 1, 3.)

---

### Task 1: `useThemeParam` composable + `ThemePicker` component

**Files:**
- Create: `frontend/src/composables/useThemeParam.ts`
- Create: `frontend/src/components/create/ThemePicker.vue`
- Test: `frontend/tests/unit/create/ThemePicker.test.ts`

**Interfaces:**
- Consumes: `listThemes`, `themeKeys`, `ThemeRecord` from `@/api/themes`; `ThemeSwatch` from `@/components/editor/inspector/ThemeSwatch.vue` (props `name, theme, selected, custom, disabled`; emits `select`).
- Produces:
  - `useThemeParam(): { themeList: ComputedRef<ThemeRecord[]>; isPending: Ref<boolean>; isError: Ref<boolean>; selectedThemeId: WritableComputedRef<string | null>; chosenTheme: ComputedRef<ThemeRecord | undefined> }`
    - reads `route.query.theme`; setter does `router.replace({ query: { ...route.query, theme } })`, deleting the key for `null`.
    - filters malformed list entries exactly like `DesignTab.vue` `themeList`.
    - watcher (immediate): once the query succeeds, an id not in the list is cleared (mirror NewView's template watcher).
  - `ThemePicker.vue`: props `{ themes: ThemeRecord[]; disabled?: boolean }`, `v-model: string | null`. Renders a radiogroup-ish grid (`grid-cols-[repeat(auto-fill,minmax(132px,1fr))]`): first `ThemeSwatch name="Template colours" :theme="null"` with `data-testid="theme-option-none"`, then one per theme wrapped with `data-testid="theme-option-<id>"`; `custom` always `false` (hides edit/remove).

- [ ] **Step 1: Write the failing tests** in `ThemePicker.test.ts`, mounting a tiny host component that uses `useThemeParam()` + `<ThemePicker v-model="selectedThemeId" :themes="themeList" />` under a memory router and a QueryClient; mock `@/api/themes` `listThemes`.
  - `defaults to Template colours with no ?theme` → `[data-testid="theme-option-none"] button` has `aria-pressed="true"`.
  - `picking a theme writes ?theme and Template colours removes it` → click `theme-option-t1` button ⇒ `query.theme === 't1'`, `query.template` preserved (start at `/new?template=c1`); click none ⇒ `query.theme` undefined.
  - `drops an unknown ?theme id` → start `/new?theme=gone` ⇒ after `flushPromises`, `query.theme` undefined.
  - `tolerates a failed or malformed list` → `listThemes` resolves `[null, {id:'t1',name:'Ocean',user:'u',data:{}}]` ⇒ two options rendered; rejecting ⇒ only `theme-option-none`.
- [ ] **Step 2: Run** `cd frontend && npx vitest run tests/unit/create/ThemePicker.test.ts` — Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** the composable and component per the Interfaces block.
- [ ] **Step 4: Run** same command — Expected: PASS.
- [ ] **Step 5: Commit** `feat(frontend): theme picker and ?theme param for create flow`

### Task 2: Theme row on the New page (Look step)

**Files:**
- Modify: `frontend/src/views/NewView.vue` (script: template-selection block ~L25-46, `router.push` ~L170; template: STEP_LOOK section ~L205-217)
- Test: `frontend/tests/unit/create/NewView.test.ts`

**Interfaces:**
- Consumes: `useThemeParam`, `ThemePicker` (Task 1).
- Produces: navigation to `outline` carries `query: { template?, theme? }`.

- [ ] **Step 1: Write failing tests** in a new `describe('theme picker')` (mock `@/api/themes` `listThemes` → `[{ id: 't1', name: 'Ocean', user: 'u', data: {} }]`):
  - `shows a Theme row on the Look step with Template colours selected` → `theme-option-none` button `aria-pressed="true"`.
  - `carries ?template and ?theme to the outline` → mount at `/new?template=c1&theme=t1`, fill prompt, submit ⇒ outline route query equals `{ template: 'c1', theme: 't1' }`.
  - `still submits when themes fail to load` → `listThemes` rejects ⇒ submit routes to outline with no `theme` key.
- [ ] **Step 2: Run** `npx vitest run tests/unit/create/NewView.test.ts` — Expected: new tests FAIL.
- [ ] **Step 3: Implement.** Under `NewTemplateSelector` in the STEP_LOOK section add a sub-heading `Theme` (13px, `text-[#e4ecf0]`) with hint `Optional. Recolours the template.` (11px, `text-[#8e9ca4]`) and `<ThemePicker v-model="selectedThemeId" :themes="themeList" :disabled="pending" />`; hide the row (not an error alert) when `themeList` is empty and not pending. In `submit`, build the outline query from `chosen` and `chosenTheme`.
- [ ] **Step 4: Run** same command — Expected: PASS (all NewView tests).
- [ ] **Step 5: Commit** `feat(frontend): pick a theme on the New page`

### Task 3: Theme summary + apply on Generate in the Outline page

**Files:**
- Modify: `frontend/src/views/OutlineView.vue` (template watcher ~L48-50; `generate()` ~L115-138; template section ~L172-196)
- Test: `frontend/tests/unit/create/OutlineView.test.ts`
- Modify: `frontend/tests/e2e/mocked.spec.ts` (mock `PATCH /api/v1/ppt/presentation/update` if not already; assert the flow with `?theme`)

**Interfaces:**
- Consumes: `useThemeParam`, `ThemePicker` (Task 1); `updatePresentation({ id, theme })` from `@/api/presentations`; `toast` from `@/components/ui/sonner`.
- Produces: nothing new.

- [ ] **Step 1: Write failing tests** (mock `@/api/presentations` `updatePresentation`, `@/api/themes` `listThemes` → `[{ id: 't1', name: 'Ocean', user: 'u', data: { colors: {} } }]`, `@/components/ui/sonner` `toast.error`):
  - `applies the chosen theme after prepare, then opens the editor` → at `/new/p1/outline?template=modern&theme=t1`, click Generate ⇒ `preparePresentation` called before `updatePresentation`; `updatePresentation` called with `{ id: 'p1', theme: expect.objectContaining({ id: 't1' }) }`; route is `editor` with `query.stream === '1'`.
  - `makes no theme call with Template colours` → no `?theme` ⇒ `updatePresentation` not called.
  - `still opens the editor when applying the theme fails` → `updatePresentation` rejects ⇒ route `editor`, `toast.error` called with `Couldn't apply theme — set it in Design`.
  - `changing the template keeps ?theme` → pick another template ⇒ `query.theme === 't1'`.
  - `shows the chosen theme with Change` → `[data-testid="chosen-theme"]` contains `Ocean`; clicking its Change reveals `theme-option-none`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/create/OutlineView.test.ts` — Expected: new tests FAIL.
- [ ] **Step 3: Implement.**
  - Below the template block add a Theme block: when `chosenTheme && !themePickerOpen` show a summary row (`data-testid="chosen-theme"`, styled like `chosen-template`, a 132px-wide `ThemeSwatch` preview in place of the thumb, name, `Chosen on the previous step`, Change button); otherwise `<ThemePicker>`. `themePickerOpen` starts `true` and is set `false` once if `?theme` resolves to a known theme (same one-shot pattern as the template).
  - In `generate()`: after `await preparePresentation(...)`, `if (chosenTheme.value) await updatePresentation({ id: id.value, theme: chosenTheme.value }).catch(() => toast.error("Couldn't apply theme — set it in Design"))`, then navigate as today.
  - Ensure the existing template `router.replace` spreads `route.query` (it does) so `theme` survives.
- [ ] **Step 4: Run** `npx vitest run tests/unit/create/` — Expected: PASS.
- [ ] **Step 5: Update the mocked e2e** to start the outline at `?template=…&theme=<fixture theme id>` and assert a PATCH to the presentation update endpoint carrying `theme`; run `npx playwright test tests/e2e/mocked.spec.ts` — Expected: PASS.
- [ ] **Step 6: Full check** `npm run check` — Expected: vue-tsc, vitest, eslint all clean.
- [ ] **Step 7: Commit** `feat(frontend): apply the chosen theme when generating from the outline`
