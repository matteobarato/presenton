#!/usr/bin/env node
// Render Template V2 layouts to PNG with the app's own renderer, measure them,
// and build a contact sheet.
//
//   node .claude/skills/slideshows-templates/scripts/render_layouts.mjs <template> \
//        [--layouts id1,id2] [--variants sample,max,avatar] [--out DIR] [--base URL] [--theme theme.json]
//
// <template>: bundled id ("modern"), template dir, template.json (bundled or API
// shape), a single layout JSON, or a JSON list of layouts (add --fonts-from <template>
// to borrow fonts/theme).
//
// Variants:
//   sample  the layout exactly as authored (its sample text)
//   max     every editable text filled to max_length, lists to max_items x
//           max_item_length, flex/grid repeats expanded to max_children, tables to
//           max_rows: the worst case the generator may produce
//   avatar  the video placeholder shows a presenter silhouette (how a narrated slide looks)
//
// Output: DIR/<layout>__<variant>.png, DIR/contact-sheet.png, DIR/report.json.
// Exit code 1 when any measured problem (overflow, off-stage text, broken asset,
// text covering the presenter) is found.
//
// Uses frontend/src/render/legacy/lib/template-v2-json-to-html.ts through Vite SSR,
// and Playwright's Chromium from frontend/node_modules. Assets are served from
// disk (servers/fastapi/static, frontend/public, app_data, the template's static/)
// and anything else falls through to --base (default $PRESENTON_BASE_URL or
// http://localhost:5001) with $PRESENTON_API_KEY as Bearer auth when set.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../../..');
const FRONTEND = path.join(REPO, 'frontend');
const req = createRequire(path.join(FRONTEND, 'package.json'));
const { createServer } = await import(pathToFileURL(req.resolve('vite')).href);
const pw = await import(pathToFileURL(req.resolve('playwright')).href);
const chromium = pw.chromium ?? pw.default?.chromium;

// ------------------------------------------------------------------ args
const argv = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv.splice(i, 2)[1] : dflt;
};
const outDir = path.resolve(opt('out', path.join(process.cwd(), 'render-out')));
const base = (opt('base', process.env.PRESENTON_BASE_URL || 'http://localhost:5001')).replace(/\/$/, '');
const onlyLayouts = opt('layouts', '')?.split(',').filter(Boolean);
const variants = opt('variants', 'sample,max,avatar').split(',').filter(Boolean);
const fontsFrom = opt('fonts-from', '');
const themeFile = opt('theme', '');
const target = argv[0];
if (!target) {
  console.error('usage: render_layouts.mjs <template|layout.json> [--layouts ids] [--variants sample,max,avatar] [--out DIR]');
  process.exit(2);
}

function resolveTemplate(ref) {
  if (fs.existsSync(ref) && fs.statSync(ref).isFile()) return path.resolve(ref);
  if (fs.existsSync(path.join(ref, 'template.json'))) return path.resolve(ref, 'template.json');
  const bundled = path.join(REPO, 'templates', ref, 'template.json');
  if (fs.existsSync(bundled)) return bundled;
  throw new Error(`template not found: ${ref}`);
}

function loadTemplate(file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (Array.isArray(data)) return { layouts: data };
  if (data.components && data.id) return { layouts: [data] };
  const layouts = Array.isArray(data.layouts) ? data.layouts : data.layouts?.layouts ?? [];
  return { ...data, layouts };
}

