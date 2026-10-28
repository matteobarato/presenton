import { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { notify } from "@/components/ui/sonner";
import type { AppDispatch, RootState } from "@/store/store";
import { generationChanged, portraitChanged } from "@/store/slices/slideVideos";
import {
  SlideVideosApi,
  type AvatarGenerationTask,
  type AvatarPreview,
} from "../../services/api/slide-videos";
import {
  SlideVideoRefreshError,
  addSlidePlaceholder,
  loadSlideVideos,
  pollAvatarGeneration,
  removeSlidePlaceholder,
  removeSlideVideo,
  startAvatarGeneration,
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

  const addPlaceholder = useCallback(async () => {
    if (!presentationId || !key) return;
    try {
      await dispatch(addSlidePlaceholder({ presentationId, slideId: key }));
    } catch (error) {
      notify.error(
        "Could not add the placeholder",
        errorMessage(error, "Try again in a moment."),
      );
    }
  }, [dispatch, key, presentationId]);

  const removePlaceholder = useCallback(async () => {
    if (!presentationId || !key) return;
    if (
      typeof window !== "undefined" &&
      hasVideo &&
      !window.confirm(
        "Remove the avatar placeholder? This also deletes the slide's video.",
      )
    ) {
      return;
    }
    try {
      await dispatch(removeSlidePlaceholder({ presentationId, slideId: key }));
    } catch (error) {
      notify.error(
        "Could not remove the placeholder",
        errorMessage(error, "Try again in a moment."),
      );
    }
  }, [dispatch, hasVideo, key, presentationId]);

  return { video, pending, upload, remove, addPlaceholder, removePlaceholder };
}

export type GenerationSummary = {
  generated: number;
  failed: { slideIndex: number; reason: string }[];
  skipped: { slideIndex: number; reason: string }[];
};

function summarize(task: AvatarGenerationTask): GenerationSummary {
  const slides = task.data?.slides ?? [];
  const reasonOf = (s: (typeof slides)[number]) =>
    s.reason || s.message || "unknown";
  return {
    generated: slides.filter((s) => s.state === "done").length,
    failed: slides
      .filter((s) => s.state === "failed")
      .map((s) => ({ slideIndex: s.slide_index, reason: reasonOf(s) })),
    skipped: slides
      .filter((s) => s.state === "skipped")
      .map((s) => ({ slideIndex: s.slide_index, reason: reasonOf(s) })),
  };
}

/**
 * Deck-level avatar state: the presenter portrait, the preview of what a
 * generation would do, and the running generation task (resumed on mount).
 * `refreshKey` changes whenever placeholders, portrait or videos change, and
 * the preview is fetched again.
 */
export function useAvatarGeneration(
  presentationId: string | null | undefined,
  refreshKey: string,
) {
  const dispatch = useDispatch<AppDispatch>();
  const portrait = useSelector((state: RootState) => state.slideVideos.portrait);
  const generationAvailable = useSelector(
    (state: RootState) => state.slideVideos.generationAvailable,
  );
  const generation = useSelector(
    (state: RootState) => state.slideVideos.generation,
  );
  const [preview, setPreview] = useState<AvatarPreview | null>(null);
  const [language, setLanguage] = useState<string | null>(null);
  const [summary, setSummary] = useState<GenerationSummary | null>(null);
  const [portraitPending, setPortraitPending] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const running = generation?.status === "pending";

  const refreshPreview = useCallback(async () => {
    if (!presentationId) return;
    try {
      setPreview(await SlideVideosApi.previewGeneration(presentationId, language));
    } catch (error) {
      console.error("Failed to load the avatar preview:", error);
    }
  }, [language, presentationId]);

  useEffect(() => {
    void refreshPreview();
  }, [refreshPreview, refreshKey]);

  const follow = useCallback(
    async (taskId: string) => {
      if (!presentationId) return;
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      try {
        const task = await dispatch(
          pollAvatarGeneration(presentationId, taskId, controller.signal),
        );
        if (!task) return;
        setSummary(summarize(task));
        void refreshPreview();
      } catch (error) {
        if (!controller.signal.aborted) {
          notify.error(
            "Lost track of the generation",
            errorMessage(error, "Reload the editor to see its result."),
          );
        }
      }
    },
    [dispatch, presentationId, refreshPreview],
  );

  // Resume a generation that was started before the panel opened.
  useEffect(() => {
    if (!presentationId) return;
    let cancelled = false;
    SlideVideosApi.latestGeneration(presentationId)
      .then((task) => {
        if (cancelled || !task) return;
        dispatch(generationChanged(task));
        if (task.status === "pending") void follow(task.id);
      })
      .catch((error: unknown) => {
        console.error("Failed to load avatar generation:", error);
      });
    return () => {
      cancelled = true;
    };
    // `follow` changes with the language; the resume must run once per deck.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, presentationId]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const generate = useCallback(
    async (slideIds: string[], force: boolean) => {
      if (!presentationId || slideIds.length === 0) return;
      setSummary(null);
      try {
        const task = await dispatch(
          startAvatarGeneration({ presentationId, slideIds, language, force }),
        );
        if (task.status === "pending") void follow(task.id);
      } catch (error) {
        notify.error(
          "Could not start the generation",
          errorMessage(error, "Try again in a moment."),
        );
      }
    },
    [dispatch, follow, language, presentationId],
  );

  const uploadPortrait = useCallback(
    async (file: File) => {
      if (!presentationId) return;
      setPortraitPending(true);
      try {
        dispatch(
          portraitChanged(await SlideVideosApi.uploadPortrait(presentationId, file)),
        );
      } catch (error) {
        notify.error(
          "Portrait upload failed",
          errorMessage(error, "The image could not be uploaded."),
        );
      } finally {
        setPortraitPending(false);
      }
    },
    [dispatch, presentationId],
  );

  const removePortrait = useCallback(async () => {
    if (!presentationId) return;
    setPortraitPending(true);
    try {
      await SlideVideosApi.deletePortrait(presentationId);
      dispatch(portraitChanged(null));
    } catch (error) {
      notify.error(
        "Could not remove the portrait",
        errorMessage(error, "Try again in a moment."),
      );
    } finally {
      setPortraitPending(false);
    }
  }, [dispatch, presentationId]);

  return {
    portrait,
    portraitPending,
    generationAvailable,
    generation,
    running,
    preview,
    language,
    setLanguage,
    summary,
    dismissSummary: () => setSummary(null),
    generate,
    uploadPortrait,
    removePortrait,
  };
}
