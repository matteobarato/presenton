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

test("adds the server's placeholder on top of a slide that has none", () => {
  const ui = { components: [{ id: "c", elements: [text] }], elements: [image] };
  const server = placeholder();

  const next = helpers.withVideoPlaceholder(ui, server);

  assert.deepEqual(next.elements, [image, server]);
  assert.notEqual(next.elements[1], server);
  assert.deepEqual(next.components, ui.components);
  assert.deepEqual(ui.elements, [image]);
});

test("starts the root element list for a layout made of components", () => {
  const ui = { components: [{ id: "c", elements: [text] }] };

  const next = helpers.withVideoPlaceholder(ui, placeholder());

  assert.deepEqual(next.elements, [placeholder()]);
});

test("keeps the editor's placement when the slide already has a placeholder", () => {
  const local = placeholder({
    data: "/old-poster.png",
    position: { x: 40, y: 50 },
    size: { width: 200, height: 200 },
  });
  const ui = {
    elements: [text],
    components: [{ id: "c", elements: [local] }],
  };

  const next = helpers.withVideoPlaceholder(ui, placeholder());

  assert.deepEqual(next.elements, [text]);
  assert.deepEqual(next.components[0].elements, [
    placeholder({ position: { x: 40, y: 50 }, size: { width: 200, height: 200 } }),
  ]);
  assert.equal(local.data, "/old-poster.png");
});

test("keeps a single placeholder when the slide somehow had two", () => {
  const ui = { elements: [placeholder(), text, placeholder()] };

  const next = helpers.withVideoPlaceholder(ui, placeholder({ data: "/new.png" }));

  assert.equal(next.elements.length, 2);
  assert.equal(next.elements[0].data, "/new.png");
  assert.deepEqual(next.elements[1], text);
});

test("removing the video takes every placeholder out and leaves the rest", () => {
  const ui = {
    elements: [text, placeholder()],
    components: [{ id: "c", elements: [image, placeholder()] }],
    poster: placeholder(),
  };

  const next = helpers.withoutVideoPlaceholder(ui);

  assert.deepEqual(next.elements, [text]);
  assert.deepEqual(next.components[0].elements, [image]);
  assert.equal(next.poster, null);
  assert.equal(ui.elements.length, 2);
});
