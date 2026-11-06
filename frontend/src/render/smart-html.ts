import DOMPurify, { type Config as DOMPurifyConfig } from 'dompurify'
import {
  localFontOptionsFromUnknown,
  renderLocalFontFaceCss,
} from '@/render/legacy/components/slide-editor/text/local-fonts'
import {
  CHART_BROWSER_SCRIPT_URL,
  CHART_DATALABELS_SCRIPT_URL,
} from '@/render/legacy/lib/chart-browser'
import { TAILWIND_BROWSER_SCRIPT_URL } from '@/render/legacy/lib/tailwind-browser'
import { cssVarDeclarations, themeCssVars, themeFontFaceCss } from '@/render/theme'

// Same config as the old SmartHtmlSlide.tsx.
const SANITIZE_CONFIG: DOMPurifyConfig = {
  USE_PROFILES: { html: true, svg: true, svgFilters: true },
  FORBID_TAGS: ['base', 'embed', 'form', 'iframe', 'link', 'meta', 'object', 'script', 'style'],
  FORBID_ATTR: ['autofocus', 'contenteditable', 'srcdoc'],
  ALLOW_DATA_ATTR: true,
}

function fontCss(fonts: unknown, theme: unknown): string {
  const local = localFontOptionsFromUnknown(fonts).map(renderLocalFontFaceCss).join('')
  return (local + themeFontFaceCss(theme)).replaceAll('</style', '<\\/style')
}

/**
 * The old hook re-ran every script. Here only scripts that mention Chart are
 * re-run; the backend's normalize_smart_slide_html already strips non-chart
 * scripts, so this is a defensive narrowing.
 */
function chartScripts(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return Array.from(doc.querySelectorAll('script'))
    .map((script) => script.textContent?.trim() ?? '')
    .filter((code) => code !== '' && /\bChart\b/.test(code))
}

// Runs inside the sandboxed iframe. `document` is a view that reports
// readyState "complete" and replays DOMContentLoaded listeners, like the old
// scoped-document wrapper did.
const CHART_RUNNER = `
(function () {
  var sources = __SOURCES__;
  if (!sources.length) return;
  function run() {
    if (!window.Chart) return;
    if (window.ChartDataLabels) window.Chart.register(window.ChartDataLabels);
    var real = document;
    var scoped = new Proxy(real, {
      get: function (target, key) {
        if (key === 'readyState') return 'complete';
        if (key === 'addEventListener') {
          return function (type, listener, options) {
            if (type === 'DOMContentLoaded' && typeof listener === 'function') {
              queueMicrotask(function () { listener.call(real, new Event('DOMContentLoaded')); });
              return;
            }
            return real.addEventListener(type, listener, options);
          };
        }
        var value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      }
    });
    sources.forEach(function (code) {
      try {
        new Function('document', 'Chart', 'ChartDataLabels', code)(scoped, window.Chart, window.ChartDataLabels);
      } catch (error) {
        console.error('Smart slide chart failed to render', error);
      }
    });
    requestAnimationFrame(function () {
      document.querySelectorAll('canvas').forEach(function (canvas) {
        var chart = window.Chart.getChart(canvas);
        if (!chart) return;
        chart.update('none');
        canvas.dataset.presentonChartRendered = 'true';
      });
    });
  }
  if (document.readyState === 'complete') run();
  else window.addEventListener('load', run);
})();
`

function embedJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

export function buildSmartSrcdoc(html: string, opts: { fonts?: unknown; theme?: unknown } = {}): string {
  const body = DOMPurify.sanitize(html, SANITIZE_CONFIG) as string
  const vars = cssVarDeclarations(themeCssVars(opts.theme))
  const runner = CHART_RUNNER.replace('__SOURCES__', () => embedJson(chartScripts(html)))
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=1280, initial-scale=1">
<style>${fontCss(opts.fonts, opts.theme)}</style>
<script src="${TAILWIND_BROWSER_SCRIPT_URL}"></script>
<script src="${CHART_BROWSER_SCRIPT_URL}"></script>
<script src="${CHART_DATALABELS_SCRIPT_URL}"></script>
<style>
:root{${vars}}
html,body{width:1280px;height:720px;min-width:1280px;min-height:720px;margin:0;overflow:hidden;background:#fff}
*{box-sizing:border-box}
</style>
</head>
<body>${body}<script>${runner}</script></body>
</html>`
}
