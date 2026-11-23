# Light Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Aera-style light theme to `frontend/` with a Dark / Light / System selector; dark stays pixel-identical.

**Architecture:** Hardcoded hex colors in `.vue`/CSS become semantic Tailwind v4 tokens defined in `tokens.css` (`:root` = dark, `.light` overrides). A `useTheme` composable owns the preference (localStorage + `matchMedia`) and toggles a class on `<html>`; an inline script in `index.html` applies it before paint.

**Tech Stack:** Vue 3, Vite, Tailwind v4 (`@theme`), vitest, @vueuse/core, Playwright (screenshots).

**Spec:** `docs/superpowers/specs/2026-11-23-light-theme-design.md`

## Global Constraints
- Work only in `frontend/`; never touch `servers/nextjs`.
- Dark theme must render pixel-identical (Aera fidelity): every codemod mapping is hex → token whose dark value is that exact hex.
- Do not change `src/render/**` or `src/slide-editor/**` colors (slide content is theme-independent).
- Preference storage: `localStorage` key `theme`, values `dark|light|system`, default `system`; every storage access in try/catch.
- Light accent stays pale blue family (`#bee3f3` base); text/background contrast ≥ 4.5:1.
- No smart-presentation work.

## Review Focus
- localStorage unavailable/throws → falls back to `system`, app still renders.
- Stored garbage value (`"purple"`) → treated as `system`.
- OS theme changes while in `system` mode → live update; while in explicit mode → ignored.
- Text on accent buttons (`accent-ink`) stays legible in light.
- Sonner toasts and `kbd`/scrollbars/`::selection` switch too (hardcoded in `base.css`).

---

### Task 1: Theme state (`useTheme`) and no-flash bootstrap

**Files:**
- Create: `src/composables/useTheme.ts`, `src/composables/useTheme.test.ts`
- Modify: `index.html`, `src/main.ts`

**Interfaces:**
- Produces: `type ThemePreference = 'dark'|'light'|'system'`; `useTheme(): { preference: Ref<ThemePreference>; resolved: ComputedRef<'dark'|'light'>; setPreference(p: ThemePreference): void }`; `applyTheme(resolved): void` (sets `.light`/`.dark` on `document.documentElement` and `style.colorScheme`); `initTheme(): void` called from `main.ts` before mount.

- [ ] **Step 1: Write failing tests** in `useTheme.test.ts`: `defaults to system when storage empty`, `ignores invalid stored value`, `survives localStorage throwing`, `setPreference('light') persists and adds .light to <html>`, `system follows matchMedia change`, `explicit dark ignores matchMedia change`.
- [ ] **Step 2: Run** `npx vitest run src/composables/useTheme.test.ts` — expect FAIL (module missing).
- [ ] **Step 3: Implement** `useTheme.ts` as a module-level singleton (shared refs) using `usePreferredDark` from `@vueuse/core`.
- [ ] **Step 4: Add inline script** in `<head>` of `index.html` replicating the read-and-apply logic synchronously (try/catch, same key) so first paint is correct; call `initTheme()` in `main.ts` before `app.mount`.
- [ ] **Step 5: Run** the test file — expect PASS.
- [ ] **Step 6: Commit** `feat(theme): useTheme composable and no-flash bootstrap`.

### Task 2: Theme-aware tokens and base styles

**Files:**
- Modify: `src/styles/tokens.css`, `src/styles/base.css`, `src/components/ui/sonner/Sonner.vue`

**Interfaces:**
- Produces: the existing token names (`--color-rail`…`--color-line`, aliases) plus new role tokens introduced in Task 3. Dark values stay in `@theme`/`:root`; a `.light { … }` block overrides them. `@custom-variant dark (&:where(.dark, .dark *))` declared.

- [ ] **Step 1:** Add `.light` overrides for all existing surface/text/accent/line/danger tokens (rail lightest-grey → field white-ish; text `#1d2427`-range; `--color-line` becomes `rgb(0 0 0 / 0.08)`; `accent-ink` remains dark). Set `color-scheme: light` in `.light`.
- [ ] **Step 2:** Replace hardcoded values in `base.css` (`glass-*`, `kbd`, scrollbar colors, `::selection`, `workspace-card`, `dotted-canvas`, shadows) with new tokens (`--glass-tools`, `--glass-prompt`, `--glass-overlay`, `--glass-popover`, `--scrollbar`, `--kbd-bg`, `--kbd-fg`, `--selection-bg`) defined for both themes; dark values equal the current literals.
- [ ] **Step 3:** `Sonner.vue`: bind `:theme="resolved"` from `useTheme`.
- [ ] **Step 4: Verify** `npm run build` succeeds; screenshot dark (Task 6 tooling) matches baseline.
- [ ] **Step 5: Commit** `feat(theme): light token set and theme-aware base styles`.

