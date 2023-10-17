import reportSlice from '@/components/report/reportSlice'
import { configureStore } from '@reduxjs/toolkit'
import { type TypedUseSelectorHook, useDispatch as useBaseDispatch, useSelector as useBaseSelector } from 'react-redux'

const store = configureStore({
  reducer: {
    report: reportSlice
  },
})

export type RootState = ReturnType<typeof store.getState>

export type AppDispatch = typeof store.dispatch
export const useDispatch: () => AppDispatch = useBaseDispatch
export const useSelector: TypedUseSelectorHook<RootState> = useBaseSelector


export default store