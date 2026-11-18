# Handoff: start Phase 3 of the Vue frontend (settings, admin, fonts, community, onboarding)

Paste the section below into a new Claude Code session opened in `/var/www/presenton`.

---

Start Phase 3 of the new Vue frontend (`/frontend`). Unlike the 2b-3 handoff,
**nothing is designed yet**: there is no spec and no plan. This session's job
is to scope Phase 3 with me, write the spec and plan for its first slice, and
then implement that slice.

**Read first, in this order:**

1. `CLAUDE.md` (project rules).
2. `docs/superpowers/specs/2026-11-06-vue-frontend-phase1-design.md`: the
   phasing decision, the Non-goals list (what was pushed to Phase 3), and the
   app shell, API client and auth conventions every later phase follows.
3. `docs/superpowers/specs/2026-11-07-vue-frontend-templates-design.md`: the
   most recent spec for a whole new section (routes, views, API module), and
   the closest model for Phase 3 work.

**Process:**

1. Invoke `superpowers:brainstorming`. Survey the old pages listed below
   before asking me anything, then ask about scope and slicing.
2. Write the spec for the first slice to
   `docs/superpowers/specs/YYYY-MM-DD-vue-frontend-phase3-<slice>-design.md`
   and get my approval.
3. Invoke `superpowers:writing-plans`, then implement with
   `superpowers:subagent-driven-development` on a branch
   `feat/vue-frontend-phase3-<slice>` cut from `main`.
4. Do not merge to `main`. Report what was built and verified, then ask how
   to integrate.

**State of the new frontend (2026-11-17):**

- Phases 1 and 2 are merged to `main` (last merge `68dd58cc`, phase 2b-3;
  `main` is not pushed). On-slide editing is complete for template slides.
- Routes today (`frontend/src/router.ts`): `/login`, `/setup`, `/` (library),
  `/new`, `/new/:id/outline`, `/p/:id` (editor), `/p/:id/present`,
  `/templates`, `/templates/:id`.
- The nav rail's Settings link still opens the old app
  (`frontend/src/components/shell/NavRail.vue:41`, "Settings (classic app)").
  Replacing that link is the visible goal of the first slice.
- `SetupView.vue` already covers first-run account creation. It is not the
  old onboarding flow (provider choice and keys).

**Phase 3 scope as originally agreed (Phase 1 spec):** settings/providers,
admin, templates, custom templates, fonts, community, onboarding.

- Templates gallery and detail are **done**.
- The custom-template builder (PPTX to template) and the layout editor are
  **shelved** by an earlier decision ("can be ignored now"). Do not scope
  them unless I bring them back.

**Old pages to survey** (read-only, under
`servers/nextjs/app/(presentation-generator)/(dashboard)/` unless noted):

| Area | Files | Size |
|---|---|---|
| Settings | `settings/`: `SettingPage`, `SettingSideBar`, `TextProvider`, `ImageProvider`, `WebSearchProvider`, `SettingCodex`, `UserAccountSettings`, `PrivacySettings` | about 3,100 lines |
| Admin | `admin/AdminPanel.tsx` (users, passwords, API keys) | about 900 lines |
| Community | `community/` (`CommunityPage`, `CommunityDesignPreviewDialog`) | about 1,000 lines |
| Onboarding | `servers/nextjs/components/OnBoarding/` (`PresentonMode`, `OnboardingPresentonAccount`, `FinalStep`, …) and `servers/nextjs/app/ConfigurationInitializer.tsx` | not measured |
| Fonts | `servers/nextjs/app/(presentation-generator)/custom-template/components/FontManager.tsx` (lives inside the shelved builder) | not measured |

**Endpoints those pages call** (from a grep, not verified one by one):

- FastAPI: `/api/v1/auth/presenton/{status,logout,device/start,device/poll}`,
  `/api/v1/ppt/{openai,google,anthropic}/models/available`,
  `/api/v1/ppt/codex/auth/{initiate,exchange,status,refresh,logout}`,
  `/api/v1/admin/users` (plus `/{id}` and `/{id}/password`),
  `/api/v1/admin/api-keys` (plus `/{id}/token` and `/{id}/revoke`),
  `/api/v1/ppt/community/presentations`,
  `/api/v1/ppt/fonts/{upload,uploaded}`.
- **Next.js API routes, not FastAPI:** `/api/user-config`,
  `/api/can-change-keys`, `/api/telemetry-status`, `/api/runtime-config`,
  `/api/community`. Provider keys and model choices are saved through
  `/api/user-config`.

**Open question to settle before the spec (do this first):** the new frontend
talks to the stack on `:5001`. Check whether those Next.js routes are
reachable through that proxy, where `/api/user-config` actually stores the
configuration, and whether FastAPI has an equivalent. The answer decides
whether the settings slice is a pure frontend port or needs something else.
Do not add or change backend or Next.js code without asking me.

**Suggested slicing (a recommendation, to be confirmed in brainstorming):**

1. **Settings and providers** first: text, image and web-search providers,
   account, privacy. It is the area that most often sends users back to the
   old app, and it removes the "classic app" link.
2. **Admin** (users and API keys).
3. **Onboarding** (provider setup after first login), which can reuse the
   settings forms from slice 1.
4. **Community**, then **fonts** (fonts need a home now that the builder is
   shelved).

One spec and one plan per slice.

**Rules that are easy to break:**

- Work only inside `frontend/`. Never modify `servers/nextjs`; port code as
  copies with a first-line "Ported from …" comment.
- Template-based generation only. Do not port Smart-mode settings or any
  option that only affects smart presentations; ask if one is ambiguous.
- Keep the Aera look and extend additively: reuse the shell, shadcn-vue
  components and the styles already in `frontend/src`. The UI is branded
  Presenton. British spelling in UI copy ("Colour").
- API calls go through the typed client in `frontend/src/api/` (one module
  per area, `unwrap`, `ApiError`), as `templates.ts` and `themes.ts` do.
- Secrets: API keys must never be logged, put in URLs, or written into test
  fixtures. Mocked e2e uses fake keys.
- Commands run from `frontend/`: `npx vitest run <file>`, `npx vue-tsc -b`,
  `npm run check`, `npx playwright test tests/e2e/mocked.spec.ts -g "<name>"`.
- Dev: `docker compose up production`, then
  `docker compose -f docker-compose.frontend.yml up` (Vite on :5173).

**Carried over from Phase 2 (not part of Phase 3; mention them, do not fix
them unless I ask):**

- The live e2e (`tests/e2e/live.spec.ts`) has never been run; it needs
  `E2E_USER` and `E2E_PASSWORD`.
- Three 2b-3 decisions await my confirmation: the Edit items dialog's
  new-item defaults follow the spec rather than the old editor; the
  inspector's Add item and the dialog's Add item differ for maturity models;
  Appearance on a card holding a gauge, or a shape plus a container, styles
  only the inner element.
- Image crop has a focus point and fit/fill but no zoom (`crop_scale`)
  control and no on-canvas crop handles.
- Table cells: dual alignment controls for a picked cell, Delete/Escape act
  on the whole table, and the Text section reads the cell font, not the run
  font.

**When the first slice is done:**

- Run `npm run check` in `frontend/` and report the real output.
- Say whether the live e2e was run.
- Do not merge to `main`. Report what was built, what was verified and
  anything deferred, then ask how to integrate.