### Task 3: Hex → token codemod

**Files:**
- Create: `scripts/theme-codemod.mjs` (dev tool, delete after use), `scripts/theme-codemod.test.mjs`
- Modify: `src/styles/tokens.css` (new role tokens), all `src/**/*.vue` outside `render/` and `slide-editor/`

**Interfaces:**
- Produces: `mapHex(prefix: 'bg'|'text'|'border'|'ring'|'fill'|'stroke'|'from'|'via'|'to'|'divide'|'outline', hex: string): string | null` returning a token class name (e.g. `bg-storyboard`, `text-fg-soft`) or `null` when unmapped; CLI `node scripts/theme-codemod.mjs [--write]` prints a table of unmapped hex with counts.

- [ ] **Step 1: Write failing tests**: `bg-[#1b1e20]` → `bg-storyboard`; `text-[#dbe7ef]` → role token; alpha hexes (`#bee3f355`) → `bg-accent/33`-style opacity form; unknown hex → `null`; non-color arbitrary values (`w-[#...]` not applicable, `bg-[url(...)]`) untouched.
- [ ] **Step 2: Run** the test — expect FAIL.
- [ ] **Step 3: Implement** the mapper. Exact surface hexes map to existing tokens; the long tail of text greys/blues (`#dbe7ef`, `#95aab7`, `#9aa9b0`, `#dce3e7`, …) is bucketed by role and luminance into new tokens (`fg-strong`, `fg-soft`, `fg-mute`, `fg-faint`, `surface-raised`, `surface-sunken`, `line-strong`, `accent-soft`…) whose dark value is the representative hex; near-duplicate hexes are collapsed only when the difference is imperceptible (ΔE < 2) — otherwise get their own token so dark stays identical.
- [ ] **Step 4: Dry run** (`node scripts/theme-codemod.mjs`), review the unmapped table, add tokens (dark value + light value in `tokens.css`) until unmapped = 0 or only intentional exceptions (document each in the script).
- [ ] **Step 5: Run** with `--write`; then `npm run check` — expect pass.
- [ ] **Step 6:** Compare dark screenshots vs baseline (Task 6) — expect zero pixel diff.
- [ ] **Step 7: Commit** `refactor(theme): move hardcoded hex colors to semantic tokens`.

### Task 4: Light values pass

**Files:**
- Modify: `src/styles/tokens.css` (`.light` block), components with inline `style` hex or SVG fills the codemod can't reach (`grep -rnE "#[0-9a-fA-F]{3,8}" src --include=*.vue` outside render/slide-editor).

- [ ] **Step 1:** Fill every new token's `.light` value; keep the Aera feel (soft borders, glass blur, pale-blue accent with dark ink).
- [ ] **Step 2:** Convert remaining inline hexes/`style` colors to `var(--color-*)`.
- [ ] **Step 3:** Contrast check: script or manual for `fg-*` on `surface-*` ≥ 4.5:1 (record results in the commit message).
- [ ] **Step 4: Commit** `feat(theme): light palette values`.

### Task 5: Theme selector UI

**Files:**
- Create: `src/components/settings/ThemeSection.vue` (+ `ThemeSection.test.ts`)
- Modify: `src/views/SettingsView.vue`, `src/components/settings/SettingsSidebar.vue` (entry "Appearance"); optionally `src/components/shell/*` for a sun/moon quick toggle (builder's call; skip if cluttered).

**Interfaces:**
- Consumes: `useTheme()` from Task 1.

- [ ] **Step 1: Failing test** `ThemeSection renders three options, marks current, and calls setPreference on click` with `aria-pressed`/radio semantics.
- [ ] **Step 2:** Run — expect FAIL. **Step 3:** Implement a segmented Dark / Light / System control (icons Moon/Sun/Monitor from lucide-vue-next), shown to all users (not admin-gated — check `useSettingsAccess`). **Step 4:** Run — expect PASS.
- [ ] **Step 5: Commit** `feat(settings): theme selector`.

### Task 6: Visual verification

**Files:**
- Create: `tests/e2e/theme.spec.ts`

- [ ] **Step 1:** Playwright spec: for `light` and `dark` (set via `localStorage.theme` + `page.emulateMedia`), visit library, new wizard, editor, settings, present; assert `<html>` class and capture screenshots to `test-results/`.
- [ ] **Step 2:** Also test `system` with `emulateMedia({colorScheme:'light'})` resolves to light with no flash (class present at `DOMContentLoaded`).
- [ ] **Step 3:** Run `npm run e2e -- theme`; inspect screenshots for unreadable text, white-on-white, leftover dark patches; fix in tokens.
- [ ] **Step 4:** `npm run check` passes. **Commit** `test(theme): e2e theme coverage`.
