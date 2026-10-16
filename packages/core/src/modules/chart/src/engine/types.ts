import type {
  IChartEventFilter,
  IChartEventItem,
  IReportInputWithDates,
} from '../../../report/report.constants';

/** What the user asked for: one event or formula series from the report. */
export type SeriesDefinition = IChartEventItem;

/**
 * One line/bar on the chart. With breakdowns a single SeriesDefinition
 * expands into several ConcreteSeries.
 */
export interface ConcreteSeries {
  id: string;
  /** Id of the SeriesDefinition this came from. */
  definitionId: string;
  /** Index in the report's series array — what formulas reference as A, B, C. */
  definitionIndex: number;
  /** Display name parts: ["Session Start", "Chrome"] or ["Formula 1"]. */
  name: string[];
  /** Everything a drill-down ("who are these users?") needs. */
  context: {
    event?: string;
    /** All filters including the breakdown values. */
    filters: IChartEventFilter[];
    /** @deprecated use `breakdowns` */
    breakdownValue?: string;
    /** `{ country: 'SE', path: '/pricing' }` */
    breakdowns?: Record<string, string>;
  };
  data: Array<{
    date: string;
    count: number;
    total_count?: number;
  }>;
  definition: SeriesDefinition;
}

export interface Plan {
  concreteSeries: ConcreteSeries[];
  definitions: SeriesDefinition[];
  input: IReportInputWithDates;
  timezone: string;
}
