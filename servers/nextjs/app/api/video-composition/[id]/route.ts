import { NextRequest, NextResponse } from "next/server";

import {
  hasTemplateV2RenderableUi,
  templateV2AnimationTargets,
  templateV2ChartScripts,
  templateV2UiHasChart,
  templateV2UiToHtmlFragment,
  TEMPLATE_V2_HTML_HEIGHT,
  TEMPLATE_V2_HTML_WIDTH,
} from "@/lib/template-v2-json-to-html";

/**
 * Template-v2 slides as standalone HTML fragments, for the animated video
 * render. The HTML is produced by the same generator the PDF export uses, so
 * the last frame of every slide's entrance animation is the slide exactly as
 * it exports. Every top-level element is wrapped in a `data-hf-el` layer and
 * described in `elements`, which is what the animation plan targets.
 *
 * Slides without a renderable `ui` come back with `html: null`; the video
 * service renders those as still frames instead.
 */

function getFastApiBaseUrl(): string {
  const internal = process.env.FAST_API_INTERNAL_URL?.trim();
  if (internal) {
    return internal.replace(/\/+$/, "");
  }

  const configured = process.env.NEXT_PUBLIC_FAST_API?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  return "http://127.0.0.1:8000";
}

type PresentationPayload = {
  fonts?: unknown;
  slides?: Array<Record<string, unknown>>;
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json(
      { detail: "Missing presentation id" },
      { status: 400 }
    );
  }

  // Authorization is FastAPI's: the caller's cookie is forwarded as-is, and
  // without one the presentation fetch is only allowed when auth is off.
  const exportCookie = request.headers.get("x-export-cookie")?.trim();

  let presentation: PresentationPayload;
  try {
    const response = await fetch(
      `${getFastApiBaseUrl()}/api/v1/ppt/presentation/${id}`,
      {
        method: "GET",
        headers: exportCookie ? { Cookie: exportCookie } : {},
        cache: "no-store",
      }
    );
    if (!response.ok) {
      return new NextResponse(await response.text(), {
        status: response.status,
        headers: {
          "Content-Type":
            response.headers.get("content-type") ?? "application/json",
          "Cache-Control": "no-store",
        },
      });
    }
    presentation = (await response.json()) as PresentationPayload;
  } catch (error) {
    console.error("[video-composition] Failed to fetch presentation", error);
    return NextResponse.json(
      { detail: "Failed to fetch presentation data" },
      { status: 500 }
    );
  }

  const slides = [...(presentation.slides ?? [])].sort(
    (a, b) => Number(a.index ?? 0) - Number(b.index ?? 0)
  );
  let hasChart = false;
  const renderedSlides = slides.map((slide) => {
    const ui = slide.ui;
    const html = hasTemplateV2RenderableUi(ui)
      ? templateV2UiToHtmlFragment(ui, {
          fonts: presentation.fonts,
          annotateElements: true,
        })
      : null;
    if (html && templateV2UiHasChart(ui)) hasChart = true;
    return {
      id: slide.id ?? null,
      index: slide.index ?? null,
      html,
      elements: html ? templateV2AnimationTargets(ui) : [],
    };
  });

  return NextResponse.json(
    {
      width: TEMPLATE_V2_HTML_WIDTH,
      height: TEMPLATE_V2_HTML_HEIGHT,
      chart_scripts: hasChart ? templateV2ChartScripts() : null,
      slides: renderedSlides,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
