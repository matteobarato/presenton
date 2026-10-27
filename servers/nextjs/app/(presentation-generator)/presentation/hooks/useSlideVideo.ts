import { useCallback, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { notify } from "@/components/ui/sonner";
import type { AppDispatch, RootState } from "@/store/store";
import {
  SlideVideoRefreshError,
  loadSlideVideos,
  removeSlideVideo,
  uploadSlideVideo,
} from "../utils/slideVideoActions";

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

/** Fetch a deck's avatar videos into the store, for the editor to show. */
export function useLoadSlideVideos(
  presentationId: string | null | undefined,
  enabled: boolean,
) {
  const dispatch = useDispatch<AppDispatch>();
  useEffect(() => {
    if (!presentationId || !enabled) return;
    dispatch(loadSlideVideos(presentationId)).catch((error: unknown) => {
      console.error("Failed to load slide videos:", error);
    });
  }, [dispatch, enabled, presentationId]);
}

/** One slide's avatar video, with the actions that change it. */
export function useSlideVideo(
  presentationId: string | null | undefined,
  slideId: string | number | null | undefined,
) {
  const dispatch = useDispatch<AppDispatch>();
  const key = slideId == null ? null : String(slideId);
  const video = useSelector((state: RootState) =>
    key ? (state.slideVideos.bySlideId[key] ?? null) : null,
  );
  const pending = useSelector((state: RootState) =>
    key ? (state.slideVideos.pendingBySlideId[key] ?? null) : null,
  );
  const hasVideo = Boolean(video);

  const upload = useCallback(
    async (file: File) => {
      if (!presentationId || !key) return;
      try {
        await dispatch(
          uploadSlideVideo({ presentationId, slideId: key, file }),
        );
        notify.success(
          hasVideo ? "Video replaced" : "Video added",
          "It plays inside the outlined box during narrated playback.",
        );
      } catch (error) {
        if (error instanceof SlideVideoRefreshError) {
          notify.warning("Video added", error.message);
          return;
        }
        notify.error(
          "Upload failed",
          errorMessage(error, "The video could not be uploaded."),
        );
      }
    },
    [dispatch, hasVideo, key, presentationId],
  );

  const remove = useCallback(async () => {
    if (!presentationId || !key) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm("Remove this slide's video? The file is deleted.")
    ) {
      return;
    }
    try {
      await dispatch(removeSlideVideo({ presentationId, slideId: key }));
      notify.success("Video removed", "The slide narrates with the voice bubble again.");
    } catch (error) {
      notify.error(
        "Could not remove the video",
        errorMessage(error, "Try again in a moment."),
      );
    }
  }, [dispatch, key, presentationId]);

  return { video, pending, upload, remove };
}
