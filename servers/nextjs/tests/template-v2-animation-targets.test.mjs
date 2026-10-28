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

test("placeholder is rendered but never an animation target", () => {
  const withPlaceholder = {
    background: "#FFFFFF",
    elements: [
      {
        type: "text",
        position: { x: 40, y: 30 },
        size: { width: 600, height: 80 },
        text: "Title",
      },
      {
        type: "image",
        video_placeholder: true,
        data: "/static/images/video-placeholder.png",
        position: { x: 900, y: 400 },
        size: { width: 320, height: 180 },
      },
    ],
  };

  assert.deepEqual(
    renderer.templateV2AnimationTargets(withPlaceholder).map((t) => t.id),
    ["e0"],
  );

  const html = renderer.templateV2UiToHtmlFragment(withPlaceholder, {
    annotateElements: true,
  });

  assert.equal((html.match(/data-hf-el=/g) ?? []).length, 1);
  assert.match(html, /<img/);
});

const placeholderComponent = {
  id: "video_placeholder",
  position: { x: 900, y: 400 },
  elements: [
    {
      type: "image",
      video_placeholder: true,
      data: "/static/images/video-placeholder.png",
      position: { x: 0, y: 0 },
      size: { width: 320, height: 180 },
    },
  ],
};

const card = (id, text) => ({
  id,
  position: { x: 880, y: 380 },
  elements: [
    {
      type: "text",
      position: { x: 0, y: 0 },
      size: { width: 200, height: 40 },
      text,
    },
  ],
});

test("a placeholder's own component is never an animation target", () => {
  const layered = {
    background: "#FFFFFF",
    components: [card("below", "Below"), placeholderComponent],
  };

  assert.deepEqual(
    renderer.templateV2AnimationTargets(layered).map((t) => t.id),
    ["e0"],
  );
});

test("a slide is split at its placeholder into the layers around the avatar", () => {
  const layered = {
    background: "#123456",
    elements: [
      {
        type: "text",
        position: { x: 40, y: 30 },
        size: { width: 600, height: 80 },
        text: "Title",
      },
    ],
    components: [card("below", "Below"), placeholderComponent, card("above", "Above")],
  };

  const layers = renderer.templateV2AvatarLayersHtmlFragments(layered, {
    annotateElements: true,
  });

  assert.match(layers.below, /background:#123456/);
  assert.match(layers.below, /Title/);
  assert.match(layers.below, /Below/);
  assert.match(layers.below, /video-placeholder\.png/);
  assert.doesNotMatch(layers.below, /Above/);
  assert.match(layers.above, /background:transparent/);
  assert.match(layers.above, /Above/);
  assert.doesNotMatch(layers.above, /Title|Below|video-placeholder/);
  // Ids are the whole slide's, so the slide's animation plan drives both.
  assert.match(layers.below, /data-hf-el="e1"/);
  assert.match(layers.above, /data-hf-el="e3"/);
  assert.doesNotMatch(layers.above, /data-hf-el="e[012]"/);
});

test("no layers when nothing is drawn over the placeholder", () => {
  assert.equal(
    renderer.templateV2AvatarLayersHtmlFragments({
      components: [card("below", "Below"), placeholderComponent],
    }),
    null,
  );
  assert.equal(renderer.templateV2AvatarLayersHtmlFragments(ui), null);
});

test("a placeholder in the root elements is on top, as exports always drew it", () => {
  const legacy = {
    elements: [placeholderComponent.elements[0]],
    components: [card("above", "Above")],
  };

  assert.equal(renderer.templateV2AvatarLayersHtmlFragments(legacy), null);
});

test("chart detection and scripts are exposed for the video composition", () => {
  assert.equal(renderer.templateV2UiHasChart(ui), false);
  assert.match(renderer.templateV2ChartScripts(), /__PRESENTON_JSON_CHARTS__/);
});
