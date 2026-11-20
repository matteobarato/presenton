# Handoff — Create wizard (build phase)

Date: 2026-11-20 · From: design/planning session · To: a fresh build session

## Paste this into the new session

```
Implement the create wizard with superpowers:subagent-driven-development.
Plan: docs/superpowers/plans/2026-11-20-create-wizard.md
Spec: docs/superpowers/specs/2026-11-20-create-wizard-design.md
Handoff notes: docs/superpowers/plans/2026-11-20-create-wizard-handoff.md (read first)
Execution method is already chosen: subagent-driven. Don't re-brainstorm; the design and plan are approved.
```

## Status

- Spec: **approved** by the user.
- Plan: written, 10 tasks; execution method chosen: **subagent-driven**.
- Nothing implemented yet. Spec, plan and this handoff are **not committed**.
- `main` has many **uncommitted, unrelated changes** in the working tree (frontend narration/avatar/playback
  work, fastapi tests). Do not commit them as part of this work and do not discard them. Start in an isolated
  worktree/branch (superpowers:using-git-worktrees), e.g. branch `feat/create-wizard`. Since the worktree
  starts from `HEAD`, first ask the user whether those uncommitted changes must be committed (or carried into
  the worktree) — several of the plan's touched files (`useDeckNarration.ts`, `useDeckAvatars.ts`,
  `NewView.test.ts`, `EditorView.test.ts`, `options.ts`) have uncommitted edits the plan was written against.
- Copy the spec, plan and this handoff into the worktree (or commit them first with the user's OK).

## What the user wants (short)

A 7-step wizard: **Topic → Look → Details → Outline → Preview → Avatar → Export**. It is the simple,
AI-driven path ("the client theoretically doesn't touch anything"); advanced control lives in the editor,
which the wizard links to. The wizard is **stateful**: progress is derived from backend state, and the user
can jump from the editor back into the wizard at the next unfinished step.

## Decisions made with the user (binding)

1. Outline review stays as its own step, redesigned.
2. Voice and avatar are one step called **Avatar**: one "Generate" runs notes (if missing) → voice → avatars
   as a single client-orchestrated pass.
3. Avatar is **required** (Export locked) when any slide has an avatar placeholder; optional otherwise.
   Before slides exist, the Details "videos" option is only a hint. If HeyGen is not configured, voice-only
   completes the step (Export never blocked forever).
4. After the deck exists, Topic/Look/Details are read-only; outline editable until slides exist; going back
   to Outline after Preview = regenerate slides behind a warning; theme changeable anytime.
5. Approach A: one wizard layout; `/new` for steps 1–3, `/p/:id/create/:step` for steps 4–7.

## Calls made by Claude (user saw them, didn't object)

Look requires a template; no persisted "preview accepted" flag; pipeline phase in
`sessionStorage['slideshows.pipeline.<id>']`; no HeyGen confirm dialog in the wizard (Generate = confirm);
editor header "Continue: <step>" button; empty decks opened in the editor redirect to the Outline step
(plan moved this from the library to EditorView); `/new` draft in `sessionStorage['slideshows.newDraft']`;
Alt+←/→ for Back/Next.

## Facts verified in code (don't re-investigate)

- Regenerating slides works on the backend: `prepare` overwrites structure and `stream_presentation` deletes
  old slides after new ones are built (`servers/fastapi/api/v1/ppt/endpoints/presentation.py` ~3762).
- Voice/avatar state is shared through `DeckStateProvider` → `useDeckNarration` / `useDeckAvatars`; both
  TTS and avatar tasks already resume after reload (`useAsyncTask` with storage keys).
- Avatar blockers already exist in `useDeckAvatars` (`deckBlocker`, `deckRunBlocker`, `eligibleSlides`);
  `videos.generation_available` tells whether HeyGen is configured.
- `PresentationWithSlides` has `content`, `n_slides`, `language`, `tone`, `verbosity` (for read-only
  summaries) but not the template id or `n_videos`.
- Frontend checks: `cd frontend && npx vitest run <files>`, `npx vue-tsc -b`, `npm run check`,
  `npx playwright test tests/e2e/mocked.spec.ts`.

## Project rules to respect

- Only `frontend/`; never touch `servers/nextjs`. Template-based generation only (no smart mode UI).
- Keep the Aera look; extend additively, never remove.
- Commit only on the feature branch; ask before merging/pushing.
