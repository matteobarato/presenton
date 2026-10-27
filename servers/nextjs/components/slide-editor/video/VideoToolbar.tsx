"use client";

import { useRef } from "react";
import { Loader2, Replace, Trash2, Upload } from "lucide-react";
import {
  FloatingToolbar,
  type FloatingToolbarBox,
} from "@/components/slide-editor/toolbar/FloatingToolbar";
import { SLIDE_VIDEO_ACCEPT } from "@/app/(presentation-generator)/services/api/slide-videos";
import { useSlideVideo } from "@/app/(presentation-generator)/presentation/hooks/useSlideVideo";

// Shown in place of the image toolbar when the selected element is the slide's
// video placeholder: its poster is not meant to be swapped or cropped.
export function VideoToolbar({
  anchorBox,
  presentationId,
  slideId,
}: {
  anchorBox: FloatingToolbarBox;
  presentationId?: string;
  slideId?: string | number | null;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { video, pending, upload, remove } = useSlideVideo(
    presentationId,
    slideId,
  );
  const busy = pending !== null;

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
        </>
      )}
    </FloatingToolbar>
  );
}
