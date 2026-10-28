"use client";

import React, { useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import {
  AlertTriangle,
  Loader2,
  Replace,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { RootState } from "@/store/store";
import { resolveBackendAssetUrl } from "@/utils/api";
import { hasTemplateV2SlideUi } from "../../_shared/blank-slide";
import { findVideoPlaceholder } from "@/components/slide-editor/video/video-placeholder";
import {
  SLIDE_VIDEO_ACCEPT,
  type SlideVideo,
  type SlideVideoStaleReason,
} from "../../services/api/slide-videos";
import { useAvatarGeneration, useSlideVideo } from "../hooks/useSlideVideo";
import {
  chipFor,
  generateDisabledReason,
} from "../utils/avatarGeneration";
import { AvatarChipBadge } from "./AvatarChipBadge";
import { GenerationSummaryCard } from "./GenerationSummaryCard";
import { GenerateAvatarsDialog } from "./GenerateAvatarsDialog";
import { PortraitBlock } from "./PortraitBlock";

type PanelSlide = { id?: unknown; ui?: unknown; html_content?: unknown };

function readSlides(presentationData: unknown): PanelSlide[] {
  const slides = (presentationData as { slides?: unknown } | null | undefined)
    ?.slides;
  return Array.isArray(slides) ? (slides as PanelSlide[]) : [];
}

function formatDuration(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds)) return null;
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function formatSize(bytes: number | null | undefined) {
  if (bytes == null) return null;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const STALE_WARNING: Record<SlideVideoStaleReason, string> = {
  note_changed:
    "The speaker note changed after this video was uploaded, so the avatar may not say what the note says.",
  audio_regenerated:
    "The narration audio was regenerated after this video was uploaded, so the lips may not match the voice.",
};

const STALE_BADGE: Record<SlideVideoStaleReason, string> = {
  note_changed: "Note changed",
  audio_regenerated: "Audio changed",
};

// A server that predates `stale_reason` only ever flagged a changed note.
function staleReasonOf(video: SlideVideo): SlideVideoStaleReason {
  return video.stale_reason ?? "note_changed";
}

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <h4 className="mb-2 text-[10px] font-normal uppercase leading-[15px] tracking-[0.367px] text-[#99A1AF]">
    {children}
  </h4>
);

const Note = ({ children }: { children: React.ReactNode }) => (
  <p className="rounded-[8px] border border-dashed border-[#D0D5DD] bg-[#F9FAFB] p-4 text-[11px] leading-4 text-[#667085]">
    {children}
  </p>
);

const secondaryButtonClass =
  "flex h-9 flex-1 items-center justify-center gap-2 rounded-[8px] border border-[#EDEEF0] bg-white px-3 text-[12px] font-medium text-[#101323] transition hover:border-[#B9A8FA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7A5AF8]/40 disabled:cursor-not-allowed disabled:opacity-50";

export function VideosPanel({
  currentSlide,
  disabled = false,
  presentationData,
  presentationId,
}: {
  currentSlide?: number;
  disabled?: boolean;
  presentationData?: unknown;
  presentationId: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const slides = readSlides(presentationData);
  const slide =
    typeof currentSlide === "number" ? (slides[currentSlide] ?? null) : null;
  const slideId = typeof slide?.id === "string" ? slide.id : null;
  const canHoldVideo =
    Boolean(slide) &&
    hasTemplateV2SlideUi(slide) &&
    !(typeof slide?.html_content === "string" && slide.html_content.trim());
  const { video, pending, upload, remove, addPlaceholder, removePlaceholder } =
    useSlideVideo(presentationId, slideId);
  const videosBySlideId = useSelector(
    (state: RootState) => state.slideVideos.bySlideId,
  );
  const hasPlaceholder = Boolean(slide && findVideoPlaceholder(slide.ui));
  const placeholderKey = slides
    .map((s) => (findVideoPlaceholder(s.ui) ? "1" : "0"))
    .join("");
  const videosKey = Object.values(videosBySlideId)
    .map((v) => `${v.id}:${v.updated_at}`)
    .join(",");
  const avatars = useAvatarGeneration(
    presentationId,
    `${placeholderKey}|${videosKey}`,
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const previewById = useMemo(
    () => new Map((avatars.preview?.slides ?? []).map((p) => [p.slide_id, p])),
    [avatars.preview],
  );
  const planById = useMemo(
    () =>
      new Map(
        (avatars.generation?.data?.slides ?? []).map((p) => [p.slide_id, p]),
      ),
    [avatars.generation],
  );
  const slideChip = slideId
    ? chipFor(avatars.running ? planById.get(slideId) : undefined, previewById.get(slideId))
    : "ready";
  const generating = avatars.running && slideChip === "generating";
  const generateBlocked = generateDisabledReason({
    generationAvailable: avatars.generationAvailable,
    hasPortrait: Boolean(avatars.portrait),
    preview: slideId ? previewById.get(slideId) : undefined,
    running: avatars.running,
  });
  const languages = useMemo(() => {
    const codes = new Set<string>();
    for (const v of Object.values(videosBySlideId)) {
      if (v.language) codes.add(v.language);
    }
    if (avatars.preview?.language) codes.add(avatars.preview.language);
    return [...codes];
  }, [videosBySlideId, avatars.preview]);
  const slideTitle = (index: number) => {
    const content = (slides[index] as { content?: { title?: unknown } } | undefined)
      ?.content;
    return typeof content?.title === "string" ? content.title : null;
  };
  const deckRows = slides.flatMap((deckSlide, index) => {
    if (typeof deckSlide.id !== "string") return [];
    const deckVideo = videosBySlideId[deckSlide.id];
    const preview = previewById.get(deckSlide.id);
    if (!deckVideo && !preview) return [];
    const plan = planById.get(deckSlide.id);
    const chip = chipFor(
      avatars.running || plan?.state === "failed" ? plan : undefined,
      preview,
    );
    return [{ index, slideId: deckSlide.id, video: deckVideo, chip }];
  });
  const busy = disabled || pending !== null;

  const chooseFile = () => {
    if (!busy) inputRef.current?.click();
  };

  const handleDrop = (event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file && !busy) void upload(file);
  };

  const scrollToSlide = (index: number) => {
    document.getElementById(`slide-${index}`)?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  };

  let slideSection: React.ReactNode;
  if (!slide || !slideId) {
    slideSection = <Note>Select a slide to give it an avatar video.</Note>;
  } else if (!canHoldVideo) {
    slideSection = (
      <Note>Avatar videos can be added to template slides only.</Note>
    );
  } else if (video) {
    const details = [
      formatDuration(video.duration_seconds),
      video.width && video.height ? `${video.width}×${video.height}` : null,
      formatSize(video.size_bytes),
    ].filter(Boolean);
    slideSection = (
      <div className="space-y-3">
        <video
          key={video.url}
          src={resolveBackendAssetUrl(video.url)}
          controls
          preload="metadata"
          className="aspect-video w-full rounded-[10px] bg-[#101323] object-contain"
        />
        <div className="min-w-0">
          <p
            className="truncate text-[12px] font-medium leading-4 text-[#101323]"
            title={video.original_filename ?? undefined}
          >
            {video.original_filename || "Avatar video"}
            <span className="ml-2 rounded-full bg-[#F2F4F7] px-2 py-0.5 align-middle text-[10px] font-medium text-[#475467]">
              {video.source === "elevenlabs" ? "Generated" : "Uploaded"}
            </span>
          </p>
          {details.length > 0 && (
            <p className="mt-0.5 text-[11px] leading-4 text-[#667085]">
              {details.join(" · ")}
            </p>
          )}
        </div>
        {video.stale && (
          <p className="flex gap-2 rounded-[8px] border border-[#FEDF89] bg-[#FFFCF5] p-3 text-[11px] leading-4 text-[#93370D]">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
            {STALE_WARNING[staleReasonOf(video)]}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={chooseFile}
            className={secondaryButtonClass}
          >
            {pending === "uploading" ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Replace className="h-4 w-4" strokeWidth={1.7} aria-hidden />
            )}
            {pending === "uploading" ? "Uploading..." : "Replace"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void remove()}
            className={cn(
              secondaryButtonClass,
              "text-[#B42318] hover:border-[#FDA29B]",
            )}
          >
            {pending === "removing" ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Trash2 className="h-4 w-4" strokeWidth={1.7} aria-hidden />
            )}
            {pending === "removing" ? "Removing..." : "Remove"}
          </button>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy || generateBlocked !== null}
            title={generateBlocked ?? undefined}
            onClick={() => void avatars.generate([slideId], true)}
            className={secondaryButtonClass}
          >
            <Sparkles className="h-4 w-4" strokeWidth={1.7} aria-hidden />
            Regenerate
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void removePlaceholder()}
            className={secondaryButtonClass}
          >
            Remove placeholder
          </button>
        </div>
        <p className="text-[11px] leading-4 text-[#667085]">
          Move or resize the outlined box on the slide to choose where the
          video plays.
        </p>
      </div>
    );
  } else if (generating) {
    slideSection = (
      <p className="flex items-center gap-2 rounded-[8px] border border-[#E9D7FE] bg-[#FAF8FF] p-4 text-[11px] leading-4 text-[#5925DC]">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
        Generating… this takes a few minutes
      </p>
    );
  } else {
    slideSection = (
      <button
        type="button"
        disabled={busy}
        onClick={chooseFile}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "flex w-full flex-col items-center gap-2 rounded-[10px] border border-dashed bg-white px-4 py-7 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7A5AF8]/40 disabled:cursor-not-allowed disabled:opacity-60",
          isDragging
            ? "border-[#7A5AF8] bg-[#FAF8FF]"
            : "border-[#D0D5DD] hover:border-[#B9A8FA]",
        )}
      >
        {pending === "uploading" ? (
          <Loader2 className="h-5 w-5 animate-spin text-[#7A5AF8]" aria-hidden />
        ) : (
          <Upload className="h-5 w-5 text-[#7A5AF8]" strokeWidth={1.7} aria-hidden />
        )}
        <span className="text-[12px] font-medium leading-4 text-[#101323]">
          {pending === "uploading" ? "Uploading video..." : "Upload avatar video"}
        </span>
        <span className="text-[11px] leading-4 text-[#667085]">
          MP4 or WebM, lip-synced to this slide&apos;s narration. Drop a file
          or click to choose.
        </span>
      </button>
    );
    slideSection = (
      <div className="space-y-3">
        {slideSection}
        {hasPlaceholder ? (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || generateBlocked !== null}
              title={generateBlocked ?? undefined}
              onClick={() => void avatars.generate([slideId], false)}
              className={secondaryButtonClass}
            >
              <Sparkles className="h-4 w-4" strokeWidth={1.7} aria-hidden />
              Generate
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void removePlaceholder()}
              className={secondaryButtonClass}
            >
              Remove placeholder
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => void addPlaceholder()}
              className={secondaryButtonClass.replace("flex-1", "w-full")}
            >
              Add avatar placeholder
            </button>
            <p className="text-[11px] leading-4 text-[#667085]">
              Without a placeholder, this slide is narrated by the voice
              bubble.
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-[clamp(14px,1.4vw,20px)] pb-[clamp(24px,2.2vw,32px)] pt-[clamp(24px,2.2vw,32px)] hide-scrollbar">
      <h3 className="mb-2 text-[clamp(13px,0.95vw,15px)] font-semibold leading-5 text-[#101323]">
        Videos
      </h3>
      <p className="mb-[clamp(20px,1.8vw,28px)] text-[11px] leading-4 text-[#667085]">
        During narrated playback the presenter is a voice bubble. On a slide
        with a video, it plays the video instead.
      </p>
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

      <section className="mb-7">
        <SectionLabel>Presenter portrait</SectionLabel>
        <PortraitBlock
          portrait={avatars.portrait}
          pending={avatars.portraitPending}
          disabled={disabled}
          onUpload={(file) => void avatars.uploadPortrait(file)}
          onRemove={() => void avatars.removePortrait()}
        />
      </section>

      <section>
        <SectionLabel>
          {typeof currentSlide === "number" && slide
            ? `Slide ${currentSlide + 1}`
            : "This slide"}
        </SectionLabel>
        {slideSection}
      </section>

      {avatars.summary && (
        <GenerationSummaryCard
          summary={avatars.summary}
          onDismiss={avatars.dismissSummary}
        />
      )}

      <section className="mt-7">
        <button
          type="button"
          disabled={disabled || avatars.running}
          title={
            avatars.running ? "An avatar generation is already running." : undefined
          }
          onClick={() => setDialogOpen(true)}
          className={cn(secondaryButtonClass, "w-full flex-none")}
        >
          <Sparkles className="h-4 w-4" strokeWidth={1.7} aria-hidden />
          Generate avatars…
        </button>
      </section>
      <GenerateAvatarsDialog
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
        preview={avatars.preview}
        videosBySlideId={videosBySlideId}
        slideTitle={slideTitle}
        languages={languages}
        language={avatars.language}
        onLanguageChange={avatars.setLanguage}
        blockedReason={generateDisabledReason({
          generationAvailable: avatars.generationAvailable,
          hasPortrait: Boolean(avatars.portrait),
          running: avatars.running,
        })}
        onGenerate={(ids, force) => void avatars.generate(ids, force)}
      />

      {deckRows.length > 0 && (
        <section className="mt-7">
          <SectionLabel>In this deck</SectionLabel>
          <ul className="space-y-1.5">
            {deckRows.map(({ index, slideId: rowId, video: deckVideo, chip }) => (
              <li key={rowId}>
                <button
                  type="button"
                  onClick={() => scrollToSlide(index)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-[8px] border px-3 py-2 text-left text-[12px] leading-4 transition hover:border-[#B9A8FA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7A5AF8]/40",
                    index === currentSlide
                      ? "border-[#D6BBFB] bg-[#FAF8FF]"
                      : "border-[#EDEEF0] bg-white",
                  )}
                >
                  <span className="font-medium text-[#101323]">
                    Slide {index + 1}
                  </span>
                  {deckVideo && formatDuration(deckVideo.duration_seconds) && (
                    <span className="text-[#667085]">
                      {formatDuration(deckVideo.duration_seconds)}
                    </span>
                  )}
                  <span className="ml-auto flex items-center gap-1.5">
                    {chip !== "up_to_date" && <AvatarChipBadge chip={chip} />}
                    {deckVideo?.stale && (
                      <span className="rounded-full bg-[#FFFAEB] px-2 py-0.5 text-[10px] font-medium text-[#B54708]">
                        {STALE_BADGE[staleReasonOf(deckVideo)]}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
