import { configureStore } from '@reduxjs/toolkit';
import type { TypedUseSelectorHook } from 'react-redux';
import {
  useDispatch as useBaseDispatch,
  useSelector as useBaseSelector,
} from 'react-redux';
import realtimeMapBadgeReducer from '@/components/realtime/map/realtime-map-badge-slice';
import reportSlice from '@/components/report/reportSlice';

const makeStore = () =>
  configureStore({
    reducer: {
      report: reportSlice,
      realtimeMapBadge: realtimeMapBadgeReducer,
    },
  });

export type AppStore = ReturnType<typeof makeStore>;

export type RootState = ReturnType<AppStore['getState']>;

export type AppDispatch = AppStore['dispatch'];
export const useDispatch: () => AppDispatch = useBaseDispatch;
export const useSelector: TypedUseSelectorHook<RootState> = useBaseSelector;

export default makeStore;
