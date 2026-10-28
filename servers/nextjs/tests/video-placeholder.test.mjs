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
    path.join(tmpdir(), "presenton-video-placeholder-"),
  );
  const entryFile = path.join(temporaryDirectory, "entry.ts");
  const outputFile = path.join(temporaryDirectory, "bundle.mjs");
  await writeFile(
    entryFile,
    `export * from ${JSON.stringify(
      path.resolve("components/slide-editor/video/video-placeholder.ts"),
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

const placeholder = (overrides = {}) => ({
  type: "image",
  name: "avatar_video",
  video_placeholder: true,
  data: "/static/images/video-placeholder.png",
  position: { x: 936, y: 516 },
  size: { width: 320, height: 180 },
  ...overrides,
});

const text = { type: "text", runs: [{ text: "Hello" }] };
const image = { type: "image", data: "/a.png" };

test("finds the placeholder anywhere in the tree, never a plain image", () => {
  const nested = placeholder();
  const ui = {
    elements: [image],
    components: [{ id: "c", elements: [{ type: "group", children: [nested] }] }],
  };

  assert.equal(helpers.findVideoPlaceholder(ui), nested);
  assert.equal(helpers.findVideoPlaceholder({ elements: [image] }), null);
  assert.equal(helpers.findVideoPlaceholder(null), null);
  assert.equal(helpers.isVideoPlaceholderElement(image), false);
  assert.equal(
    helpers.isVideoPlaceholderElement({ ...image, video_placeholder: "yes" }),
    false,
  );
});

const placeholderComponent = (box = { x: 936, y: 516 }, overrides = {}) => ({
  id: "video_placeholder",
  description: "Avatar video placeholder",
  position: box,
  elements: [placeholder({ position: { x: 0, y: 0 }, ...overrides })],
});

test("the stage box adds up the positions the placeholder is placed in", () => {
  const ui = {
    components: [
      {
        id: "c",
        position: { x: 100, y: 50 },
        elements: [
          {
            type: "group",
            position: { x: 10, y: 20 },
            children: [placeholder({ position: { x: 5, y: 6 } })],
          },
        ],
      },
    ],
  };

  assert.deepEqual(helpers.findVideoPlaceholderBox(ui), {
    x: 115,
    y: 76,
    width: 320,
    height: 180,
  });
  assert.equal(helpers.findVideoPlaceholderBox({ elements: [image] }), null);
});

test("lifts a root placeholder into a component on top of the slide", () => {
  const below = { id: "c", elements: [text] };
  const ui = { elements: [image, placeholder()], components: [below] };

  const next = helpers.liftRootVideoPlaceholder(ui);

  assert.deepEqual(next.elements, [image]);
  assert.deepEqual(next.components, [below, placeholderComponent()]);
  assert.deepEqual(helpers.findVideoPlaceholderBox(next), helpers.findVideoPlaceholderBox(ui));
  assert.equal(ui.elements.length, 2);
  const untouched = { elements: [image], components: [below] };
  assert.equal(helpers.liftRootVideoPlaceholder(untouched), untouched);
});

test("adds the server's placeholder on top of a slide that has none", () => {
  const ui = { components: [{ id: "c", elements: [text] }], elements: [image] };
  const serverUi = {
    elements: [image],
    components: [{ id: "c", elements: [text] }, placeholderComponent({ x: 40, y: 50 })],
  };

  const next = helpers.withVideoPlaceholder(ui, serverUi);

  assert.deepEqual(next.elements, [image]);
  assert.deepEqual(next.components, [ui.components[0], placeholderComponent({ x: 40, y: 50 })]);
  assert.equal(ui.components.length, 1);
});

test("places a server placeholder the old way, in the root elements, by its box", () => {
  const ui = { components: [{ id: "c", elements: [text] }] };

  const next = helpers.withVideoPlaceholder(ui, { elements: [placeholder()] });

  assert.deepEqual(next.components[1], placeholderComponent());
});

test("keeps the editor's placement and layer when the slide already has a placeholder", () => {
  const local = placeholder({
    data: "/old-poster.png",
    position: { x: 40, y: 50 },
    size: { width: 200, height: 200 },
  });
  const above = { id: "above", elements: [text] };
  const ui = {
    elements: [text],
    components: [{ id: "c", elements: [local] }, above],
  };

  const next = helpers.withVideoPlaceholder(ui, { components: [placeholderComponent()] });

  assert.deepEqual(next.elements, [text]);
  assert.deepEqual(next.components[0].elements, [
    placeholder({ position: { x: 40, y: 50 }, size: { width: 200, height: 200 } }),
  ]);
  assert.deepEqual(next.components[1], above);
  assert.equal(local.data, "/old-poster.png");
});

test("keeps a single placeholder when the slide somehow had two", () => {
  const ui = {
    components: [
      { id: "a", elements: [placeholder(), text] },
      { id: "b", elements: [placeholder()] },
    ],
  };

  const next = helpers.withVideoPlaceholder(ui, {
    components: [placeholderComponent(undefined, { data: "/new.png" })],
  });

  assert.equal(next.components[0].elements.length, 2);
  assert.equal(next.components[0].elements[0].data, "/new.png");
  assert.deepEqual(next.components[1].elements, []);
});

test("leaves the slide alone when the server has no placeholder", () => {
  const ui = { elements: [text], components: [] };

  assert.deepEqual(helpers.withVideoPlaceholder(ui, { elements: [text] }), ui);
});

test("removing the video takes every placeholder, and its own component, out", () => {
  const ui = {
    elements: [text, placeholder()],
    components: [
      { id: "c", elements: [image, placeholder()] },
      placeholderComponent(),
    ],
    poster: placeholder(),
  };

  const next = helpers.withoutVideoPlaceholder(ui);

  assert.deepEqual(next.elements, [text]);
  assert.deepEqual(next.components, [{ id: "c", elements: [image] }]);
  assert.equal(next.poster, null);
  assert.equal(ui.elements.length, 2);
});

test("an avatar always covers its placeholder, whatever fit it stored", () => {
  const stored = placeholder({ fit: "fill" });
  const shown = helpers.withAvatarFit(stored);

  assert.equal(shown.fit, "cover");
  assert.equal(stored.fit, "fill");
  assert.deepEqual({ ...shown, fit: "fill" }, stored);
});
