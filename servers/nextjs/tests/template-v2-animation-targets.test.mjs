import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";

let renderer;
let temporaryDirectory;

test.before(async () => {
  temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), "presenton-animation-targets-"),
  );
  const outputFile = path.join(temporaryDirectory, "renderer.mjs");

  await build({
    entryPoints: [path.resolve("lib/template-v2-json-to-html.ts")],
    outfile: outputFile,
    bundle: true,
    platform: "node",
    format: "esm",
    tsconfig: path.resolve("tsconfig.json"),
    logLevel: "silent",
  });

  renderer = await import(
    `${pathToFileURL(outputFile).href}?cache=${Date.now()}`
  );
});

test.after(async () => {
  if (temporaryDirectory) {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

const ui = {
  background: "#FFFFFF",
  elements: [
    {
      type: "text",
      position: { x: 40, y: 30 },
      size: { width: 600, height: 80 },
      text: "Quarterly results",
    },
    {
      type: "image",
      position: { x: 100, y: 200 },
      size: { width: 200, height: 100 },
      data: "https://example.com/photo.png",
    },
  ],
};

test("annotated fragments wrap each top-level element in a data-hf-el layer", () => {
  const html = renderer.templateV2UiToHtmlFragment(ui, {
    annotateElements: true,
  });

  assert.match(html, /data-hf-el="e0" data-hf-kind="text"/);
  assert.match(html, /data-hf-el="e1" data-hf-kind="image"/);
  assert.match(html, /transform-origin:340px 70px/);
  assert.match(html, /position:absolute;left:0;top:0;width:1280px;height:720px/);
});

test("fragments are unchanged unless annotation is asked for", () => {
  const plain = renderer.templateV2UiToHtmlFragment(ui);

  assert.doesNotMatch(plain, /data-hf-el/);
});

test("animation targets describe the same elements the fragment annotates", () => {
  const targets = renderer.templateV2AnimationTargets(ui);

  assert.equal(targets.length, 2);
  assert.deepEqual(targets[0], {
    id: "e0",
    kind: "text",
    box: { x: 40, y: 30, width: 600, height: 80 },
    text: "Quarterly results",
  });
  assert.equal(targets[1].id, "e1");
  assert.equal(targets[1].kind, "image");
});

test("chart detection and scripts are exposed for the video composition", () => {
  assert.equal(renderer.templateV2UiHasChart(ui), false);
  assert.match(renderer.templateV2ChartScripts(), /__PRESENTON_JSON_CHARTS__/);
});
