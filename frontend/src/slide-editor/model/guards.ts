// Ported from servers/nextjs/components/slide-editor/layout/LayoutToolbar.tsx, layout/InfographicToolbarControls.tsx and state/state.ts. Changes: guards and types extracted verbatim from the React files.
import type { SlideElement } from "@/render/legacy/components/slide-editor/types";
import { isFlowLayoutElement } from "@/render/legacy/components/slide-editor/layout/flowLayout";

type RawRecord = Record<string, unknown>;
type LayoutElementType =
  | "container"
  | "flex"
  | "grid"
  | "group"
  | "list-view"
  | "grid-view";

export type TableSlideElement = Extract<SlideElement, { type: "table" }>;
export type ChartSlideElement = Extract<SlideElement, { type: "chart" }>;

export type TemplateV2InfographicToolbarElement = RawRecord & {
  type: "infographic";
  text_color?: string | null;
};

export type TemplateV2LayoutElement = RawRecord & {
  type: LayoutElementType;
};

export type TemplateV2ToolbarElement =
  | TemplateV2LayoutElement
  | TemplateV2InfographicToolbarElement
  | ChartSlideElement
  | TableSlideElement;

export function isTemplateV2InfographicToolbarElement(
  element: RawRecord | null | undefined,
): element is TemplateV2InfographicToolbarElement {
  return element?.type === "infographic";
}

export function isTemplateV2LayoutElement(
  element: RawRecord | TemplateV2ToolbarElement | null | undefined,
): element is TemplateV2LayoutElement {
  return (
    element?.type === "container" ||
    isTemplateV2FlowLayoutElement(element)
  );
}

export function isTemplateV2FlowLayoutElement(
  element: RawRecord | TemplateV2ToolbarElement | null | undefined,
): element is TemplateV2LayoutElement {
  return (
    element?.type === "flex" ||
    element?.type === "grid" ||
    element?.type === "list-view" ||
    element?.type === "grid-view" ||
    Boolean(element && isFlowLayoutElement(element as RawRecord))
  );
}

export function isTemplateV2GroupElement(
  element: RawRecord | TemplateV2ToolbarElement | null | undefined,
): element is TemplateV2LayoutElement {
  return element?.type === "group";
}
