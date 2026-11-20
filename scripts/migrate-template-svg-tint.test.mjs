import assert from "node:assert/strict";
import test from "node:test";

import { migrateTemplate } from "./migrate-template-svg-tint.mjs";

const svg = (body, attrs = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"${attrs}>${body}</svg>`;

const SVGS = {
  "static/one.svg": svg('<path d="M0 0h10v10z" fill="#1A3DB3"/>'),
  "static/two.svg": svg('<path d="M0 0h5v5z" fill="#1A3DB3"/><path d="M5 5h5v5z" fill="#FF0000"/>'),
  "static/grad.svg": svg(
    '<defs><linearGradient id="g"><stop offset="0" stop-color="#1A3DB3"/></linearGradient></defs><path d="M0 0h10v10z" fill="url(#g)"/>',
  ),
  "static/alpha.svg": svg('<path d="M0 0h10v10z" fill="#1A3DB3" fill-opacity="0.5"/>'),
  "static/opacity.svg": svg('<path d="M0 0h10v10z" fill="#1A3DB3" opacity=".4"/>'),
  "static/filter.svg": svg(
    '<filter id="f"><feBlend/></filter><path d="M0 0h10v10z" fill="#1A3DB3" filter="url(#f)"/>',
  ),
  "static/stroke.svg": svg('<path d="M0 0h10v10" fill="none" stroke="#1A3DB3"/>'),
  "static/strokeblack.svg": svg('<path d="M0 0h10v10" stroke="#1A3DB3"/>'),
  "static/namedstroke.svg": svg('<path d="M0 0h10v10" fill="none" stroke="black"/><path d="M0 0h5" fill="none" stroke="#1A3DB3"/>'),
  "static/groupfillhole.svg": svg('<g fill="#1A3DB3"><path d="M0 0h5v5z"/></g><path d="M5 5h5v5z" stroke="#1A3DB3"/>'),
  "static/groupfill.svg": svg('<g fill="#1A3DB3"><path d="M0 0h5v5z"/><path d="M5 5h5v5z"/></g>'),
  "static/rootfill.svg": svg('<path d="M0 0h5v5z"/>', ' fill="#1A3DB3"'),
  "static/strokeopacity.svg": svg('<circle cx="5" cy="5" r="4" fill="none" stroke="#1A3DB3" stroke-opacity=".3" stroke-width="2"/>'),
  "static/icon.svg": svg('<path d="M0 0h10v10z" fill="#00AA00"/>'),
};

const image = (data, extra = {}) => ({
  type: "image",
  position: { x: 0, y: 0 },
  size: { width: 10, height: 10 },
  data,
  decorative: true,
  is_icon: false,
  ...extra,
});

const template = (...items) => ({
  id: "t",
  layouts: [{ id: "l", elements: [{ type: "group", children: items }] }],
});

const readSvg = (p) => SVGS[p] ?? null;
const items = (json) => json.layouts[0].elements[0].children;

test("single-fill svg is tinted with its original-case fill", () => {
  const result = migrateTemplate(template(image("static/one.svg")), readSvg);
  assert.equal(result.migrated, 1);
  const [item] = items(result.json);
  assert.equal(item.color, "#1A3DB3");
  assert.equal(item.tint, true);
  assert.equal(item.is_icon, false);
});

test("ineligible svgs are skipped with a reason", () => {
  const input = template(
    image("static/two.svg"),
    image("static/grad.svg"),
    image("static/filter.svg"),
    image("static/namedstroke.svg"),
    image("static/groupfillhole.svg"),
    image("static/strokeblack.svg"),
  );
  const result = migrateTemplate(input, readSvg);
  assert.equal(result.migrated, 0);
  assert.deepEqual(result.json, input);
  assert.equal(result.skipped.length >= 5, true);
  assert.equal(result.skipped.reduce((n, s) => n + s.count, 0), 6);
  const reasons = result.skipped.map((s) => s.reason);
  assert.ok(reasons.includes("named stroke color"));
  assert.ok(reasons.includes("shape without explicit fill"));
  for (const s of result.skipped) assert.ok(s.reason);
});

test("partial opacity no longer blocks migration (mask keeps alpha)", () => {
  const result = migrateTemplate(
    template(image("static/alpha.svg"), image("static/opacity.svg"), image("static/strokeopacity.svg")),
    readSvg,
  );
  assert.equal(result.migrated, 3);
  for (const item of items(result.json)) {
    assert.equal(item.color, "#1A3DB3");
    assert.equal(item.tint, true);
  }
});

test("stroke-only svg migrates with its stroke color", () => {
  const result = migrateTemplate(template(image("static/stroke.svg")), readSvg);
  assert.equal(result.migrated, 1);
  assert.equal(items(result.json)[0].color, "#1A3DB3");
  assert.equal(items(result.json)[0].tint, true);
});

test("group and root fills cover only the shapes inside them", () => {
  const result = migrateTemplate(
    template(image("static/groupfill.svg"), image("static/rootfill.svg"), image("static/groupfillhole.svg")),
    readSvg,
  );
  assert.equal(result.migrated, 2);
  assert.equal(items(result.json)[2].tint, undefined);
});

test("colorless is_icon svg gets color only", () => {
  const result = migrateTemplate(
    template(image("static/icon.svg", { is_icon: true, decorative: false })),
    readSvg,
  );
  const [item] = items(result.json);
  assert.equal(item.color, "#00AA00");
  assert.equal("tint" in item, false);
  assert.equal(item.is_icon, true);
  assert.equal(result.migrated, 1);
});

test("same svg referenced twice, in nested containers, migrates both", () => {
  const input = {
    layouts: [
      {
        elements: [
          image("static/one.svg"),
          { type: "frame", child: image("static/one.svg") },
          { type: "group", elements: [{ type: "group", children: [image("static/one.svg")] }] },
        ],
      },
    ],
  };
  const result = migrateTemplate(input, readSvg);
  assert.equal(result.migrated, 3);
  assert.equal(JSON.stringify(result.json).match(/"tint":true/g).length, 3);
});

test("is idempotent", () => {
  const first = migrateTemplate(
    template(image("static/one.svg"), image("static/icon.svg", { is_icon: true })),
    readSvg,
  );
  const second = migrateTemplate(first.json, readSvg);
  assert.equal(second.migrated, 0);
  assert.deepEqual(second.json, first.json);
});

test("rasters, non-decorative svgs, and the input object are untouched", () => {
  const input = template(
    image("static/photo.png"),
    image("static/one.svg", { decorative: false }),
    { type: "text", data: "static/one.svg" },
  );
  const copy = structuredClone(input);
  const result = migrateTemplate(input, readSvg);
  assert.equal(result.migrated, 0);
  assert.deepEqual(result.json, copy);
  assert.deepEqual(input, copy);
  assert.deepEqual(result.skipped, []);
});

test("never sets is_icon on a migrated decorative item", () => {
  const result = migrateTemplate(template(image("static/one.svg", { is_icon: undefined })), readSvg);
  assert.equal(items(result.json)[0].is_icon, undefined);
});

test("missing svg file is skipped, not thrown", () => {
  const result = migrateTemplate(template(image("static/gone.svg")), readSvg);
  assert.equal(result.migrated, 0);
  assert.equal(result.skipped[0].count, 1);
});
