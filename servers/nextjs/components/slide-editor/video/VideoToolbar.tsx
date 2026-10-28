"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Replace, Scan, Trash2, Upload } from "lucide-react";
import {
  FloatingToolbar,
  type FloatingToolbarBox,
} from "@/components/slide-editor/toolbar/FloatingToolbar";
import {
  averageBorderRadius,
  uniformBorderRadius,
} from "@/components/slide-editor/model/element-model";
import {
  ComponentActionsMenu,
  type ComponentActionsMenuActions,
} from "@/components/slide-editor/selection/ComponentActionsMenu";
import { SLIDE_VIDEO_ACCEPT } from "@/app/(presentation-generator)/services/api/slide-videos";
import { useSlideVideo } from "@/app/(presentation-generator)/presentation/hooks/useSlideVideo";

// Shown in place of the image toolbar when the selected element is the slide's
// video placeholder: its poster is not meant to be swapped or cropped. Its
// component is layered like any other, through the same actions menu.
export function VideoToolbar({
  anchorBox,
  componentActions,
  element,
  onElementChange,
  presentationId,
  slideId,
}: {
  anchorBox: FloatingToolbarBox;
  componentActions?: ComponentActionsMenuActions | null;
  element: { size?: { width?: number; height?: number } | null; border_radius?: unknown };
  onElementChange: (patch: { border_radius: ReturnType<typeof uniformBorderRadius> }) => void;
  presentationId?: string;
  slideId?: string | number | null;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { video, pending, upload, remove } = useSlideVideo(
    presentationId,
    slideId,
  );
  const busy = pending !== null;
  const [radiusOpen, setRadiusOpen] = useState(false);
  const maxRadius = Math.max(
    0.01,
    Math.min(element.size?.width ?? 1, element.size?.height ?? 1) / 2,
  );
  const radius = Math.min(
    maxRadius,
    averageBorderRadius(element.border_radius as never),
  );
  const [radiusDraft, setRadiusDraft] = useState(radius);
  useEffect(() => setRadiusDraft(radius), [radius]);
  const commitRadius = (value: number) => {
    const next = Math.min(maxRadius, Math.max(0, value));
    setRadiusDraft(next);
    onElementChange({ border_radius: uniformBorderRadius(next) });
  };

  return (
    <FloatingToolbar
      anchorBox={anchorBox}
      fallbackWidth={260}
      inlineEditIgnore
      className="inline-flex items-center gap-2 rounded-[6px] bg-white px-[10px] py-[6px] font-syne text-[#191919] shadow-[0_0_4px_rgba(0,0,0,0.15)]"
    >
      <input
        ref={inputRef}
        type="file"
        accept={SLIDE_VIDEO_ACCEPT}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void upload(file);
        }}
      />
      {busy ? (
        <span className="flex h-8 items-center gap-2 px-2 text-[13px] font-medium text-[#667085]">
          <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          {pending === "uploading" ? "Uploading..." : "Removing..."}
        </span>
      ) : (
        <>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex h-8 items-center gap-2 rounded-[6px] px-2 text-[13px] font-medium hover:bg-[#F6F6F9]"
          >
            {video ? (
              <Replace size={16} strokeWidth={1.7} aria-hidden="true" />
            ) : (
              <Upload size={16} strokeWidth={1.7} aria-hidden="true" />
            )}
            <span>{video ? "Replace video" : "Upload video"}</span>
          </button>
          {video ? (
            <>
              <span aria-hidden="true" className="h-5 w-px bg-[#EDEEEF]" />
              <button
                type="button"
                onClick={() => void remove()}
                className="flex h-8 items-center gap-2 rounded-[6px] px-2 text-[13px] font-medium text-[#B42318] hover:bg-[#FEF3F2]"
              >
                <Trash2 size={16} strokeWidth={1.7} aria-hidden="true" />
                <span>Remove video</span>
              </button>
            </>
          ) : null}
          <span aria-hidden="true" className="h-5 w-px bg-[#EDEEEF]" />
          <div className="relative">
            <button
              type="button"
              title="Video border radius"
              aria-label="Video border radius"
              aria-pressed={radiusOpen}
              onClick={() => setRadiusOpen((open) => !open)}
              className={`flex h-8 items-center rounded-[6px] px-2 hover:bg-[#F6F6F9] ${radiusOpen ? "bg-[#F4F1FF] text-[#7C3AED]" : ""}`}
            >
              <Scan size={16} strokeWidth={1.7} aria-hidden="true" />
            </button>
            {radiusOpen ? (
              <div className="absolute left-1/2 top-[calc(100%+8px)] z-10 box-border w-[220px] -translate-x-1/2 rounded-lg bg-white p-3 shadow-[0_0_4px_rgba(0,0,0,0.16)]">
                <label className="block text-[12px] font-medium text-[#4B5563]">
                  <span className="mb-2 flex items-center justify-between">
                    <span>Border radius</span>
                    <span className="font-medium text-[#191919]">
                      {Number(radiusDraft.toFixed(1))}
                    </span>
                  </span>
                  <input
                    aria-label="Video border radius"
                    type="range"
                    min={0}
                    max={maxRadius}
                    step={Math.max(0.01, maxRadius / 100)}
                    value={radiusDraft}
                    onChange={(event) =>
                      setRadiusDraft(Number(event.currentTarget.value))
                    }
                    onKeyUp={(event) =>
                      commitRadius(Number(event.currentTarget.value))
                    }
                    onPointerUp={(event) =>
                      commitRadius(Number(event.currentTarget.value))
                    }
                    className="w-full cursor-pointer accent-[#7A5AF8]"
                  />
                </label>
              </div>
            ) : null}
          </div>
        </>
      )}
      {componentActions ? (
        <>
          <span aria-hidden="true" className="h-5 w-px bg-[#EDEEEF]" />
          <ComponentActionsMenu actions={componentActions} />
        </>
      ) : null}
    </FloatingToolbar>
  );
}
