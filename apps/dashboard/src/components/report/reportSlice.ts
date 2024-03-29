import { start } from 'repl';
import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import { isSameDay, isSameMonth } from 'date-fns';

import {
  alphabetIds,
  getDefaultIntervalByDates,
  getDefaultIntervalByRange,
  isHourIntervalEnabledByRange,
  isMinuteIntervalEnabledByRange,
} from '@openpanel/constants';
import type {
  IChartBreakdown,
  IChartEvent,
  IChartInput,
  IChartLineType,
  IChartRange,
  IChartType,
  IInterval,
} from '@openpanel/validation';

type InitialState = IChartInput & {
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
  name: 'Untitled',
  chartType: 'linear',
  lineType: 'monotone',
  interval: 'day',
  breakdowns: [],
  events: [],
  range: '1m',
  startDate: null,
  endDate: null,
  previous: false,
  formula: undefined,
  unit: undefined,
  metric: 'sum',
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
    setReport(state, action: PayloadAction<IChartInput>) {
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
        id: alphabetIds[state.events.length]!,
        ...action.payload,
      });
    },
    removeEvent: (
      state,
      action: PayloadAction<{
        id: string;
      }>
    ) => {
      state.dirty = true;
      state.events = state.events.filter(
        (event) => event.id !== action.payload.id
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
      action: PayloadAction<Omit<IChartBreakdown, 'id'>>
    ) => {
      state.dirty = true;
      state.breakdowns.push({
        id: alphabetIds[state.breakdowns.length]!,
        ...action.payload,
      });
    },
    removeBreakdown: (
      state,
      action: PayloadAction<{
        id: string;
      }>
    ) => {
      state.dirty = true;
      state.breakdowns = state.breakdowns.filter(
        (event) => event.id !== action.payload.id
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

    // Custom start and end date
    changeDates: (
      state,
      action: PayloadAction<{
        startDate: string;
        endDate: string;
      }>
    ) => {
      state.dirty = true;
      state.startDate = action.payload.startDate;
      state.endDate = action.payload.endDate;

      if (isSameDay(state.startDate, state.endDate)) {
        state.interval = 'hour';
      } else if (isSameMonth(state.startDate, state.endDate)) {
        state.interval = 'day';
      } else {
        state.interval = 'month';
      }
    },

    // Date range
    changeStartDate: (state, action: PayloadAction<string>) => {
      state.dirty = true;
      state.startDate = action.payload;

      const interval = getDefaultIntervalByDates(
        state.startDate,
        state.endDate
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
        state.endDate
      );
      if (interval) {
        state.interval = interval;
      }
    },

    changeDateRanges: (state, action: PayloadAction<IChartRange>) => {
      state.dirty = true;
      state.range = action.payload;
      state.startDate = null;
      state.endDate = null;

      state.interval = getDefaultIntervalByRange(action.payload);
    },

    // Formula
    changeFormula: (state, action: PayloadAction<string>) => {
      state.dirty = true;
      state.formula = action.payload;
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
  changeEvent,
  addBreakdown,
  removeBreakdown,
  changeBreakdown,
  changeInterval,
  changeDates,
  changeStartDate,
  changeEndDate,
  changeDateRanges,
  changeChartType,
  changeLineType,
  resetDirty,
  changeFormula,
  changePrevious,
} = reportSlice.actions;

export default reportSlice.reducer;
