import { cn } from "@/lib/utils";
import type { AvatarChip } from "../utils/avatarGeneration";

export const CHIP_LABEL: Record<AvatarChip, string> = {
  ready: "Ready",
  no_audio: "No audio",
  audio_stale: "Audio stale",
  up_to_date: "Up to date",
  unsupported_audio: "Audio format",
  no_placeholder: "No placeholder",
  generating: "Generating",
  failed: "Failed",
  done: "Generated",
};

export const CHIP_REASON: Partial<Record<AvatarChip, string>> = {
  no_audio: "Generate this slide's narration audio first.",
  audio_stale: "The note changed since the audio was made. Regenerate the audio first.",
  unsupported_audio: "The narration audio is in a format that cannot be used.",
  no_placeholder: "This slide has no avatar placeholder.",
};

const TONE: Record<AvatarChip, string> = {
  ready: "bg-[#ECFDF3] text-[#067647]",
  up_to_date: "bg-[#F2F4F7] text-[#475467]",
  done: "bg-[#ECFDF3] text-[#067647]",
  generating: "bg-[#F4F3FF] text-[#5925DC]",
  failed: "bg-[#FEF3F2] text-[#B42318]",
  no_audio: "bg-[#FFFAEB] text-[#B54708]",
  audio_stale: "bg-[#FFFAEB] text-[#B54708]",
  unsupported_audio: "bg-[#FFFAEB] text-[#B54708]",
  no_placeholder: "bg-[#F2F4F7] text-[#475467]",
};

export function AvatarChipBadge({
  chip,
  className,
}: {
  chip: AvatarChip;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-medium",
        TONE[chip],
        className,
      )}
    >
      {CHIP_LABEL[chip]}
    </span>
  );
}
