import { DashboardApi } from "../../services/api/dashboard";
import {
  SlideVideosApi,
  isSupportedSlideVideoFile,
  type SlideVideo,
} from "../../services/api/slide-videos";
import { updateSlideUi } from "@/store/slices/presentationGeneration";
import {
  slideVideoPendingChanged,
  slideVideoRemoved,
  slideVideoSaved,
  slideVideosLoaded,
  type SlideVideoPending,
} from "@/store/slices/slideVideos";
import type { AppDispatch, RootState } from "@/store/store";
import {
  findVideoPlaceholder,
  withVideoPlaceholder,
} from "@/components/slide-editor/video/video-placeholder";

type GetState = () => RootState;

// The upload went through but the editor could not pick up its placeholder.
export class SlideVideoRefreshError extends Error {}

// A new slide reaches the server with the next autosave, which waits for the
// editor to be idle for two seconds.
const SAVED_SLIDE_ATTEMPTS = 6;
const SAVED_SLIDE_RETRY_MS = 1000;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type ServerSlide = { id: string; index: number; ui?: unknown };

async function fetchServerSlide(
  presentationId: string,
  slideId: string,
): Promise<ServerSlide | null> {
  const presentation = await DashboardApi.getPresentation(presentationId, {
    cache: "no-store",
  });
  const slides: ServerSlide[] = Array.isArray(presentation?.slides)
    ? presentation.slides
    : [];
  return slides.find((slide) => slide.id === slideId) ?? null;
}

// The video endpoints address slides by the index the server has stored, which
// lags behind the editor until autosave catches up with a reorder, so the
// slide is looked up by id first.
async function savedSlide(
  presentationId: string,
  slideId: string,
): Promise<ServerSlide> {
  for (let attempt = 0; attempt < SAVED_SLIDE_ATTEMPTS; attempt += 1) {
    const slide = await fetchServerSlide(presentationId, slideId);
    if (slide) return slide;
    await wait(SAVED_SLIDE_RETRY_MS);
  }
  throw new Error(
    "This slide has not been saved yet. Try again in a moment.",
  );
}

function updateLocalSlideUi(
  dispatch: AppDispatch,
  getState: GetState,
  slideId: string,
  update: (ui: Record<string, unknown>) => Record<string, unknown>,
) {
  const slides = getState().presentationGeneration.presentationData?.slides;
  if (!Array.isArray(slides)) return;
  const index = slides.findIndex((slide) => slide?.id === slideId);
  const ui = slides[index]?.ui;
  if (index < 0 || !ui || typeof ui !== "object") return;
  dispatch(updateSlideUi({ index, ui: update(ui as Record<string, unknown>) }));
}

async function withPending<T>(
  dispatch: AppDispatch,
  slideId: string,
  pending: SlideVideoPending,
  run: () => Promise<T>,
): Promise<T> {
  dispatch(slideVideoPendingChanged({ slideId, pending }));
  try {
    return await run();
  } finally {
    dispatch(slideVideoPendingChanged({ slideId, pending: null }));
  }
}

export const loadSlideVideos =
  (presentationId: string) =>
  async (dispatch: AppDispatch): Promise<void> => {
    const response = await SlideVideosApi.getVideos(presentationId);
    dispatch(slideVideosLoaded({ presentationId, videos: response.videos }));
  };

/**
 * Upload a slide's avatar video, replacing any earlier one.
 *
 * The server adds the placeholder to its copy of the slide; it is copied into
 * the editor's slide as well, or the next autosave would write the slide back
 * without it.
 */
export const uploadSlideVideo =
  ({
    presentationId,
    slideId,
    file,
  }: {
    presentationId: string;
    slideId: string;
    file: File;
  }) =>
  (dispatch: AppDispatch, getState: GetState): Promise<SlideVideo> => {
    if (!isSupportedSlideVideoFile(file)) {
      return Promise.reject(new Error("Choose an MP4 or WebM video."));
    }
    return withPending(dispatch, slideId, "uploading", async () => {
      const slide = await savedSlide(presentationId, slideId);
      const video = await SlideVideosApi.uploadVideo(
        presentationId,
        slide.index,
        file,
      );
      if (video.slide_id !== slideId) {
        // A reorder was saved between the lookup and the upload.
        await dispatch(loadSlideVideos(presentationId));
        throw new Error(
          `The video went to slide ${video.slide_index + 1} because slides were being reordered. Check that slide and upload again.`,
        );
      }
      dispatch(slideVideoSaved(video));

      let serverSlide: ServerSlide | null;
      try {
        serverSlide = await fetchServerSlide(presentationId, slideId);
      } catch {
        throw new SlideVideoRefreshError(
          "Reload the editor before changing this slide, or its video placeholder may be lost.",
        );
      }
      const placeholder = findVideoPlaceholder(serverSlide?.ui);
      if (placeholder) {
        updateLocalSlideUi(dispatch, getState, slideId, (ui) =>
          withVideoPlaceholder(ui, placeholder),
        );
      }
      return video;
    });
  };

// Deleting a video leaves the slide's placeholder in place, empty: the
// placeholder is what marks the slide as one that gets an avatar.
export const removeSlideVideo =
  ({ presentationId, slideId }: { presentationId: string; slideId: string }) =>
  (dispatch: AppDispatch): Promise<void> =>
    withPending(dispatch, slideId, "removing", async () => {
      const slide = await savedSlide(presentationId, slideId);
      await SlideVideosApi.deleteVideo(presentationId, slide.index);
      dispatch(slideVideoRemoved(slideId));
    });
