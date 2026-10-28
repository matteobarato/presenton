import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";

let helpers;
let temporaryDirectory;

test.before(async () => {
  temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), "presenton-avatar-generation-"),
  );
  const entryFile = path.join(temporaryDirectory, "entry.ts");
  const outputFile = path.join(temporaryDirectory, "bundle.mjs");
  await writeFile(
    entryFile,
    `export * from ${JSON.stringify(
      path.resolve("app/(presentation-generator)/presentation/utils/avatarGeneration.ts"),
    )};`,
  );
  await build({
    entryPoints: [entryFile],
    outfile: outputFile,
    bundle: true,
    platform: "node",
    format: "esm",
    tsconfig: path.resolve("tsconfig.json"),
    logLevel: "silent",
  });
  helpers = await import(`${pathToFileURL(outputFile).href}?cache=${Date.now()}`);
});

test.after(async () => {
  if (temporaryDirectory) {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

const plan = (state, extra = {}) => ({ slide_index: 0, slide_id: "s1", state, ...extra });

test("chipFor prefers the task plan over the preview", () => {
  assert.equal(helpers.chipFor(plan("generating"), plan("queued")), "generating");
  assert.equal(helpers.chipFor(plan("queued"), plan("queued")), "generating");
  assert.equal(helpers.chipFor(plan("done"), plan("queued")), "done");
  assert.equal(helpers.chipFor(plan("failed", { reason: "timeout" })), "failed");
});

test("chipFor maps preview states and skip reasons", () => {
  assert.equal(helpers.chipFor(undefined, plan("queued")), "ready");
  assert.equal(helpers.chipFor(undefined, plan("skipped", { reason: "no_audio" })), "no_audio");
  assert.equal(helpers.chipFor(undefined, plan("skipped", { reason: "audio_stale" })), "audio_stale");
  assert.equal(helpers.chipFor(undefined, plan("skipped", { reason: "up_to_date" })), "up_to_date");
  assert.equal(
    helpers.chipFor(undefined, plan("skipped", { reason: "unsupported_audio_format" })),
    "unsupported_audio",
  );
  assert.equal(helpers.chipFor(), "ready");
});

test("generateDisabledReason follows the listed priority", () => {
  const ok = { generationAvailable: true, hasPortrait: true, preview: plan("queued"), running: false };
  assert.equal(helpers.generateDisabledReason(ok), null);
  const all = { generationAvailable: false, hasPortrait: false, preview: plan("skipped", { reason: "no_audio" }), running: true };
  assert.equal(helpers.generateDisabledReason(all), "Set ELEVENLABS_API_KEY on the server to generate avatars.");
  assert.equal(
    helpers.generateDisabledReason({ ...all, generationAvailable: true }),
    "Upload a presenter portrait first.",
  );
  assert.equal(
    helpers.generateDisabledReason({ ...all, generationAvailable: true, hasPortrait: true }),
    "Generate this slide's narration audio first.",
  );
  const stale = { ...ok, preview: plan("skipped", { reason: "audio_stale" }) };
  assert.equal(
    helpers.generateDisabledReason(stale),
    "The note changed since the audio was made. Regenerate the audio first.",
  );
  assert.equal(
    helpers.generateDisabledReason({ ...ok, running: true }),
    "An avatar generation is already running.",
  );
});

test("newlyDone lists slides that turned done", () => {
  const prev = [plan("generating", { slide_id: "a" }), plan("done", { slide_id: "b" })];
  const next = [
    plan("done", { slide_id: "a" }),
    plan("done", { slide_id: "b" }),
    plan("done", { slide_id: "c" }),
  ];
  assert.deepEqual(helpers.newlyDone(prev, next), ["a", "c"]);
  assert.deepEqual(helpers.newlyDone(undefined, []), []);
});

test("failureLabel is readable and falls back to the raw reason", () => {
  assert.equal(helpers.failureLabel("moderated"), "Rejected by moderation");
  assert.equal(helpers.failureLabel("something_new"), "something_new");
  for (const r of ["timeout","model_error","invalid_parameters","dependency_failed","charging_failed","internal_error","invalid_output","configuration","request_error","audio_error","unknown","no_placeholder","no_audio","audio_stale","unsupported_audio_format","up_to_date","placeholder_removed"]) {
    assert.notEqual(helpers.failureLabel(r), r);
  }
});

test("chipFor never calls a slide without a placeholder ready", () => {
  for (const reason of ["no_placeholder", "placeholder_removed"]) {
    assert.equal(helpers.chipFor(undefined, plan("skipped", { reason })), "no_placeholder");
    assert.equal(helpers.chipFor(plan("skipped", { reason })), "no_placeholder");
  }
  assert.equal(helpers.chipFor(plan("skipped", { reason: "no_audio" })), "no_audio");
  assert.equal(helpers.chipFor(plan("skipped", { reason: "audio_stale" })), "audio_stale");
  assert.equal(helpers.chipFor(plan("skipped", { reason: "up_to_date" })), "up_to_date");
  assert.equal(
    helpers.chipFor(plan("skipped", { reason: "unsupported_audio_format" })),
    "unsupported_audio",
  );
});

test("generateDisabledReason asks for a placeholder after the portrait", () => {
  const base = { generationAvailable: true, hasPortrait: true, running: false };
  const preview = plan("skipped", { reason: "placeholder_removed" });
  assert.equal(
    helpers.generateDisabledReason({ ...base, preview }),
    "Add an avatar placeholder to this slide first.",
  );
  assert.equal(
    helpers.generateDisabledReason({ ...base, hasPortrait: false, preview }),
    "Upload a presenter portrait first.",
  );
});
