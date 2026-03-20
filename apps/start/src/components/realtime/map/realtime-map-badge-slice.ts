import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';
import type { CoordinateCluster } from './coordinates';

/** Serializable marker payload for the realtime map badge detail panel */
export interface MapBadgeDisplayMarker extends CoordinateCluster {
  detailScope: 'city' | 'coordinate' | 'country' | 'merged';
  id: string;
  label: string;
  mergedVisualClusters: number;
  screenPoint: {
    x: number;
    y: number;
  };
}

interface RealtimeMapBadgeState {
  open: boolean;
  marker: MapBadgeDisplayMarker | null;
  projectId: string | null;
}

const initialState: RealtimeMapBadgeState = {
  open: false,
  marker: null,
  projectId: null,
};

const realtimeMapBadgeSlice = createSlice({
  name: 'realtimeMapBadge',
  initialState,
  reducers: {
    openMapBadgeDetails(
      state,
      action: PayloadAction<{
        marker: MapBadgeDisplayMarker;
        projectId: string;
      }>
    ) {
      state.open = true;
      state.marker = action.payload.marker;
      state.projectId = action.payload.projectId;
    },
    closeMapBadgeDetails(state) {
      if (!state.open) {
        return;
      }
      state.open = false;
      state.marker = null;
      state.projectId = null;
    },
  },
});

export const { openMapBadgeDetails, closeMapBadgeDetails } =
  realtimeMapBadgeSlice.actions;

export default realtimeMapBadgeSlice.reducer;
