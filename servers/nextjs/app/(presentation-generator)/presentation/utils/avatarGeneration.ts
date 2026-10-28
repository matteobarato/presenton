import type { AvatarSlidePlan } from "../../services/api/slide-videos";

export type AvatarChip =
  | "ready"
  | "no_audio"
  | "no_placeholder"
  | "audio_stale"
  | "up_to_date"
  | "unsupported_audio"
  | "generating"
  | "failed"
  | "done";

// What a slide's chip shows: the running or finished task wins over the
// preview of what a new run would do.
export function chipFor(
  plan?: AvatarSlidePlan,
  preview?: AvatarSlidePlan,
): AvatarChip {
  if (plan) {
    if (plan.state === "queued" || plan.state === "generating") return "generating";
    if (plan.state === "done") return "done";
    if (plan.state === "failed") return "failed";
  }
  const skipped =
    plan?.state === "skipped" ? plan : preview?.state === "skipped" ? preview : undefined;
  if (skipped) {
    switch (skipped.reason) {
      case "no_audio":
        return "no_audio";
      case "audio_stale":
        return "audio_stale";
      case "up_to_date":
        return "up_to_date";
      case "unsupported_audio_format":
        return "unsupported_audio";
      case "no_placeholder":
      case "placeholder_removed":
        return "no_placeholder";
    }
  }
  return "ready";
}

export function generateDisabledReason({
  generationAvailable,
  hasPortrait,
  preview,
  running,
}: {
  generationAvailable: boolean;
  hasPortrait: boolean;
  preview?: AvatarSlidePlan;
  running: boolean;
}): string | null {
  if (!generationAvailable) {
    return "Set ELEVENLABS_API_KEY on the server to generate avatars.";
  }
  if (!hasPortrait) return "Upload a presenter portrait first.";
  const chip = chipFor(undefined, preview);
  if (chip === "no_placeholder") {
    return "Add an avatar placeholder to this slide first.";
  }
  if (chip === "no_audio") return "Generate this slide's narration audio first.";
  if (chip === "audio_stale") {
    return "The note changed since the audio was made. Regenerate the audio first.";
  }
  if (running) return "An avatar generation is already running.";
  return null;
}

// Ids of slides that are done in `next` and were not in `prev`.
export function newlyDone(
  prev: AvatarSlidePlan[] | undefined,
  next: AvatarSlidePlan[] | undefined,
): string[] {
  const before = new Set(
    (prev ?? []).filter((s) => s.state === "done").map((s) => s.slide_id),
  );
  return (next ?? [])
    .filter((s) => s.state === "done" && !before.has(s.slide_id))
    .map((s) => s.slide_id);
}

const FAILURE_LABELS: Record<string, string> = {
  timeout: "Timed out",
  model_error: "Model error",
  moderated: "Rejected by moderation",
  invalid_parameters: "Invalid parameters",
  dependency_failed: "A dependency failed",
  charging_failed: "Charging failed",
  internal_error: "Internal error",
  invalid_output: "Invalid video returned",
  configuration: "ElevenLabs is not configured",
  request_error: "Request failed",
  audio_error: "Narration audio could not be read",
  unknown: "Unknown error",
  no_placeholder: "No video placeholder",
  no_audio: "No narration audio",
  audio_stale: "Narration audio is out of date",
  unsupported_audio_format: "Unsupported audio format",
  up_to_date: "Already up to date",
  placeholder_removed: "Placeholder was removed",
};

export function failureLabel(reason: string): string {
  return FAILURE_LABELS[reason] ?? reason;
}
