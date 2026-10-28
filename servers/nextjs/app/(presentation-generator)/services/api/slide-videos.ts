import { getHeaderForFormData } from "./header";
import { ApiResponseHandler } from "./api-error-handler";
import { getApiUrl } from "@/utils/api";

export type StageBox = {
  position: { x: number; y: number };
  size: { width: number; height: number };
};

// Why an avatar no longer matches its narration: the speaker note was edited,
// or the narration audio in the avatar's language was regenerated.
export type SlideVideoStaleReason = "note_changed" | "audio_regenerated";

export type SlideVideoSource = "upload" | "elevenlabs";

// One slide's avatar video, as `GET /presentation/{id}/videos` describes it.
export type SlideVideo = {
  id: string;
  presentation_id: string;
  slide_id: string;
  slide_index: number;
  url: string;
  format: string;
  mime_type: string;
  original_filename?: string | null;
  size_bytes?: number | null;
  duration_seconds?: number | null;
  width?: number | null;
  height?: number | null;
  // The narration language the avatar was synced to; null means any language.
  language?: string | null;
  // The avatar no longer matches its narration; `stale_reason` says why.
  stale: boolean;
  stale_reason?: SlideVideoStaleReason | null;
  placeholder?: StageBox | null;
  source: SlideVideoSource;
  created_at: string;
  updated_at: string;
};

// The deck's presenter portrait the avatars are generated from.
export type PortraitInfo = {
  url: string;
  mime_type: string;
  width: number;
  height: number;
  size_bytes: number;
  updated_at: string;
};

export type AvatarSlidePlan = {
  slide_index: number;
  slide_id: string;
  state: "queued" | "generating" | "done" | "failed" | "skipped";
  reason?: string | null;
  message?: string | null;
  generation_id?: string | null;
  video_id?: string | null;
};

export type AvatarGenerationTask = {
  id: string;
  status: "pending" | "completed" | "error";
  message?: string | null;
  data: {
    phase: string;
    total: number;
    queued: number;
    completed: number;
    failed: number;
    skipped: number;
    language: string | null;
    resolution?: string;
    slides: AvatarSlidePlan[];
  };
};

export type AvatarPreview = {
  language: string | null;
  slides: AvatarSlidePlan[];
};

export type GenerateAvatarsBody = {
  slide_indices?: number[];
  language?: string | null;
  force: boolean;
  resolution?: string;
};

export type SlideVideosResponse = {
  presentation_id: string;
  total_duration_seconds?: number | null;
  videos: SlideVideo[];
  portrait?: PortraitInfo | null;
  generation_available?: boolean;
};

export const SLIDE_VIDEO_ACCEPT = "video/mp4,video/webm,.mp4,.m4v,.webm";

export function isSupportedSlideVideoFile(file: File) {
  const type = (file.type || "").toLowerCase();
  if (type === "video/mp4" || type === "video/webm") return true;
  return /\.(mp4|m4v|webm)$/i.test(file.name);
}

const videosPath = (presentationId: string, slideIndex?: number) =>
  `/api/v1/ppt/presentation/${presentationId}/videos` +
  (slideIndex === undefined ? "" : `/${slideIndex}`);

export class SlideVideosApi {
  static async getVideos(presentationId: string): Promise<SlideVideosResponse> {
    const response = await fetch(getApiUrl(videosPath(presentationId)), {
      cache: "no-cache",
    });
    return (await ApiResponseHandler.handleResponse(
      response,
      "Failed to load slide videos",
    )) as SlideVideosResponse;
  }

  // `slideIndex` is the slide's index as the server stores it.
  static async uploadVideo(
    presentationId: string,
    slideIndex: number,
    file: File,
  ): Promise<SlideVideo> {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch(
      getApiUrl(videosPath(presentationId, slideIndex)),
      {
        method: "PUT",
        headers: getHeaderForFormData(),
        body: formData,
      },
    );
    return (await ApiResponseHandler.handleResponse(
      response,
      "Failed to upload video",
    )) as SlideVideo;
  }

  static async deleteVideo(
    presentationId: string,
    slideIndex: number,
  ): Promise<{ deleted: number }> {
    const response = await fetch(
      getApiUrl(videosPath(presentationId, slideIndex)),
      { method: "DELETE" },
    );
    return (await ApiResponseHandler.handleResponse(
      response,
      "Failed to remove video",
    )) as { deleted: number };
  }

  static async addPlaceholder(
    presentationId: string,
    slideIndex: number,
  ): Promise<{ slide_index: number; slide_id: string; placeholder: StageBox; ui: unknown }> {
    const response = await fetch(
      getApiUrl(`${videosPath(presentationId, slideIndex)}/placeholder`),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
    );
    return await ApiResponseHandler.handleResponse(
      response,
      "Failed to add video placeholder",
    );
  }

  static async removePlaceholder(
    presentationId: string,
    slideIndex: number,
  ): Promise<{ removed: boolean }> {
    const response = await fetch(
      getApiUrl(`${videosPath(presentationId, slideIndex)}/placeholder`),
      { method: "DELETE" },
    );
    return await ApiResponseHandler.handleResponse(
      response,
      "Failed to remove video placeholder",
    );
  }

  static async uploadPortrait(
    presentationId: string,
    file: File,
  ): Promise<PortraitInfo> {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch(
      getApiUrl(`${videosPath(presentationId)}/portrait`),
      { method: "PUT", headers: getHeaderForFormData(), body: formData },
    );
    return await ApiResponseHandler.handleResponse(
      response,
      "Failed to upload portrait",
    );
  }

  static async deletePortrait(
    presentationId: string,
  ): Promise<{ deleted: boolean }> {
    const response = await fetch(
      getApiUrl(`${videosPath(presentationId)}/portrait`),
      { method: "DELETE" },
    );
    return await ApiResponseHandler.handleResponse(
      response,
      "Failed to remove portrait",
    );
  }

  static async generate(
    presentationId: string,
    body: GenerateAvatarsBody,
  ): Promise<AvatarGenerationTask> {
    const response = await fetch(
      getApiUrl(`${videosPath(presentationId)}/generate`),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    return await ApiResponseHandler.handleResponse(
      response,
      "Failed to start avatar generation",
    );
  }

  // The deck's most recent generation, or null when there has been none.
  static async latestGeneration(
    presentationId: string,
  ): Promise<AvatarGenerationTask | null> {
    const response = await fetch(
      getApiUrl(`${videosPath(presentationId)}/generate`),
      { cache: "no-cache" },
    );
    if (response.status === 404) return null;
    return await ApiResponseHandler.handleResponse(
      response,
      "Failed to load avatar generation",
    );
  }

  static async previewGeneration(
    presentationId: string,
    language?: string | null,
  ): Promise<AvatarPreview> {
    const query = language ? `?language=${encodeURIComponent(language)}` : "";
    const response = await fetch(
      getApiUrl(`${videosPath(presentationId)}/generate/preview${query}`),
      { cache: "no-cache" },
    );
    return await ApiResponseHandler.handleResponse(
      response,
      "Failed to preview avatar generation",
    );
  }

  static async getTask(taskId: string): Promise<AvatarGenerationTask> {
    const response = await fetch(
      getApiUrl(`/api/v1/async-tasks/status/${taskId}`),
      { cache: "no-cache" },
    );
    return await ApiResponseHandler.handleResponse(
      response,
      "Failed to load avatar generation status",
    );
  }
}
