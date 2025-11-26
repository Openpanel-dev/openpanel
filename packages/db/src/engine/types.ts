import type {
  IChartBreakdown,
  IChartEvent,
  IChartEventFilter,
  IChartEventItem,
  IChartFormula,
  IChartInput,
  IChartInputWithDates,
} from '@openpanel/validation';

/**
 * Series Definition - The input representation of what the user wants
 * This is what comes from the frontend (events or formulas)
 */
export type SeriesDefinition = IChartEventItem;

/**
 * Concrete Series - A resolved series that will be displayed as a line/bar on the chart
 * When breakdowns exist, one SeriesDefinition can expand into multiple ConcreteSeries
 */
export type ConcreteSeries = {
  id: string;
  definitionId: string; // ID of the SeriesDefinition this came from
  definitionIndex: number; // Index in the original series array (for A, B, C references)
  name: string[]; // Display name parts: ["Session Start", "Chrome"] or ["Formula 1"]
  
  // Context for Drill-down / Profiles
  // This contains everything needed to query 'who are these users?'
  context: {
    event?: string; // Event name (if this is an event series)
    filters: IChartEventFilter[]; // All filters including breakdown value
    breakdownValue?: string; // The breakdown value for this concrete series (deprecated, use breakdowns instead)
    breakdowns?: Record<string, string>; // Breakdown keys and values: { country: 'SE', path: '/ewoqmepwq' }
  };

  // Data points for this series
  data: Array<{
    date: string;
    count: number;
    total_count?: number;
  }>;

  // The original definition (event or formula)
  definition: SeriesDefinition;
};

/**
 * Plan - The execution plan after normalization and expansion
 */
export type Plan = {
  concreteSeries: ConcreteSeries[];
  definitions: SeriesDefinition[];
  input: IChartInputWithDates;
  timezone: string;
};

/**
 * Chart Response - The final output format
 */
export type ChartResponse = {
  series: Array<{
    id: string;
    name: string[];
    data: Array<{
      date: string;
      value: number;
      previous?: number;
    }>;
    summary: {
      total: number;
      average: number;
      min: number;
      max: number;
      count?: number;
    };
    context?: ConcreteSeries['context']; // Include context for drill-down
  }>;
  summary: {
    total: number;
    average: number;
    min: number;
    max: number;
  };
};