const templateFile = resolveTemplate(target);
const template = loadTemplate(templateFile);
let templateDir = path.dirname(templateFile);
if (fontsFrom) {
  const donorFile = resolveTemplate(fontsFrom);
  const donor = loadTemplate(donorFile);
  template.fonts ??= donor.fonts;
  template.theme ??= donor.theme;
  template.id ??= donor.id;
  templateDir = path.dirname(donorFile);
}
if (themeFile) template.theme = JSON.parse(fs.readFileSync(themeFile, 'utf8'));
// Key used in rewritten asset URLs; localFile() maps /app_data/templates/<key>/static/...
// back to the template directory on disk (the renderer's resolveBackendAssetUrl
// would turn any other prefix in front of /static/ into the global /static/).
const TEMPLATE_KEY = String(template.id ?? path.basename(templateDir)).replace(/[^\w.-]/g, '_') || 'template';
// Template-relative font files ("static/X.ttf") are rewritten by the backend when seeding.
if (template.fonts && typeof template.fonts === 'object') {
  for (const [k, v] of Object.entries(template.fonts)) {
    if (typeof v === 'string' && /^static\//.test(v)) template.fonts[k] = `/app_data/templates/${TEMPLATE_KEY}/${v}`;
  }
}
let layouts = template.layouts;
if (onlyLayouts?.length) {
  layouts = layouts.filter((l) => onlyLayouts.includes(l.id));
  const missing = onlyLayouts.filter((id) => !layouts.some((l) => l.id === id));
  if (missing.length) console.error(`warning: layouts not found: ${missing.join(', ')}`);
}
if (!layouts.length) {
  console.error('no layouts to render');
  process.exit(2);
}
fs.mkdirSync(outDir, { recursive: true });

// ------------------------------------------------------------------ variants
// Worst-case filler: long, realistic words wrap worse than short ones, so a box that
// holds this text at max_length holds what the generator writes. Deterministic per
// field (seeded by its name), independent of which layouts are rendered together.
const WORDS = ('implementation organizational transformation accountability infrastructure ' +
  'sustainability collaboration measurement operational differentiation acceleration ' +
  'customers revenue platform strategy partnerships performance governance').split(' ');

function hashSeed(str) {
  let h = 0;
  for (const ch of String(str ?? '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

function filler(n, seed = 0) {
  if (!n || n <= 0) return '';
  let s = '';
  let i = seed % WORDS.length;
  while (s.length < n) {
    const w = WORDS[i++ % WORDS.length];
    s += (s ? ' ' : '') + (s ? w : w[0].toUpperCase() + w.slice(1));
  }
  s = s.slice(0, n);
  if (s.endsWith(' ')) s = s.slice(0, -1) + 'x';
  return s;
}

const clone = (v) => JSON.parse(JSON.stringify(v));

function expandRepeats(node) {
  if (Array.isArray(node)) return node.forEach(expandRepeats);
  if (!node || typeof node !== 'object') return;
  if ((node.type === 'flex' || node.type === 'grid') && Array.isArray(node.children) && node.children.length) {
    const max = Number.isInteger(node.max_children) ? node.max_children : node.children.length;
    while (node.children.length < max) node.children.push(clone(node.children[node.children.length - 1]));
  }
  if (node.type === 'table' && Array.isArray(node.rows) && node.rows.length && Number.isInteger(node.max_rows)) {
    while (node.rows.length < node.max_rows) node.rows.push(clone(node.rows[node.rows.length - 1]));
  }
  for (const v of Object.values(node)) if (v && typeof v === 'object') expandRepeats(v);
}

const FILLED = new Set();
function fillMax(node) {
  if (Array.isArray(node)) return node.forEach(fillMax);
  if (!node || typeof node !== 'object') return;
  if (node.type === 'text' && node.decorative === false && Number.isInteger(node.max_length)) {
    const run = node.runs?.find((r) => r && r.type !== 'latex') ?? { text: '' };
    const t = filler(node.max_length, hashSeed(node.name));
    FILLED.add(t);
    node.runs = [{ ...run, text: t }];
  }
  if (node.type === 'text-list' && node.decorative === false && Number.isInteger(node.max_items)) {
    const first = node.items?.[0]?.[0] ?? { text: '' };
    node.items = Array.from({ length: node.max_items }, (_, k) => [{ ...first, text: filler(node.max_item_length ?? 40, hashSeed(node.name) + k) }]);
  }
  for (const v of Object.values(node)) if (v && typeof v === 'object') fillMax(v);
}

function setAvatar(node) {
  if (Array.isArray(node)) return node.forEach(setAvatar);
  if (!node || typeof node !== 'object') return;
  if (node.type === 'image' && node.video_placeholder === true) node.data = '/__presenter.png';
  for (const v of Object.values(node)) if (v && typeof v === 'object') setAvatar(v);
}

function hasPlaceholder(node) {
  if (Array.isArray(node)) return node.some(hasPlaceholder);
  if (!node || typeof node !== 'object') return false;
  if (node.type === 'image' && node.video_placeholder === true) return true;
  return Object.values(node).some((v) => v && typeof v === 'object' && hasPlaceholder(v));
}

function rewriteRelativeAssets(node) {
  if (Array.isArray(node)) return node.forEach(rewriteRelativeAssets);
  if (!node || typeof node !== 'object') return;
  if (node.type === 'image' && typeof node.data === 'string' && /^static\//.test(node.data)) {
    node.data = `/app_data/templates/${TEMPLATE_KEY}/${node.data}`;
  }
  for (const v of Object.values(node)) if (v && typeof v === 'object') rewriteRelativeAssets(v);
}

function variantUi(layout, variant) {
  const ui = clone(layout);
  rewriteRelativeAssets(ui);
  if (variant === 'max') {
    expandRepeats(ui);
    fillMax(ui);
  }
  if (variant === 'avatar') setAvatar(ui);
  return ui;
}

// Static boxes for name lookup (absolute-positioned elements only).
function namedBoxes(layout) {
  const out = [];
  const walk = (els, ox, oy, inFlow) => {
    for (const el of els ?? []) {
      if (!el || typeof el !== 'object') continue;
      const x = ox + (el.position?.x ?? 0);
      const y = oy + (el.position?.y ?? 0);
      if ((el.type === 'text' || el.type === 'text-list') && el.size && !inFlow) {
        out.push({ name: el.name ?? '(decorative)', x, y, w: el.size.width, h: el.size.height });
      }
      if (el.type === 'group') walk(el.children, x, y, inFlow);
      if (el.type === 'container' && el.child) walk([el.child], x + (el.padding?.left ?? 0), y + (el.padding?.top ?? 0), inFlow);
      if (el.type === 'flex' || el.type === 'grid') walk(el.children, x, y, true);
    }
  };
  for (const c of layout.components ?? []) walk(c.elements, c.position?.x ?? 0, c.position?.y ?? 0, false);
  return out;
}

// ------------------------------------------------------------------ rendering
const vite = await createServer({
  root: FRONTEND,
  configFile: false,
  resolve: { alias: { '@': path.join(FRONTEND, 'src') } },
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
  logLevel: 'error',
});
const renderer = await vite.ssrLoadModule('/src/render/legacy/lib/template-v2-json-to-html.ts');
const themeMod = await vite.ssrLoadModule('/src/render/theme.ts');

// A theme font URL that is a stylesheet (Google Fonts css2) must be <link>ed: used as an
// @font-face src it fails and the browser falls back to serif for every matching weight.
function themeFontTag(theme) {
  const url = theme?.fonts?.textFont?.url;
  if (typeof url === 'string' && /\/css2?\?|\.css(\?|$)/.test(url)) {
    return `<link rel="stylesheet" href="${url.replace(/"/g, '&quot;')}">`;
  }
  const css = themeMod.themeFontFaceCss(theme);
  return css ? `<style>${css}</style>` : '';
}

function buildHtml(ui) {
  let html = renderer.templateV2UiToHtml(ui, { fonts: template.fonts });
  if (!html) return null;
  const theme = template.theme;
  const extra =
    `<base href="${base}/">` +
    themeFontTag(theme) +
    `<style>:root{${themeMod.cssVarDeclarations(themeMod.themeCssVars(theme))}}</style>`;
  return html.replace('<head>', `<head>${extra}`);
}

const LOCAL_ROOTS = [
  ['/__tpl/', templateDir],
  ['/static/', path.join(REPO, 'servers/fastapi/static')],
  ['/vendor/', path.join(FRONTEND, 'public/vendor')],
  ['/app_data/', path.join(REPO, 'app_data')],
  ['/', path.join(FRONTEND, 'public')],
];
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.gif': 'image/gif', '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.otf': 'font/otf', '.js': 'text/javascript', '.css': 'text/css' };

function localFile(urlPath) {
  if (urlPath === '/__presenter.png') return path.join(FRONTEND, 'public/presenter-silhouette.png');
  for (const [prefix, root] of LOCAL_ROOTS) {
    if (!urlPath.startsWith(prefix)) continue;
    const rel = decodeURIComponent(urlPath.slice(prefix.length));
    const file = path.resolve(root, prefix === '/__tpl/' ? rel : rel);
    if (file.startsWith(root) && fs.existsSync(file) && fs.statSync(file).isFile()) return file;
    // bundled template assets seeded to /app_data/templates/<id>/static/...
    const m = urlPath.match(/^\/app_data\/templates\/[^/]+\/(static\/.+)$/);
    if (m) {
      const f2 = path.join(templateDir, decodeURIComponent(m[1]));
      if (fs.existsSync(f2)) return f2;
    }
  }
  return null;
}

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
  extraHTTPHeaders: process.env.PRESENTON_API_KEY ? { Authorization: `Bearer ${process.env.PRESENTON_API_KEY}` } : {},
});
const page = await context.newPage();
let currentHtml = '';
await page.route('**/*', async (route) => {
  const url = new URL(route.request().url());
  if (url.origin === base && url.pathname === '/__render') {
    return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: currentHtml });
  }
  if (url.origin === base || url.pathname.startsWith('/__')) {
    const file = localFile(url.pathname);
    if (file) {
      return route.fulfill({ status: 200, body: fs.readFileSync(file),
        contentType: MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    }
  }
  return route.continue();
});

const results = [];
let failures = [];
page.on('response', (r) => { if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`); });
page.on('requestfailed', (r) => failures.push(`failed ${r.url()} (${r.failure()?.errorText})`));

for (const layout of layouts) {
  const boxes = namedBoxes(layout);
  for (const variant of variants) {
    if (variant === 'avatar' && !hasPlaceholder(layout)) continue;
    const ui = variantUi(layout, variant);
    const html = buildHtml(ui);
    const file = path.join(outDir, `${layout.id}__${variant}.png`);
    const entry = { layout: layout.id, variant, png: file, issues: [] };
    if (!html) {
      entry.issues.push('renderer returned no HTML (no components/elements?)');
      results.push(entry);
      continue;
    }
    failures = [];
    currentHtml = html;
    await page.goto(`${base}/__render`, { waitUntil: 'networkidle', timeout: 30000 }).catch((e) => entry.issues.push(`load: ${e.message}`));
    await page.evaluate(() => document.fonts.ready);
    if (html.includes('data-presenton-chart')) await page.waitForTimeout(900);
    if (variant === 'max') {
      // Search for the worst wrap: try every filler rotation of the same length in
      // each filled text box and keep the one that needs the most height.
      await page.evaluate(({ words, filled }) => {
        const make = (n, seed) => {
          let s = '';
          let i = seed % words.length;
          while (s.length < n) {
            const w = words[i++ % words.length];
            s += (s ? ' ' : '') + (s ? w : w[0].toUpperCase() + w.slice(1));
          }
          s = s.slice(0, n);
          return s.endsWith(' ') ? s.slice(0, -1) + 'x' : s;
        };
        const targets = new Set(filled);
        const slide = document.querySelector('[data-template-v2-html-slide]');
        for (const div of slide.querySelectorAll('div')) {
          const span = div.firstElementChild;
          if (!span || span.tagName !== 'SPAN' || !/display:\s*block/.test(span.getAttribute('style') || '')) continue;
          const inner = span.querySelector('span') || span;
          if (!targets.has(inner.textContent)) continue;
          const n = inner.textContent.length;
          let worst = { h: -1, t: inner.textContent };
          for (let k = 0; k < words.length; k++) {
            inner.textContent = make(n, k);
            const h = span.getBoundingClientRect().height;
            if (h > worst.h) worst = { h, t: inner.textContent };
          }
          inner.textContent = worst.t;
        }
      }, { words: WORDS, filled: [...FILLED] });
    }
    const measured = await page.evaluate(() => {
      const slide = document.querySelector('[data-template-v2-html-slide]');
      const sr = slide.getBoundingClientRect();
      const out = { texts: [], images: [], placeholder: null };
      for (const div of slide.querySelectorAll('div')) {
        const span = div.firstElementChild;
        if (!span || span.tagName !== 'SPAN' || !/display:\s*block/.test(span.getAttribute('style') || '')) continue;
        const box = div.getBoundingClientRect();
        // measure the actual ink of the text (inline runs), not the block span
        const range = document.createRange();
        range.selectNodeContents(span);
        const ink = range.getBoundingClientRect();
        const block = span.getBoundingClientRect();
        out.texts.push({
          text: span.textContent.slice(0, 60),
          blockH: block.height,
          box: { x: box.left - sr.left, y: box.top - sr.top, w: box.width, h: box.height },
          ink: { x: ink.left - sr.left, y: ink.top - sr.top, w: ink.width, h: ink.height },
        });
      }
      for (const img of slide.querySelectorAll('img')) {
        const r = img.getBoundingClientRect();
        const src = img.getAttribute('src') || '';
        const rec = { src, ok: img.complete && img.naturalWidth > 0, box: { x: r.left - sr.left, y: r.top - sr.top, w: r.width, h: r.height } };
        out.images.push(rec);
        if (/video-placeholder|__presenter/.test(src)) out.placeholder = rec.box;
      }
      // mask-rendered (tinted / icon) images
      for (const el of slide.querySelectorAll('[style*="mask"]')) {
        const m = (el.getAttribute('style') || '').match(/mask(?:-image)?:\s*url\(["']?([^"')]+)/);
        if (m) out.images.push({ src: m[1], ok: null, box: null });
      }
      return out;
    });

    const findName = (b) => boxes.find((n) => Math.abs(n.x - b.x) < 2 && Math.abs(n.y - b.y) < 2 && Math.abs(n.w - b.w) < 2)?.name;
    for (const t of measured.texts) {
      const label = `${findName(t.box) ?? 'text'} "${t.text.slice(0, 32)}${t.text.length > 32 ? '…' : ''}" @(${t.box.x.toFixed(0)},${t.box.y.toFixed(0)})`;
      // block height = lines x line-height (what the layout reserved space for)
      if (t.blockH > t.box.h + Math.max(4, t.box.h * 0.06)) entry.issues.push(`overflow: ${label} needs ${t.blockH.toFixed(0)}px, box is ${t.box.h.toFixed(0)}px`);
      if (t.ink.w > t.box.w + Math.max(6, t.box.w * 0.02)) entry.issues.push(`overflow-x: ${label} ink ${t.ink.w.toFixed(0)}px wider than box ${t.box.w.toFixed(0)}px`);
      if (t.ink.h > 0 && (t.ink.x < -1 || t.ink.y < -1 || t.ink.x + t.ink.w > 1281 || t.ink.y + t.ink.h > 721)) {
        entry.issues.push(`off-stage: ${label} ink leaves the 1280x720 slide`);
      }
      const p = measured.placeholder;
      if (p && t.ink.h > 0) {
        const ow = Math.min(p.x + p.w, t.ink.x + t.ink.w) - Math.max(p.x, t.ink.x);
        const oh = Math.min(p.y + p.h, t.ink.y + t.ink.h) - Math.max(p.y, t.ink.y);
        if (ow > 4 && oh > 4) entry.issues.push(`covers presenter: ${label} overlaps the avatar slot by ${ow.toFixed(0)}x${oh.toFixed(0)}px`);
      }
    }
    for (const img of measured.images) if (img.ok === false) entry.issues.push(`broken image: ${img.src}`);
    // Google Fonts CSS is also referenced as a font src by the app's theme CSS; ignore that noise.
    for (const f of new Set(failures)) if (!/fonts\.(googleapis|gstatic)\.com/.test(f)) entry.issues.push(`asset: ${f}`);

    const slide = await page.$('[data-template-v2-html-slide]');
    await (slide ?? page).screenshot({ path: file });
    results.push(entry);
  }
}

// ------------------------------------------------------------------ contact sheet
const cells = results.filter((r) => fs.existsSync(r.png)).map((r) => {
  const b64 = fs.readFileSync(r.png).toString('base64');
  const bad = r.issues.length ? `<b style="color:#c62828"> · ${r.issues.length} issue(s)</b>` : '<b style="color:#2e7d32"> · ok</b>';
  return `<figure><img src="data:image/png;base64,${b64}"><figcaption>${r.layout} · ${r.variant}${bad}</figcaption></figure>`;
});
const cols = Math.min(3, Math.max(1, variants.length));
const sheet = `<!doctype html><html><head><style>
body{margin:0;padding:16px;background:#eef1f5;font:13px system-ui,sans-serif;color:#223}
main{display:grid;grid-template-columns:repeat(${cols},480px);gap:14px}
figure{margin:0;background:#fff;border-radius:6px;padding:6px;box-shadow:0 1px 3px #0002}
img{width:468px;height:263px;display:block;border:1px solid #dde}
figcaption{padding:5px 2px 1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
</style></head><body><main>${cells.join('')}</main></body></html>`;
await page.setViewportSize({ width: cols * 494 + 32, height: 400 });
await page.setContent(sheet);
const sheetPath = path.join(outDir, 'contact-sheet.png');
await page.screenshot({ path: sheetPath, fullPage: true });

await browser.close();
await vite.close();

fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify({ template: templateFile, base, results }, null, 2));
let problems = 0;
for (const r of results) {
  problems += r.issues.length;
  console.log(`${r.issues.length ? '✗' : '✓'} ${r.layout} [${r.variant}] ${path.basename(r.png)}`);
  for (const i of r.issues.slice(0, 12)) console.log(`    - ${i}`);
  if (r.issues.length > 12) console.log(`    … ${r.issues.length - 12} more in report.json`);
}
console.log(`\n${results.length} render(s), ${problems} issue(s). Contact sheet: ${sheetPath}`);
process.exit(problems ? 1 : 0);
