// Ported from servers/nextjs/components/slide-editor/events/events.ts and importing/template-v2-import.ts. Changes: type declarations only (no event constants, no DOM wiring).
export type TemplateV2Layout = {
  id?: unknown;
  description?: unknown;
  elements?: unknown;
  components?: unknown;
};

export type TemplateV2SingleSurfaceSelection = {
  kind: "component" | "element";
  slideIndex?: number | null;
  componentIndex?: number;
  componentId?: string;
  componentLabel?: string;
  elementPath?: string;
  elementType?: string;
  elementName?: string;
  targetLabel?: string;
};

export type TemplateV2MultiSurfaceSelection = {
  kind: "multi-component";
  slideIndex?: number | null;
  components: TemplateV2SingleSurfaceSelection[];
  componentIds?: string[];
  componentLabels?: string[];
  targetLabel?: string;
};

export type TemplateV2SurfaceSelectedDetail = {
  slideId?: string | number | null;
  slideIndex?: number | null;
  selection?: TemplateV2SingleSurfaceSelection | TemplateV2MultiSurfaceSelection | null;
};
