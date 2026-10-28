"use client";

import React, { useRef } from "react";
import { Loader2, Replace, Trash2, Upload } from "lucide-react";
import { resolveBackendAssetUrl } from "@/utils/api";
import type { PortraitInfo } from "../../services/api/slide-videos";

const PORTRAIT_ACCEPT = "image/png,image/jpeg,image/webp";

const buttonClass =
  "flex h-8 flex-1 items-center justify-center gap-2 rounded-[8px] border border-[#EDEEF0] bg-white px-3 text-[12px] font-medium text-[#101323] transition hover:border-[#B9A8FA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7A5AF8]/40 disabled:cursor-not-allowed disabled:opacity-50";

export function PortraitBlock({
  portrait,
  pending,
  disabled,
  onUpload,
  onRemove,
}: {
  portrait: PortraitInfo | null;
  pending: boolean;
  disabled: boolean;
  onUpload: (file: File) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const busy = pending || disabled;
  const choose = () => {
    if (!busy) inputRef.current?.click();
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={PORTRAIT_ACCEPT}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onUpload(file);
        }}
      />
      {portrait ? (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${resolveBackendAssetUrl(portrait.url)}?v=${encodeURIComponent(portrait.updated_at)}`}
            alt="Presenter portrait"
            className="h-16 w-16 shrink-0 rounded-[10px] bg-[#F9FAFB] object-cover"
          />
          <div className="flex min-w-0 flex-1 gap-2">
            <button type="button" disabled={busy} onClick={choose} className={buttonClass}>
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Replace className="h-4 w-4" strokeWidth={1.7} aria-hidden />
              )}
              Replace
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onRemove}
              className={`${buttonClass} text-[#B42318] hover:border-[#FDA29B]`}
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.7} aria-hidden />
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={choose}
          className="flex w-full flex-col items-center gap-2 rounded-[10px] border border-dashed border-[#D0D5DD] bg-white px-4 py-5 text-center transition hover:border-[#B9A8FA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7A5AF8]/40 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? (
            <Loader2 className="h-5 w-5 animate-spin text-[#7A5AF8]" aria-hidden />
          ) : (
            <Upload className="h-5 w-5 text-[#7A5AF8]" strokeWidth={1.7} aria-hidden />
          )}
          <span className="text-[12px] font-medium leading-4 text-[#101323]">
            Upload presenter portrait
          </span>
        </button>
      )}
      <p className="mt-2 text-[11px] leading-4 text-[#667085]">
        Used to generate lip-synced avatars for every slide.
      </p>
    </div>
  );
}
