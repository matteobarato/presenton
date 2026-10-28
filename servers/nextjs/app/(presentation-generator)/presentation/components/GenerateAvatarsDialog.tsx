"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { AvatarPreview, SlideVideo } from "../../services/api/slide-videos";
import { chipFor } from "../utils/avatarGeneration";
import { AvatarChipBadge, CHIP_REASON } from "./AvatarChipBadge";
import Modal from "./Modal";

export function GenerateAvatarsDialog({
  isOpen,
  onClose,
  preview,
  videosBySlideId,
  slideTitle,
  languages,
  language,
  onLanguageChange,
  blockedReason,
  onGenerate,
}: {
  isOpen: boolean;
  onClose: () => void;
  preview: AvatarPreview | null;
  videosBySlideId: Record<string, SlideVideo>;
  slideTitle: (slideIndex: number) => string | null;
  languages: string[];
  language: string | null;
  onLanguageChange: (language: string | null) => void;
  // Why nothing can be generated at all (no key, no portrait, job running).
  blockedReason: string | null;
  onGenerate: (slideIds: string[], force: boolean) => void;
}) {
  const rows = useMemo(
    () =>
      (preview?.slides ?? []).map((slide) => ({
        slide,
        chip: chipFor(undefined, slide),
      })),
    [preview],
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Pre-tick the ready rows each time the dialog opens or the preview changes.
  useEffect(() => {
    if (!isOpen) return;
    setSelected(
      new Set(
        rows.filter((r) => r.chip === "ready").map((r) => r.slide.slide_id),
      ),
    );
  }, [isOpen, rows]);

  const selectable = (chip: string) => chip === "ready" || chip === "up_to_date";
  const chosen = rows.filter(
    (r) => selectable(r.chip) && selected.has(r.slide.slide_id),
  );
  const force = chosen.some((r) => r.chip === "up_to_date");
  const count = chosen.length;

  const toggle = (slideId: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(slideId)) next.add(slideId);
      return next;
    });

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Generate avatars">
      <div className="space-y-4">
        {languages.length > 1 && (
          <label className="flex items-center gap-2 text-[12px] text-[#101323]">
            Language
            <select
              value={language ?? preview?.language ?? ""}
              onChange={(event) => onLanguageChange(event.target.value || null)}
              className="h-8 rounded-[8px] border border-[#EDEEF0] bg-white px-2 text-[12px]"
            >
              {languages.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>
        )}
        {rows.length === 0 ? (
          <p className="text-[12px] text-[#667085]">
            No slide has an avatar placeholder yet. Add one from the Videos
            panel first.
          </p>
        ) : (
          <ul className="max-h-[50vh] space-y-1.5 overflow-y-auto">
            {rows.map(({ slide, chip }) => {
              const title = slideTitle(slide.slide_index);
              const source = videosBySlideId[slide.slide_id]?.source;
              const reason = CHIP_REASON[chip];
              return (
                <li key={slide.slide_id}>
                  <label
                    title={reason}
                    className="flex items-center gap-3 rounded-[8px] border border-[#EDEEF0] px-3 py-2 text-[12px] has-[:disabled]:opacity-60"
                  >
                    <input
                      type="checkbox"
                      disabled={!selectable(chip)}
                      checked={selectable(chip) && selected.has(slide.slide_id)}
                      onChange={() => toggle(slide.slide_id)}
                    />
                    <span className="min-w-0 flex-1 truncate text-[#101323]">
                      <span className="font-medium">
                        Slide {slide.slide_index + 1}
                      </span>
                      {title ? ` · ${title}` : ""}
                    </span>
                    {chip === "up_to_date" && source && (
                      <span className="text-[10px] text-[#667085]">
                        {source === "elevenlabs" ? "Generated" : "Uploaded"}
                      </span>
                    )}
                    <AvatarChipBadge chip={chip} />
                  </label>
                  {reason && (
                    <p className="px-3 pt-0.5 text-[11px] text-[#667085]">
                      {reason}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {blockedReason && (
          <p className="text-[11px] leading-4 text-[#93370D]">{blockedReason}</p>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-[8px] border border-[#EDEEF0] px-4 text-[12px] font-medium text-[#101323]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={count === 0 || blockedReason !== null}
            onClick={() => {
              onGenerate(
                chosen.map((r) => r.slide.slide_id),
                force,
              );
              onClose();
            }}
            className="h-9 rounded-[8px] bg-[#7A5AF8] px-4 text-[12px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {`Generate ${count} avatar${count === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
