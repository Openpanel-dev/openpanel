import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';
import { endOfDay, format, isSameDay, isSameMonth, startOfDay } from 'date-fns';

import { shortId } from '@openpanel/common';
import {
  getDefaultIntervalByDates,
  getDefaultIntervalByRange,
  isHourIntervalEnabledByRange,
  isMinuteIntervalEnabledByRange,
} from '@openpanel/constants';
import type {
  IChartBreakdown,
  IChartEvent,
  IChartLineType,
  IChartProps,
  IChartRange,
  IChartType,
  IInterval,
  zCriteria,
} from '@openpanel/validation';
import type { z } from 'zod';

type InitialState = IChartProps & {
  dirty: boolean;
  ready: boolean;
  startDate: string | null;
  endDate: string | null;
};

// First approach: define the initial state using that type
const initialState: InitialState = {
  ready: false,
  dirty: false,
  // TODO: remove this
  projectId: '',
  name: '',
  chartType: 'linear',
  lineType: 'monotone',
  interval: 'day',
  breakdowns: [],
  events: [],
  range: '30d',
  startDate: null,
  endDate: null,
  previous: false,
  formula: undefined,
  unit: undefined,
  metric: 'sum',
  limit: 500,
  criteria: 'on_or_after',
  funnelGroup: undefined,
  funnelWindow: undefined,
};

export const reportSlice = createSlice({
  name: 'report',
  initialState,
  reducers: {
    resetDirty(state) {
      return {
        ...state,
        dirty: false,
      };
    },
    reset() {
      return initialState;
    },
    ready() {
      return {
        ...initialState,
        ready: true,
      };
    },
    setReport(state, action: PayloadAction<IChartProps>) {
      return {
        ...state,
        ...action.payload,
        startDate: null,
        endDate: null,
        dirty: false,
        ready: true,
      };
    },
    setName(state, action: PayloadAction<string>) {
      state.dirty = true;
      state.name = action.payload;
    },
    // Events
    addEvent: (state, action: PayloadAction<Omit<IChartEvent, 'id'>>) => {
      state.dirty = true;
      state.events.push({
        id: shortId(),
        ...action.payload,
      });
    },
    duplicateEvent: (state, action: PayloadAction<Omit<IChartEvent, 'id'>>) => {
      state.dirty = true;
      state.events.push({
        ...action.payload,
        filters: action.payload.filters.map((filter) => ({
          ...filter,
          id: shortId(),
        })),
        id: shortId(),
      });
    },
    removeEvent: (
      state,
      action: PayloadAction<{
        id?: string;
      }>,
    ) => {
      state.dirty = true;
      state.events = state.events.filter(
        (event) => event.id !== action.payload.id,
      );
    },
    changeEvent: (state, action: PayloadAction<IChartEvent>) => {
      state.dirty = true;
      state.events = state.events.map((event) => {
        if (event.id === action.payload.id) {
          return action.payload;
        }
        return event;
      });
    },

    // Previous
    changePrevious: (state, action: PayloadAction<boolean>) => {
      state.dirty = true;
      state.previous = action.payload;
    },

    // Breakdowns
    addBreakdown: (
      state,
      action: PayloadAction<Omit<IChartBreakdown, 'id'>>,
    ) => {
      state.dirty = true;
      state.breakdowns.push({
        id: shortId(),
        ...action.payload,
      });
    },
    removeBreakdown: (
      state,
      action: PayloadAction<{
        id?: string;
      }>,
    ) => {
      state.dirty = true;
      state.breakdowns = state.breakdowns.filter(
        (event) => event.id !== action.payload.id,
      );
    },
    changeBreakdown: (state, action: PayloadAction<IChartBreakdown>) => {
      state.dirty = true;
      state.breakdowns = state.breakdowns.map((breakdown) => {
        if (breakdown.id === action.payload.id) {
          return action.payload;
        }
        return breakdown;
      });
    },

    // Interval
    changeInterval: (state, action: PayloadAction<IInterval>) => {
      state.dirty = true;
      state.interval = action.payload;
    },

    // Chart type
    changeChartType: (state, action: PayloadAction<IChartType>) => {
      state.dirty = true;
      state.chartType = action.payload;

      if (
        !isMinuteIntervalEnabledByRange(state.range) &&
        state.interval === 'minute'
      ) {
        state.interval = 'hour';
      }

      if (
        !isHourIntervalEnabledByRange(state.range) &&
        state.interval === 'hour'
      ) {
        state.interval = 'day';
      }
    },

    // Line type
    changeLineType: (state, action: PayloadAction<IChartLineType>) => {
      state.dirty = true;
      state.lineType = action.payload;
    },

    // Date range
    changeStartDate: (state, action: PayloadAction<string>) => {
      state.dirty = true;
      state.startDate = action.payload;

      const interval = getDefaultIntervalByDates(
        state.startDate,
        state.endDate,
      );
      if (interval) {
        state.interval = interval;
      }
    },

    // Date range
    changeEndDate: (state, action: PayloadAction<string>) => {
      state.dirty = true;
      state.endDate = action.payload;

      const interval = getDefaultIntervalByDates(
        state.startDate,
        state.endDate,
      );
      if (interval) {
        state.interval = interval;
      }
    },

    changeDateRanges: (state, action: PayloadAction<IChartRange>) => {
      state.dirty = true;
      state.range = action.payload;
      if (action.payload !== 'custom') {
        state.startDate = null;
        state.endDate = null;
        state.interval = getDefaultIntervalByRange(action.payload);
      }
    },

    // Formula
    changeFormula: (state, action: PayloadAction<string>) => {
      state.dirty = true;
      state.formula = action.payload;
    },

    changeCriteria(state, action: PayloadAction<z.infer<typeof zCriteria>>) {
      state.dirty = true;
      state.criteria = action.payload;
    },

    changeUnit(state, action: PayloadAction<string | undefined>) {
      state.dirty = true;
      state.unit = action.payload || undefined;
    },

    changeFunnelGroup(state, action: PayloadAction<string | undefined>) {
      state.dirty = true;
      state.funnelGroup = action.payload || undefined;
    },

    changeFunnelWindow(state, action: PayloadAction<number | undefined>) {
      state.dirty = true;
      state.funnelWindow = action.payload || undefined;
    },
    reorderEvents(
      state,
      action: PayloadAction<{ fromIndex: number; toIndex: number }>,
    ) {
      state.dirty = true;
      const { fromIndex, toIndex } = action.payload;
      const [movedEvent] = state.events.splice(fromIndex, 1);
      if (movedEvent) {
        state.events.splice(toIndex, 0, movedEvent);
      }
    },
  },
});

// Action creators are generated for each case reducer function
export const {
  reset,
  ready,
  setReport,
  setName,
  addEvent,
  removeEvent,
  duplicateEvent,
  changeEvent,
  addBreakdown,
  removeBreakdown,
  changeBreakdown,
  changeInterval,
  changeStartDate,
  changeEndDate,
  changeDateRanges,
  changeChartType,
  changeLineType,
  resetDirty,
  changeFormula,
  changePrevious,
  changeCriteria,
  changeUnit,
  changeFunnelGroup,
  changeFunnelWindow,
  reorderEvents,
} = reportSlice.actions;

export default reportSlice.reducer;
