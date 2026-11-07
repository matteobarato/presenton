# Vue frontend — Templates section (gallery + detail)

Date: 2026-11-07. Status: approved design, awaiting plan.

## Goal

Give the new Vue frontend (`/frontend`) a Templates section: browse every
template, look at all of a template's layouts, rename or delete custom
templates, and start a new deck from a chosen template.

Template-based generation only (see `CLAUDE.md`). Do not modify
`servers/nextjs`. Keep Aera design fidelity: the Aera mockup already has a
Templates rail entry (`LayoutTemplate` icon), a `page-intro` ("A head start on
something great.") and a `template-gallery` grid; extend those, don't simplify.

## Scope

In scope:

1. Gallery at `/templates`.
2. Detail page at `/templates/:id`.
3. "Use this template" handoff into `/new` → outline step, preselecting the template.

Out of scope (later specs): the custom-template builder (PPTX upload →
generated template, processing tasks, retry, font upload), the layout/schema
editor, template themes editing. The gallery offers **no** "create template"
entry point for now, not even a link to the classic app.

## 1. Routes, nav, API layer

### Routes (`frontend/src/router.ts`)

| Path | Name | View | Meta |
|---|---|---|---|
| `/templates` | `templates` | `views/TemplatesView.vue` | `layout: 'app'` |
| `/templates/:id` | `template` | `views/TemplateDetailView.vue` | `layout: 'app'` |

Both are authenticated (no `public`), lazily imported like the other views.

### Nav (`components/shell/NavRail.vue`)

Add a **Templates** `RouterLink` with lucide `LayoutTemplate`, between New and
Settings, same `link`/`active` classes. Active when the route name is
`templates` or `template`.

### API (`frontend/src/api/templates.ts`)

Additive; existing callers of `listTemplates()` keep working.

- `TemplateSummary` gains:
  - `kind: 'builtin' | 'custom'`. Built-in when it came from the Next.js scan
    (`getTemplatesRoute`) or the list item has `is_default: true`; custom
    otherwise.
  - `description?: string`. Built-ins: `settings.description`; custom:
    `description` from `TemplateListItem` (null → undefined).
- `getTemplateDetail(id)` → `{ summary: TemplateSummary, layouts, theme, fonts }`.
  Finds the summary in the cached `['templates']` list (fetching it if
  needed). If the summary already carries real layout objects, uses them;
  otherwise calls the existing `getTemplate(id)` (`GET /api/v1/ppt/template/{id}`).
  Unknown id → throws a typed not-found error. Cached under the existing
  `templateDetailKey(id)` so the gallery cards, the detail page, the outline
  `TemplatePicker` and the editor layout picker share one cache entry.
  *Plan must verify* whether built-in ids resolve via `GET /template/{id}`; the
  design does not depend on it because built-ins carry layouts from the scan.
- `renameTemplate(id, name)` → `PATCH /api/v1/ppt/template/{id}` `{ name }`.
- `deleteTemplate(id)` → `DELETE /api/v1/ppt/template/{id}` (204).
- Both mutations invalidate `['templates']` and `templateDetailKey(id)`.
- The backend returns 403 "Built-in templates are read-only" for built-ins;
  the UI never offers these actions on built-ins, the 403 surfaces as a toast
  if it ever happens.

### Shared composable

`composables/useTemplateLayouts.ts`: given a `TemplateSummary`, returns
reactive `{ layouts, theme, fonts, pending, failed }`, lazily loading custom
templates' layouts through `templateDetailKey`. Extracted from the lazy-load
logic currently inside `components/create/TemplatePicker.vue`; the picker is
refactored to use it (behaviour unchanged).

## 2. Gallery (`/templates`)

Inside the app shell with `PageHeader`.

- **Intro**: display-font heading "A head start on something great.", muted
  subline ("Every layout your next deck can be built from."). Aera
  `page-intro` spacing, fade + 5px rise on entry.
- **Toolbar**: search box filtering by name (case-insensitive, same styling as
  `LibraryToolbar`), and a segmented **All / Built-in / Custom** filter.
  Filter is in the URL as `?kind=builtin|custom` (absent = All), updated with
  `router.replace`.
- **Grid**: same responsive columns and breakpoints (1050px / 760px) as the
  Library grid.
- **`components/templates/TemplateCard.vue`**:
  - Cover: first layout via `SlideView` (`fit="width"`, `lazy`), `rounded-card`,
    hover lift (`motion-safe:group-hover:-translate-y-1`) like `PresentationCard`.
  - Below: name (truncate), meta "N layouts · Built-in" / "N layouts · Custom".
  - Hover/focus affordance "View template ↗" (Aera `template-gallery` style).
  - Whole card is one `RouterLink` to `/templates/:id`. No action menu.
  - While a custom template's layouts load: skeleton cover. If loading fails:
    a neutral placeholder cover, card still links to the detail page.
- **Ordering**: built-in first, then custom, each in list order (as
  `listTemplates()` returns them).
- **States**:
  - loading → skeleton card grid;
  - list error → inline `Alert` + Retry (refetch);
  - zero templates → empty state;
  - search/filter with no matches → Aera `empty-search` ("No templates match
    “x”") + **Clear** (resets search and filter);
  - Custom filter, no custom templates → muted line "Custom templates will
    appear here once they’re created." No create button.

## 3. Detail page (`/templates/:id`)

- **Header**: breadcrumb "Templates › <name>" (Templates links back, keeping
  the gallery's `?kind`), display-font name, badge (Built-in / Custom) ·
  layout count · description if any.
- **Actions**:
  - **Use this template** — primary accent button (see §4). Disabled when the
    template has zero layouts.
  - Custom only: overflow `DropdownMenu` with **Rename** and **Delete**.
- **Rename**: `Dialog` with prefilled `Input`; trims; empty disables submit;
  Enter submits. Optimistic update of the list and detail caches, rollback +
  error toast on failure, success toast.
- **Delete**: confirm `Dialog` modelled on `DeleteDeckDialog`, copy explains
  existing decks made from it keep their slides. On success: toast,
  `router.replace({ name: 'templates' })`, list invalidated. On failure: toast,
  stay.
- **Layouts grid**: every layout as a `SlideView` card (lazy), theme + fonts
  from the detail; index label "01", "02"… in Aera `overview-grid` style.
- **Lightbox**: clicking a layout opens a `Dialog` with a large `SlideView`,
  prev/next buttons, ←/→ keys, Esc closes, "n / total" counter. Focus returns
  to the clicked card on close.
- **States**: loading → header + grid skeletons; unknown id / 404 → inline
  not-found message with "Back to templates" (no redirect); other load error →
  `Alert` + Retry; zero layouts → muted line.

## 4. "Use this template" handoff

Data path is the URL query only — no store, no localStorage, no backend change.

1. Detail page: `router.push({ name: 'new', query: { template: id } })`.
2. `NewView`: reads `route.query.template`, resolves it against the
   `['templates']` query.
   - Known → chip above the prompt field: "Using **<name>**" with ✕; ✕
     removes the query param (`router.replace`).
   - Unknown (stale/deleted) → param silently dropped once the list has loaded.
   - On submit: `router.push({ name: 'outline', params: { id }, query: { template } })`
     when a template is set.
   - `presentation/create` payload is unchanged.
3. `OutlineView`: seeds `selectedTemplate` from `route.query.template` once
   templates load, only if the id is in the list. The picker stays editable;
   the preselected card is scrolled into view. Changing selection updates the
   query via `router.replace`, so reload preserves the choice.
4. The template id reaches the backend only as `layout` on Generate, exactly as
   today.

## 5. Errors

- API errors go through `ApiError` / `extractApiErrorMessage` like the Library
  view; mutations show `toast.error` with a fallback message.
- 401 handling is unchanged (global unauthorized redirect).
- 403 on rename/delete (built-in) → toast with backend detail.
- 404 on detail → not-found state (§3).

## 6. Testing

Vitest unit tests (`frontend/tests/unit/templates/`, plus additions to
existing files):

- `api/templates`: `kind`/`description` mapping for built-in and custom;
  `getTemplateDetail` uses scan layouts for built-ins and `GET /template/{id}`
  for custom; unknown id → not-found; rename/delete call the right endpoints
  and invalidate keys.
- `useTemplateLayouts`: pending → loaded, failure, cache sharing with
  `templateDetailKey`; `TemplatePicker` existing tests still pass.
- `TemplatesView`: renders cards, search filtering, `?kind` filter from and to
  the URL, empty/no-match/error states.
- `TemplateDetailView`: header + layouts, actions hidden for built-ins,
  rename optimistic + rollback, delete → navigates to gallery, not-found state,
  lightbox keyboard nav.
- `NewView`: chip from `?template`, ✕ clears, unknown id dropped, query
  forwarded to outline on submit.
- `OutlineView`: preselect from `?template`, ignores unknown id, selection
  change updates the query.
- `router` / `NavRail`: new routes resolve; Templates link active on both.

Mocked Playwright e2e (`tests/e2e/mocked.spec.ts`): gallery → detail →
"Use this template" → `/new` shows the chip → outline has it preselected.

`pnpm check` (vue-tsc, vitest, eslint) must pass.
