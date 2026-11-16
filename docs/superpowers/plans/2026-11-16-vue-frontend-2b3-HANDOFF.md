# Handoff: implement 2b-3 (infographic and container editing)

Paste the section below into a new Claude Code session opened in `/var/www/presenton`.

---

Implement phase 2b-3 of the Vue frontend with **subagent-driven development**.

**Read first, in this order:**

1. `CLAUDE.md` (project rules).
2. Spec: `docs/superpowers/specs/2026-11-16-vue-frontend-2b3-infographics-containers-design.md`
3. Plan: `docs/superpowers/plans/2026-11-16-vue-frontend-2b3-infographics-containers.md`

Both are approved. Do not brainstorm or re-plan. Invoke the
`superpowers:subagent-driven-development` skill and execute the plan's eight
tasks in order.

**State:**

- Branch `feat/vue-frontend-2b3` already exists, branched from `main` at
  `6e5f157d`. It holds only the spec and plan commits. Check it out and work
  there; do not create another branch or worktree.
- No product code for 2b-3 has been written yet. Start at Task 1.

**How to run it:**

- One fresh implementer subagent per task, then a fresh reviewer for that task
  before the next task starts. Finish with a whole-branch review.
- Give each implementer its task text from the plan, the plan's Global
  Constraints and Review Focus sections, and the spec path. An implementer sees
  only what you give it.
- Tasks are sequential. Each depends on the interfaces of the one before, so do
  not run them in parallel.
- Commands run from `frontend/`: `npx vitest run <file>`, `npx vue-tsc -b`,
  `npm run check`, `npx playwright test tests/e2e/mocked.spec.ts -g "<name>"`.
- Commit after each task with the message the plan gives.

**Rules that are easy to break:**

- Work only inside `frontend/`. Never modify `servers/nextjs`; port code as
  copies.
- Template slides only. Nothing for smart slides.
- Controls go in the inspector's Element tab, built from the shared controls in
  `frontend/src/components/editor/inspector/controls/`. Keep the Aera look;
  extend additively.
- Values written to slide JSON must match the old editor's shapes exactly. The
  plan's tests pin them. If a test and the old editor disagree, stop and ask.
- Follow `ChartSection.vue` and `ChartDataDialog.vue` for the patterns the plan
  refers to (colour anchoring at picker open, `draftUi` preview, single commit).

**Decisions already made (do not reopen):**

- Scope is the template-used set: flex, grid and container layouts, plus
  gauge, progress_bar, vertical_funnel and maturity_model infographics. Other
  infographic types get colour controls only.
- A selected component resolves in the order table, chart, infographic, layout.
  A card that contains a gauge shows the Infographic section; its layout is
  reached through the Layer tree.
- Funnel and maturity items are edited in a dialog, not inline in the
  inspector.
- Maturity model: at most 7 items, and no "focus" field (existing `focus`
  values are preserved untouched).
- Meters reject a Min above Max.

**When all eight tasks pass:**

- Run `npm run check` in `frontend/` and report the real output.
- The live e2e (`tests/e2e/live.spec.ts`) needs `E2E_USER` and `E2E_PASSWORD`.
  If they are not set, say it was not run.
- Do not merge to `main`. Report what was built, what was verified and anything
  deferred, then ask how to integrate.
