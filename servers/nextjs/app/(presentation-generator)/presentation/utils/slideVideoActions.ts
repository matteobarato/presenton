import { DashboardApi } from "../../services/api/dashboard";
import {
  SlideVideosApi,
  isSupportedSlideVideoFile,
  type AvatarGenerationTask,
  type SlideVideo,
} from "../../services/api/slide-videos";
import { updateSlideUi } from "@/store/slices/presentationGeneration";
import {
  generationChanged,
  slideVideoPendingChanged,
  slideVideoRemoved,
  slideVideoSaved,
  slideVideosLoaded,
  type SlideVideoPending,
} from "@/store/slices/slideVideos";
import { newlyDone } from "./avatarGeneration";
import type { AppDispatch, RootState } from "@/store/store";
import {
  findVideoPlaceholder,
  withVideoPlaceholder,
  withoutVideoPlaceholder,
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

// Copy the server's placeholder for a slide into the editor's slide.
async function syncServerPlaceholder(
  dispatch: AppDispatch,
  getState: GetState,
  presentationId: string,
  slideId: string,
) {
  let serverSlide: ServerSlide | null;
  try {
    serverSlide = await fetchServerSlide(presentationId, slideId);
  } catch {
    throw new SlideVideoRefreshError(
      "Reload the editor before changing this slide, or its video placeholder may be lost.",
    );
  }
  if (findVideoPlaceholder(serverSlide?.ui)) {
    updateLocalSlideUi(dispatch, getState, slideId, (ui) =>
      withVideoPlaceholder(ui, serverSlide?.ui),
    );
  }
}

export const loadSlideVideos =
  (presentationId: string) =>
  async (dispatch: AppDispatch): Promise<void> => {
    const response = await SlideVideosApi.getVideos(presentationId);
    dispatch(
      slideVideosLoaded({
        presentationId,
        videos: response.videos,
        portrait: response.portrait,
        generationAvailable: response.generation_available,
      }),
    );
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

      await syncServerPlaceholder(dispatch, getState, presentationId, slideId);
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

// Mark a slide as one that gets an avatar, without a video yet.
export const addSlidePlaceholder =
  ({ presentationId, slideId }: { presentationId: string; slideId: string }) =>
  (dispatch: AppDispatch, getState: GetState): Promise<void> =>
    withPending(dispatch, slideId, "uploading", async () => {
      const slide = await savedSlide(presentationId, slideId);
      const result = await SlideVideosApi.addPlaceholder(
        presentationId,
        slide.index,
      );
      if (result.slide_id !== slideId) {
        // A reorder was saved between the lookup and the request.
        await dispatch(loadSlideVideos(presentationId));
        throw new Error(
          "Slides were being reordered. Check the slides and try again.",
        );
      }
      await syncServerPlaceholder(dispatch, getState, presentationId, slideId);
    });

// Removing the placeholder also deletes the slide's video on the server.
export const removeSlidePlaceholder =
  ({ presentationId, slideId }: { presentationId: string; slideId: string }) =>
  (dispatch: AppDispatch, getState: GetState): Promise<void> =>
    withPending(dispatch, slideId, "removing", async () => {
      const slide = await savedSlide(presentationId, slideId);
      await SlideVideosApi.removePlaceholder(presentationId, slide.index);
      dispatch(slideVideoRemoved(slideId));
      updateLocalSlideUi(dispatch, getState, slideId, withoutVideoPlaceholder);
    });

export const startAvatarGeneration =
  ({
    presentationId,
    slideIds,
    language,
    force,
  }: {
    presentationId: string;
    slideIds: string[];
    language?: string | null;
    force: boolean;
  }) =>
  async (dispatch: AppDispatch): Promise<AvatarGenerationTask> => {
    const indices: number[] = [];
    for (const slideId of slideIds) {
      indices.push((await savedSlide(presentationId, slideId)).index);
    }
    const task = await SlideVideosApi.generate(presentationId, {
      slide_indices: indices,
      language,
      force,
    });
    dispatch(generationChanged(task));
    return task;
  };

// Load the videos of slides whose avatar finished and sync their placeholders.
export const syncFinishedAvatars =
  (presentationId: string, slideIds: string[]) =>
  async (dispatch: AppDispatch, getState: GetState): Promise<void> => {
    await dispatch(loadSlideVideos(presentationId));
    for (const slideId of slideIds) {
      try {
        await syncServerPlaceholder(dispatch, getState, presentationId, slideId);
      } catch (error) {
        if (error instanceof SlideVideoRefreshError) {
          // Not worth holding the others back; the next reload fixes it.
          continue;
        }
        throw error;
      }
    }
  };

const AVATAR_POLL_MS = 3000;

const AVATAR_POLL_MAX_FAILURES = 5;

/**
 * Follow a generation task until it is no longer pending. Each slide that
 * finishes has its video loaded and its placeholder synced as soon as it is
 * seen; resolves with the final task, or null when `signal` aborts. A failed
 * poll is retried on the next tick, and rejects after five in a row.
 */
export const pollAvatarGeneration =
  (presentationId: string, taskId: string, signal?: AbortSignal) =>
  async (
    dispatch: AppDispatch,
    getState: GetState,
  ): Promise<AvatarGenerationTask | null> => {
    let previous: AvatarGenerationTask["data"]["slides"] | undefined =
      getState().slideVideos.generation?.id === taskId
        ? getState().slideVideos.generation?.data?.slides
        : undefined;
    let failures = 0;
    for (;;) {
      if (signal?.aborted) return null;
      try {
        const task = await SlideVideosApi.getTask(taskId);
        if (signal?.aborted) return null;
        const finished = newlyDone(previous, task.data?.slides);
        if (finished.length > 0) {
          await dispatch(syncFinishedAvatars(presentationId, finished));
        }
        // Only now are these slides handled; a failure above retries them.
        previous = task.data?.slides;
        dispatch(generationChanged(task));
        failures = 0;
        if (task.status !== "pending") return task;
      } catch (error) {
        failures += 1;
        if (failures >= AVATAR_POLL_MAX_FAILURES) throw error;
      }
      if (signal?.aborted) return null;
      await wait(AVATAR_POLL_MS);
    }
  };
