#!/usr/bin/env node

import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HEX = /#[0-9a-fA-F]{3,8}\b/g;

function usage() {
  return `Usage: node scripts/migrate-template-svg-tint.mjs [options]

Marks single-color decorative SVG images in templates/*/template.json as
theme-tinted ("color" + "tint": true). Dry run unless --write is given.

Options:
  --write            Apply the changes to template.json files
  --templates <dir>  Templates root (default: ./templates next to scripts/)
  --help             Show this help
`;
}

// Returns { color } for an eligible SVG, or { reason } when it must be skipped.
export function analyzeSvg(source) {
  if (typeof source !== "string") return { reason: "svg file not readable" };
  if (/<(linearGradient|radialGradient)\b/i.test(source) || /(?:fill|stroke)\s*[:=]\s*["']?url\(/i.test(source)) {
    return { reason: "gradient" };
  }
  for (const [tag, reason] of [
    ["filter", "filter"],
    ["mask", "mask"],
    ["clipPath", "clipPath"],
    ["image", "embedded image"],
    ["style", "style element"],
    ["pattern", "pattern"],
  ]) {
    if (new RegExp(`<${tag}\\b`, "i").test(source)) return { reason };
  }
  // Partial opacity is fine: a CSS mask uses the SVG's alpha channel, so it is preserved.
  if (/\b(?:fill|stroke)\s*[:=]\s*["']?\s*(?:rgba?|hsla?)\(/i.test(source)) {
    return { reason: "non-hex color" };
  }

  const distinct = new Map();
  for (const match of source.matchAll(HEX)) {
    if (![4, 7].includes(match[0].length)) return { reason: "non-#rrggbb color" };
    distinct.set(match[0].toLowerCase(), match[0]);
  }
  if (distinct.size === 0) return { reason: "no hex color" };
  if (distinct.size > 1) return { reason: "multiple colors" };
  const [color] = distinct.values();
  if (color.length !== 7) return { reason: "non-#rrggbb color" };

  const strokeValues = [...source.matchAll(/\bstroke\s*[:=]\s*["']?\s*([^\s"';>]+)/gi)].map((m) => m[1]);
  if (strokeValues.some((v) => !/^(?:none|inherit|#[0-9a-f]{3,8})$/i.test(v))) {
    return { reason: "named stroke color" };
  }

  // Resolve each shape's effective fill through its ancestors (<svg>/<g>). A shape
  // with no fill anywhere up the chain paints default black, so it cannot be tinted.
  const effective = [];
  const stack = [undefined];
  const ownFill = (attrs) => attrs.match(/\bfill\s*[:=]\s*["']?\s*([^\s"';>/]+)/i)?.[1];
  for (const tag of source.matchAll(/<(\/?)([a-zA-Z][\w:-]*)\b([^>]*)>/g)) {
    const [, closing, rawName, attrs] = tag;
    const name = rawName.toLowerCase();
    if (name === "svg" || name === "g") {
      if (closing) {
        if (stack.length > 1) stack.pop();
      } else if (!/\/\s*$/.test(attrs)) {
        const own = ownFill(attrs);
        stack.push(own && !/^inherit$/i.test(own) ? own : stack[stack.length - 1]);
      }
    } else if (!closing && /^(?:path|rect|circle|ellipse|polygon|polyline|line)$/.test(name)) {
      const own = ownFill(attrs);
      effective.push(own && !/^inherit$/i.test(own) ? own : stack[stack.length - 1]);
    }
  }
  if (effective.some((v) => v === undefined)) return { reason: "shape without explicit fill" };
  if (effective.some((v) => !/^(?:none|#[0-9a-f]{3,8})$/i.test(v))) return { reason: "named fill color" };
  // All fills are none or the one hex: a stroke-only svg is eligible with its stroke hex.
  return { color };
}

function isSvgPath(data) {
  return typeof data === "string" && /\.svg(?:[?#].*)?$/i.test(data);
}

export function migrateTemplate(json, readSvg) {
  const next = structuredClone(json);
  const analysis = new Map();
  const skipped = new Map();
  let migrated = 0;

  const analyze = (data) => {
    if (!analysis.has(data)) analysis.set(data, analyzeSvg(readSvg(data)));
    return analysis.get(data);
  };
  const skip = (reason) => skipped.set(reason, (skipped.get(reason) ?? 0) + 1);

  const visit = (node) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== "object") return;
    if (node.type === "image" && isSvgPath(node.data)) {
      const isIcon = node.is_icon === true;
      const decorative = node.decorative === true && !isIcon;
      if (!node.color && (isIcon || decorative) && node.tint !== true) {
        const result = analyze(node.data);
        if (result.color) {
          node.color = result.color;
          if (!isIcon) node.tint = true;
          migrated += 1;
        } else {
          skip(result.reason);
        }
      }
    }
    Object.values(node).forEach(visit);
  };
  visit(next);

  return {
    json: next,
    migrated,
    skipped: [...skipped].map(([reason, count]) => ({ reason, count })),
  };
}

function parseArgs(argv) {
  const options = { write: false, templates: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") return { help: true };
    if (argument === "--write") options.write = true;
    else if (argument === "--templates") {
      options.templates = argv[++index];
      if (!options.templates) throw new Error("--templates requires a directory");
    } else throw new Error(`Unknown option: ${argument}`);
  }
  return options;
}

async function run({ write, templates }) {
  const root =
    templates ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "templates");
  const names = (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const totals = { migrated: 0, skipped: new Map(), files: new Set() };
  const lines = [];

  for (const name of names) {
    const file = path.join(root, name, "template.json");
    let raw;
    try {
      raw = await readFile(file, "utf8");
    } catch {
      continue;
    }
    const dir = path.join(root, name);
    const cache = new Map();
    const reads = [...new Set(raw.match(/"[^"]+\.svg"/gi) ?? [])].map((s) => JSON.parse(s));
    for (const rel of reads) {
      try {
        cache.set(rel, await readFile(path.join(dir, rel), "utf8"));
      } catch {
        /* reported as unreadable */
      }
    }
    const result = migrateTemplate(JSON.parse(raw), (rel) => cache.get(rel) ?? null);
    const skippedCount = result.skipped.reduce((n, s) => n + s.count, 0);
    lines.push(`${name}: migrated ${result.migrated}, skipped ${skippedCount}`);
    totals.migrated += result.migrated;
    for (const { reason, count } of result.skipped) {
      totals.skipped.set(reason, (totals.skipped.get(reason) ?? 0) + count);
    }
    for (const [rel, svg] of cache) {
      if (analyzeSvg(svg).color) totals.files.add(`${name}/${rel}`);
    }
    if (write && result.migrated > 0) {
      await writeFile(file, `${JSON.stringify(result.json, null, 2)}\n`);
    }
  }

  lines.push("");
  lines.push(
    `${write ? "Migrated" : "Would migrate"} ${totals.migrated} reference(s); ${totals.files.size} eligible unique svg file(s) (per template).`,
  );
  lines.push("Skipped by reason:");
  for (const [reason, count] of [...totals.skipped].sort((a, b) => b[1] - a[1])) {
    lines.push(`  ${reason}: ${count}`);
  }
  if (!write) lines.push("", "Dry run: no files written. Pass --write to apply.");
  return lines.join("\n");
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(usage());
      return;
    }
    process.stdout.write(`${await run(options)}\n`);
  } catch (error) {
    process.stderr.write(`Migration failed: ${error.message}\n\n${usage()}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
