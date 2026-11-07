export * from "./model";
export {
  createTemplateV2ClipboardPayload,
  pasteTemplateV2ClipboardPayload,
} from "./clipboard";
export type {
  TemplateV2ClipboardPayload,
  TemplateV2ClipboardSelection,
} from "./clipboard";
export {
  groupTemplateV2ComponentsInUi,
  isTemplateV2GroupShortcut,
} from "./template-v2-group";
export {
  canUngroupTemplateV2Component,
  ungroupTemplateV2ComponentInUi,
} from "./template-v2-ungroup";
export { createAlignmentSnapTargets, snapBoxToAlignmentGuides } from "./alignmentGuides";
export type {
  AlignmentGuide,
  AlignmentSnapResult,
  AlignmentSnapTargets,
} from "./alignmentGuides";
export {
  getTemplateV2SelectionToolbarTarget,
  getTemplateV2SelectionChartToolbarTarget,
  getTemplateV2SelectionTableToolbarTarget,
  getTemplateV2SelectionEditorToolbarTarget,
} from "./toolbarTarget";
export * from "./toolbarTypes";
export * from "./guards";
export * from "./events-types";
export * from "./layoutResize";
export * from "./layoutToolbarTarget";
// Text-run converters and inline-edit helpers are already ported; re-export, never duplicate.
export * from "@/render/legacy/components/slide-editor/text/text-runs";
export * from "@/render/legacy/components/slide-editor/text/template-v2-text-editing";
