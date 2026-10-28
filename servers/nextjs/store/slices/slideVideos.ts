import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type {
  AvatarGenerationTask,
  PortraitInfo,
  SlideVideo,
} from "@/app/(presentation-generator)/services/api/slide-videos";

export type SlideVideoPending = "uploading" | "removing";

interface SlideVideosState {
  presentationId: string | null;
  bySlideId: Record<string, SlideVideo>;
  pendingBySlideId: Record<string, SlideVideoPending>;
  portrait: PortraitInfo | null;
  generationAvailable: boolean;
  generation: AvatarGenerationTask | null;
}

const initialState: SlideVideosState = {
  presentationId: null,
  bySlideId: {},
  pendingBySlideId: {},
  portrait: null,
  generationAvailable: false,
  generation: null,
};

const slideVideosSlice = createSlice({
  name: "slideVideos",
  initialState,
  reducers: {
    slideVideosLoaded: (
      state,
      action: PayloadAction<{
        presentationId: string;
        videos: SlideVideo[];
        portrait?: PortraitInfo | null;
        generationAvailable?: boolean;
      }>,
    ) => {
      // Spinners of in-flight uploads survive a reload of the same deck.
      if (state.presentationId !== action.payload.presentationId) {
        state.pendingBySlideId = {};
        state.generation = null;
        state.portrait = null;
        state.generationAvailable = false;
      }
      state.presentationId = action.payload.presentationId;
      state.bySlideId = Object.fromEntries(
        action.payload.videos.map((video) => [video.slide_id, video]),
      );
      state.portrait = action.payload.portrait ?? null;
      state.generationAvailable = action.payload.generationAvailable ?? false;
    },
    portraitChanged: (state, action: PayloadAction<PortraitInfo | null>) => {
      state.portrait = action.payload;
    },
    generationChanged: (
      state,
      action: PayloadAction<AvatarGenerationTask | null>,
    ) => {
      state.generation = action.payload;
    },
    slideVideoSaved: (state, action: PayloadAction<SlideVideo>) => {
      state.bySlideId[action.payload.slide_id] = action.payload;
    },
    slideVideoRemoved: (state, action: PayloadAction<string>) => {
      delete state.bySlideId[action.payload];
    },
    slideVideoPendingChanged: (
      state,
      action: PayloadAction<{ slideId: string; pending: SlideVideoPending | null }>,
    ) => {
      if (action.payload.pending) {
        state.pendingBySlideId[action.payload.slideId] = action.payload.pending;
      } else {
        delete state.pendingBySlideId[action.payload.slideId];
      }
    },
  },
});

export const {
  slideVideosLoaded,
  slideVideoSaved,
  slideVideoRemoved,
  slideVideoPendingChanged,
  portraitChanged,
  generationChanged,
} = slideVideosSlice.actions;

export default slideVideosSlice.reducer;
