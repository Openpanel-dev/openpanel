import {
  type IChartInput,
  type IChartBreakdown,
  type IChartEvent,
  type IInterval,
} from "@/types";
import { getDaysOldDate } from "@/utils/date";
import { type PayloadAction, createSlice } from "@reduxjs/toolkit";

type InitialState = IChartInput;

// First approach: define the initial state using that type
const initialState: InitialState = {
  name: "screen_view",
  chartType: "linear",
  startDate: getDaysOldDate(7),
  endDate: new Date(),
  interval: "day",
  breakdowns: [],
  events: [],
};

const IDS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"] as const;

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
        id: IDS[state.events.length]!,
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
        id: IDS[state.breakdowns.length]!,
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

    // Date range
    changeStartDate: (state, action: PayloadAction<Date>) => {
      state.startDate = action.payload;
    },

    // Date range
    changeEndDate: (state, action: PayloadAction<Date>) => {
      state.endDate = action.payload;
    },

    changeDateRanges: (state, action: PayloadAction<number | 'today'>) => {
      if(action.payload === 'today') {
        state.startDate = new Date();
        state.endDate = new Date();
        state.startDate.setHours(0,0,0,0)
        state.interval = 'hour'
        return state
      }

      state.startDate = getDaysOldDate(action.payload);
      state.endDate = new Date();

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
} = reportSlice.actions;

export default reportSlice.reducer;
