import { getHeaderForFormData } from "./header";
import { ApiResponseHandler } from "./api-error-handler";
import { getApiUrl } from "@/utils/api";

export type StageBox = {
  position: { x: number; y: number };
  size: { width: number; height: number };
};

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
  // The speaker note changed after the video was made.
  stale: boolean;
  placeholder?: StageBox | null;
  created_at: string;
  updated_at: string;
};

export type SlideVideosResponse = {
  presentation_id: string;
  total_duration_seconds?: number | null;
  videos: SlideVideo[];
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
}
