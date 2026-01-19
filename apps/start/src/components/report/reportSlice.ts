import type { PayloadAction } from '@reduxjs/toolkit';
import { createSlice } from '@reduxjs/toolkit';

import { shortId } from '@openpanel/common';
import {
  getDefaultIntervalByDates,
  getDefaultIntervalByRange,
  isHourIntervalEnabledByRange,
  isMinuteIntervalEnabledByRange,
} from '@openpanel/constants';
import type {
  IChartBreakdown,
  IChartEventItem,
  IChartLineType,
  IChartRange,
  IChartType,
  IInterval,
  IReport,
  IReportOptions,
  UnionOmit,
  zCriteria,
} from '@openpanel/validation';
import type { z } from 'zod';

type InitialState = IReport & {
  id?: string;
  dirty: boolean;
  ready: boolean;
  startDate: string | null;
  endDate: string | null;
};

// First approach: define the initial state using that type
const initialState: InitialState = {
  ready: false,
  dirty: false,
  projectId: '',
  name: '',
  chartType: 'linear',
  lineType: 'monotone',
  interval: 'day',
  breakdowns: [],
  series: [],
  range: '30d',
  startDate: null,
  endDate: null,
  previous: false,
  formula: undefined,
  unit: undefined,
  metric: 'sum',
  limit: 500,
  options: undefined,
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
    setReport(state, action: PayloadAction<IReport>) {
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
    // Series (Events and Formulas)
    addSerie: (
      state,
      action: PayloadAction<UnionOmit<IChartEventItem, 'id'>>,
    ) => {
      state.dirty = true;
      state.series.push({
        id: shortId(),
        ...action.payload,
      });
    },
    duplicateEvent: (state, action: PayloadAction<IChartEventItem>) => {
      state.dirty = true;
      if (action.payload.type === 'event') {
        state.series.push({
          ...action.payload,
          filters: action.payload.filters.map((filter) => ({
            ...filter,
            id: shortId(),
          })),
          id: shortId(),
        } as IChartEventItem);
      } else {
        state.series.push({
          ...action.payload,
          id: shortId(),
        } as IChartEventItem);
      }
    },
    removeEvent: (
      state,
      action: PayloadAction<{
        id?: string;
      }>,
    ) => {
      state.dirty = true;
      state.series = state.series.filter((event) => {
        return event.id !== action.payload.id;
      });
    },
    changeEvent: (state, action: PayloadAction<IChartEventItem>) => {
      state.dirty = true;
      state.series = state.series.map((event) => {
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

      // Initialize sankey options if switching to sankey
      if (action.payload === 'sankey' && !state.options) {
        state.options = {
          type: 'sankey',
          mode: 'after',
          steps: 5,
          exclude: [],
        };
      }

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
      if (!state.options || state.options.type !== 'retention') {
        state.options = {
          type: 'retention',
          criteria: action.payload,
        };
      } else {
        state.options.criteria = action.payload;
      }
    },

    changeUnit(state, action: PayloadAction<string | undefined>) {
      state.dirty = true;
      state.unit = action.payload || undefined;
    },

    changeFunnelGroup(state, action: PayloadAction<string | undefined>) {
      state.dirty = true;
      if (!state.options || state.options.type !== 'funnel') {
        state.options = {
          type: 'funnel',
          funnelGroup: action.payload,
          funnelWindow: undefined,
        };
      } else {
        state.options.funnelGroup = action.payload;
      }
    },

    changeFunnelWindow(state, action: PayloadAction<number | undefined>) {
      state.dirty = true;
      if (!state.options || state.options.type !== 'funnel') {
        state.options = {
          type: 'funnel',
          funnelGroup: undefined,
          funnelWindow: action.payload,
        };
      } else {
        state.options.funnelWindow = action.payload;
      }
    },
    changeOptions(state, action: PayloadAction<IReportOptions | undefined>) {
      state.dirty = true;
      state.options = action.payload || undefined;
    },
    changeSankeyMode(
      state,
      action: PayloadAction<'between' | 'after' | 'before'>,
    ) {
      state.dirty = true;
      if (!state.options) {
        state.options = {
          type: 'sankey',
          mode: action.payload,
          steps: 5,
          exclude: [],
        };
      } else if (state.options.type === 'sankey') {
        state.options.mode = action.payload;
      }
    },
    changeSankeySteps(state, action: PayloadAction<number>) {
      state.dirty = true;
      if (!state.options) {
        state.options = {
          type: 'sankey',
          mode: 'after',
          steps: action.payload,
          exclude: [],
        };
      } else if (state.options.type === 'sankey') {
        state.options.steps = action.payload;
      }
    },
    changeSankeyExclude(state, action: PayloadAction<string[]>) {
      state.dirty = true;
      if (!state.options) {
        state.options = {
          type: 'sankey',
          mode: 'after',
          steps: 5,
          exclude: action.payload,
        };
      } else if (state.options.type === 'sankey') {
        state.options.exclude = action.payload;
      }
    },
    changeSankeyInclude(state, action: PayloadAction<string[] | undefined>) {
      state.dirty = true;
      if (!state.options) {
        state.options = {
          type: 'sankey',
          mode: 'after',
          steps: 5,
          exclude: [],
          include: action.payload,
        };
      } else if (state.options.type === 'sankey') {
        state.options.include = action.payload;
      }
    },
    changeStacked(state, action: PayloadAction<boolean>) {
      state.dirty = true;
      if (!state.options || state.options.type !== 'histogram') {
        state.options = {
          type: 'histogram',
          stacked: action.payload,
        };
      } else {
        state.options.stacked = action.payload;
      }
    },
    reorderEvents(
      state,
      action: PayloadAction<{ fromIndex: number; toIndex: number }>,
    ) {
      state.dirty = true;
      const { fromIndex, toIndex } = action.payload;
      const [movedEvent] = state.series.splice(fromIndex, 1);
      if (movedEvent) {
        state.series.splice(toIndex, 0, movedEvent);
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
  addSerie,
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
  changeOptions,
  changeSankeyMode,
  changeSankeySteps,
  changeSankeyExclude,
  changeSankeyInclude,
  changeStacked,
  reorderEvents,
} = reportSlice.actions;

export default reportSlice.reducer;
