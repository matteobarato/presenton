import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { build } from "esbuild";

let clipboard;
let temporaryDirectory;

test.before(async () => {
  temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), "presenton-slide-clipboard-"),
  );
  const outputFile = path.join(temporaryDirectory, "clipboard.mjs");
  await build({
    entryPoints: [path.resolve("components/slide-editor/clipboard/clipboard.ts")],
    outfile: outputFile,
    bundle: true,
    platform: "node",
    format: "esm",
    tsconfig: path.resolve("tsconfig.json"),
    logLevel: "silent",
  });
  clipboard = await import(`${pathToFileURL(outputFile).href}?cache=${Date.now()}`);
});

test.after(async () => {
  if (temporaryDirectory) {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

const placeholder = {
  type: "image",
  video_placeholder: true,
  position: { x: 0, y: 0 },
  size: { width: 320, height: 180 },
};
const text = { type: "text", position: { x: 0, y: 0 }, size: { width: 100, height: 40 } };
const box = { x: 10, y: 20, width: 320, height: 180 };

function paste(components) {
  return clipboard.pasteTemplateV2ClipboardPayload({
    sourceUi: { components: [] },
    payload: clipboard.createTemplateV2ClipboardPayload(
      components.map((data) => ({ data, absoluteBox: box })),
    ),
    offset: 16,
  });
}

test("a copied video placeholder component is not pasted", () => {
  assert.equal(paste([{ id: "video_placeholder", elements: [placeholder] }]), null);
});

test("a copy leaves the placeholder behind and keeps the rest", () => {
  const result = paste([
    { id: "video_placeholder", elements: [placeholder] },
    { id: "group", elements: [text, placeholder] },
  ]);

  assert.equal(result.ui.components.length, 1);
  assert.deepEqual(result.ui.components[0].elements, [text]);
  assert.deepEqual(result.selection, { kind: "component", componentIndex: 0 });
});
