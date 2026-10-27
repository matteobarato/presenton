import { createContext } from "react";
import type { SlideVideoPending } from "@/store/slices/slideVideos";

export type SlideVideoRenderState = {
  // Null when the slide has a placeholder but no video, e.g. after the slide
  // was duplicated.
  url: string | null;
  pending: SlideVideoPending | null;
};

// Set only while a slide is edited. Without it, a video placeholder renders as
// the plain image it is, whose transparent poster keeps it out of exports.
export const SlideVideoContext = createContext<SlideVideoRenderState | null>(
  null,
);
