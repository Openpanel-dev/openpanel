import reportSlice from '@/components/report/reportSlice';
import { configureStore } from '@reduxjs/toolkit';
import {
  useDispatch as useBaseDispatch,
  useSelector as useBaseSelector,
} from 'react-redux';
import type { TypedUseSelectorHook } from 'react-redux';

const makeStore = () =>
  configureStore({
    reducer: {
      report: reportSlice,
    },
  });

export type AppStore = ReturnType<typeof makeStore>;

export type RootState = ReturnType<AppStore['getState']>;

export type AppDispatch = AppStore['dispatch'];
export const useDispatch: () => AppDispatch = useBaseDispatch;
export const useSelector: TypedUseSelectorHook<RootState> = useBaseSelector;

export default makeStore;
