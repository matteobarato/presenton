import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { SlideVideo } from "@/app/(presentation-generator)/services/api/slide-videos";

export type SlideVideoPending = "uploading" | "removing";

interface SlideVideosState {
  presentationId: string | null;
  bySlideId: Record<string, SlideVideo>;
  pendingBySlideId: Record<string, SlideVideoPending>;
}

const initialState: SlideVideosState = {
  presentationId: null,
  bySlideId: {},
  pendingBySlideId: {},
};

const slideVideosSlice = createSlice({
  name: "slideVideos",
  initialState,
  reducers: {
    slideVideosLoaded: (
      state,
      action: PayloadAction<{ presentationId: string; videos: SlideVideo[] }>,
    ) => {
      state.presentationId = action.payload.presentationId;
      state.bySlideId = Object.fromEntries(
        action.payload.videos.map((video) => [video.slide_id, video]),
      );
      state.pendingBySlideId = {};
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
} = slideVideosSlice.actions;

export default slideVideosSlice.reducer;
