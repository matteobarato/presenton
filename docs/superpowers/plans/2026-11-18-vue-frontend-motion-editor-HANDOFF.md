# Handoff: motion editor (entrance animations)

Written 2026-11-18 so a new session can resume without this conversation.

## Resume in one step

Open Claude Code in `/var/www/presenton` and say:

> Resume the motion editor. Read `docs/superpowers/plans/2026-11-18-vue-frontend-motion-editor-HANDOFF.md`, then execute the plan with superpowers:subagent-driven-development.

## State

- Design approved: `docs/superpowers/specs/2026-11-18-vue-frontend-motion-editor-design.md`.
- Plan written (12 tasks, not started): `docs/superpowers/plans/2026-11-18-vue-frontend-motion-editor.md`.
- Execution method chosen by the user: **subagent-driven** (fresh subagent per task, fresh reviewer after each, whole-branch review at the end).
- No product code has been written. Spec, plan and this file are staged in git, **not committed**.
- Backend half builds on `docs/superpowers/specs/2026-11-05-persistent-slide-animations-design.md`; that spec was never implemented (no `slide_animations.py`, no `slides.animation` column).

## What was decided (do not reopen)

- Source of the UX: the Aera mockup in `aera-frontend/` (`MotionInspector.vue`, `MotionStudio.vue`, `lib/motion.ts`).
- Entrance animations only: timeline 0–2.5 s, no exit lane.
- Approach A: inspector Motion tab + footer Motion tab (timeline) + GSAP preview on the real slide DOM.
- Template slides only (CLAUDE.md); smart slides show "can't be animated".
- Wipe effect left out (needs a backend clip-path property). Palette: Dissolve, Rise, Drift, Scale, Turn, Blur-in.
- "Remove all effects" saves `[]` via PUT; "Clear plan" is DELETE. Regenerating a hand-edited plan asks for confirmation. "Generate for all slides" uses the async endpoint.
- Preview must equal export: same GSAP `fromTo` as `servers/fastapi/utils/hyperframes_composition.py::_tween_vars`.

## Facts found that the plan relies on

- Alembic single head is `b3c5d7e9f1a4` (checked with `uv run alembic heads`); the new revision chains from it.
- The backend gets slide HTML/elements from the old Next.js route `servers/nextjs/app/api/video-composition/[id]/route.ts`; this stays. Do not modify `servers/nextjs`.
- Editor DOM: `TemplateSlideHost.vue` renders into a shadow root; with `annotate` true each element is wrapped as `[data-hf-el="eN"]`. Element list: `templateV2AnimationTargets` in `frontend/src/render/legacy/lib/template-v2-json-to-html.ts`.
- `validate_slide_animation` takes the flat raw shape (`opacity,x,y,scale,rotation,blur`), not `from_values`; `set_user_animation` must flatten.
- `GeneratePresentationRequest.animate` does not exist yet (the existing `animate` is the video export option).
- Footer tabs live in `frontend/src/components/editor/SpeakerNotes.vue` (`FooterTab = 'notes' | 'voice'` in `stores/editor.ts`); inspector tabs in `inspector/tabs.ts`.
- `gsap` is not installed in `frontend/`; add a pinned version (see lockfiles: both `pnpm-lock.yaml` and `package-lock.json` exist, use what CI uses).

## Cautions for the executor

- The working tree on branch `feat/new-page-theme-picker` has a lot of unrelated uncommitted work (create flow, theme picker, avatar/video, migrations). Do not revert or stage it. Before starting, create a new branch or worktree for this feature (superpowers:using-git-worktrees) and note which of those modified files the plan touches: `frontend/src/components/create/GenerationOptions.vue`, `frontend/src/components/create/options.ts`, `frontend/src/api/schema.d.ts`, `servers/fastapi/openai_spec.json`, `servers/fastapi/migrations.py`, `servers/fastapi/api/v1/ppt/endpoints/presentation.py`, `servers/fastapi/models/sql/presentation.py`, `frontend/tests/e2e/mocked.spec.ts`. Read their current diffs and extend; never overwrite.
- Regenerating `schema.d.ts` / `openai_spec.json` will also pick up those unrelated local changes; check the diff is only what you expect.
- Commit only task by task as the plan says; commit messages end with the attribution trailers from the session's system reminder.
- Project rules (CLAUDE.md): new frontend is template-based only; keep Aera look and extend additively; dev stack is `docker compose up production` then `docker compose -f docker-compose.frontend.yml up`.
- Memory notes already exist for Aera fidelity and the floating element bar (`~/.claude/projects/-var-www-presenton/memory/`).

## Task order

Backend 1→4 (column, service, endpoints, export/generation), then frontend 5→12 (API client, pure model, GSAP preview, composable + store, inspector tab, timeline + canvas, export/create flow, e2e + manual parity check). Backend must land first: frontend Task 5 regenerates types from the new OpenAPI.

## Verification at the end

`cd servers/fastapi && uv run pytest tests/unit -q`; `cd frontend && npx vitest run && npx vue-tsc --noEmit && npx eslint src tests`; Playwright `-g "motion editor"`; manual preview-vs-export comparison (plan Task 12 step 4).
