import {
  type IChartInput,
  type IChartBreakdown,
  type IChartEvent,
  type IInterval,
  type IChartType,
} from "@/types";
import { alphabetIds } from "@/utils/constants";
import { getDaysOldDate } from "@/utils/date";
import { type PayloadAction, createSlice } from "@reduxjs/toolkit";

type InitialState = IChartInput;

// First approach: define the initial state using that type
const initialState: InitialState = {
  name: "screen_view",
  chartType: "linear",
  startDate: getDaysOldDate(7).toISOString(),
  endDate: new Date().toISOString(),
  interval: "day",
  breakdowns: [],
  events: [],
};

export const reportSlice = createSlice({
  name: "counter",
  initialState,
  reducers: {
    reset() {
      return initialState
    },
    setReport(state, action: PayloadAction<IChartInput>) {     
      return action.payload      
    },
    // Events
    addEvent: (state, action: PayloadAction<Omit<IChartEvent, "id">>) => {
      state.events.push({
        id: alphabetIds[state.events.length]!,
        ...action.payload,
      });
    },
    removeEvent: (
      state,
      action: PayloadAction<{
        id: string;
      }>,
    ) => {
      state.events = state.events.filter(
        (event) => event.id !== action.payload.id,
      );
    },
    changeEvent: (state, action: PayloadAction<IChartEvent>) => {
      state.events = state.events.map((event) => {
        if (event.id === action.payload.id) {
          return action.payload;
        }
        return event;
      });
    },

    // Breakdowns
    addBreakdown: (
      state,
      action: PayloadAction<Omit<IChartBreakdown, "id">>,
    ) => {
      state.breakdowns.push({
        id: alphabetIds[state.breakdowns.length]!,
        ...action.payload,
      });
    },
    removeBreakdown: (
      state,
      action: PayloadAction<{
        id: string;
      }>,
    ) => {
      state.breakdowns = state.breakdowns.filter(
        (event) => event.id !== action.payload.id,
      );
    },
    changeBreakdown: (state, action: PayloadAction<IChartBreakdown>) => {
      state.breakdowns = state.breakdowns.map((breakdown) => {
        if (breakdown.id === action.payload.id) {
          return action.payload;
        }
        return breakdown;
      });
    },

    // Interval
    changeInterval: (state, action: PayloadAction<IInterval>) => {
      state.interval = action.payload;
    },
    
    // Chart type
    changeChartType: (state, action: PayloadAction<IChartType>) => {
      state.chartType = action.payload;
    },

    // Date range
    changeStartDate: (state, action: PayloadAction<string>) => {
      state.startDate = action.payload;
    },

    // Date range
    changeEndDate: (state, action: PayloadAction<string>) => {
      state.endDate = action.payload;
    },

    changeDateRanges: (state, action: PayloadAction<number | 'today'>) => {
      if(action.payload === 'today') {
        const startDate = new Date()
        startDate.setHours(0,0,0,0)

        state.startDate = startDate.toISOString();
        state.endDate = new Date().toISOString();
        state.interval = 'hour'
        return state
      }

      state.startDate = getDaysOldDate(action.payload).toISOString();
      state.endDate = new Date().toISOString()

      if (action.payload === 1) {
        state.interval = "hour";
      } else if (action.payload <= 30) {
        state.interval = "day";
      } else {
        state.interval = "month";
      }
    },
  },
});

// Action creators are generated for each case reducer function
export const {
  reset,
  setReport,
  addEvent,
  removeEvent,
  changeEvent,
  addBreakdown,
  removeBreakdown,
  changeBreakdown,
  changeInterval,
  changeDateRanges,
  changeChartType,
} = reportSlice.actions;

export default reportSlice.reducer;
