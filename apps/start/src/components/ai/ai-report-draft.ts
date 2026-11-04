// Turns what an AI widget shows into a report the editor opens prefilled, so
// "cost by model" is one click from a saved, shareable, alertable report.

import type {
  AiBreakdownDimension,
  IAiFilters,
} from '@openpanel/core/modules/ai/ai.constants';
import type {
  IChartEventFilter,
  IChartEventItem,
  IChartRange,
  IInterval,
  IReportInput,
} from '@openpanel/core/modules/report/report.constants';

export type ReportDraft = IReportInput & { name: string };

export type AiMeasure =
  | 'cost'
  | 'generations'
  | 'errors'
  | 'tokens'
  | 'p95LatencyMs';

interface DraftScope {
  projectId: string;
  range: IChartRange;
  startDate?: string | null;
  endDate?: string | null;
  interval: IInterval;
  filters: IAiFilters;
}

const AI_EVENT = 'ai_generation';
const USD = '$';

const BREAKDOWN_BY_DIMENSION: Partial<Record<AiBreakdownDimension, string>> = {
  model: 'properties.ai_model',
  provider: 'properties.ai_provider',
  name: 'properties.ai_name',
  profile: 'profile_id',
  conversation: 'properties.ai_conversation_id',
  stopReason: 'properties.ai_stop_reason',
  errorCode: 'properties.ai_error_code',
};

const ERROR_FILTER: IChartEventFilter = {
  name: 'properties.ai_is_error',
  operator: 'is',
  value: ['true'],
};

/** The page's AI filters as the series filters the editor understands. */
export function aiFiltersToChartFilters(
  filters: IAiFilters
): IChartEventFilter[] {
  const out: IChartEventFilter[] = [];
  const add = (name: string, values: string[] | undefined) => {
    if (values && values.length > 0) {
      out.push({ name, operator: 'is', value: values });
    }
  };
  add('properties.ai_model', filters.models);
  add('properties.ai_provider', filters.providers);
  add('properties.ai_name', filters.names);
  add('profile_id', filters.profileId ? [filters.profileId] : undefined);
  add('session_id', filters.sessionId ? [filters.sessionId] : undefined);
  add(
    'properties.ai_conversation_id',
    filters.conversationId ? [filters.conversationId] : undefined
  );
  if (filters.isError) {
    out.push(ERROR_FILTER);
  }
  return out;
}

function measureSeries(
  measure: AiMeasure,
  filters: IChartEventFilter[]
): { series: IChartEventItem[]; unit?: string } {
  const base = { id: 'A', type: 'event' as const, name: AI_EVENT };
  switch (measure) {
    case 'cost':
      return {
        unit: USD,
        series: [
          {
            ...base,
            displayName: 'AI cost',
            segment: 'property_sum',
            property: 'properties.ai_cost',
            filters,
          },
        ],
      };
    case 'tokens':
      return {
        series: [
          {
            ...base,
            displayName: 'Tokens',
            segment: 'property_sum',
            property: 'properties.ai_total_tokens',
            filters,
          },
        ],
      };
    case 'p95LatencyMs':
      return {
        series: [
          {
            ...base,
            displayName: 'Latency p95 (ms)',
            segment: 'property_p95',
            property: 'properties.ai_latency_ms',
            filters,
          },
        ],
      };
    case 'errors':
      return {
        series: [
          {
            ...base,
            displayName: 'Failed generations',
            segment: 'event',
            filters: [...filters, ERROR_FILTER],
          },
        ],
      };
    default:
      return {
        series: [
          { ...base, displayName: 'Generations', segment: 'event', filters },
        ],
      };
  }
}

export function breakdownReportDraft(
  scope: DraftScope,
  input: { dimension: AiBreakdownDimension; measure: AiMeasure; name: string }
): ReportDraft | null {
  const breakdown = BREAKDOWN_BY_DIMENSION[input.dimension];
  if (!breakdown) {
    return null;
  }
  const { series, unit } = measureSeries(
    input.measure,
    aiFiltersToChartFilters(scope.filters)
  );
  return {
    name: input.name,
    projectId: scope.projectId,
    chartType: 'bar',
    interval: scope.interval,
    range: scope.range,
    startDate: scope.startDate,
    endDate: scope.endDate,
    previous: false,
    metric: 'sum',
    series,
    breakdowns: [{ name: breakdown }],
    unit,
  };
}

export type AiMetricKey =
  | 'cost'
  | 'generations'
  | 'users'
  | 'costPerUser'
  | 'inputTokens'
  | 'outputTokens'
  | 'p95LatencyMs'
  | 'errorRate';

export function metricReportDraft(
  scope: DraftScope,
  input: { metric: AiMetricKey; name: string }
): ReportDraft {
  const filters = aiFiltersToChartFilters(scope.filters);
  const base = { type: 'event' as const, name: AI_EVENT, filters };
  const common = {
    name: input.name,
    projectId: scope.projectId,
    chartType: 'linear' as const,
    interval: scope.interval,
    range: scope.range,
    startDate: scope.startDate,
    endDate: scope.endDate,
    previous: true,
    metric: 'sum' as const,
    breakdowns: [],
  };
  switch (input.metric) {
    case 'cost':
      return {
        ...common,
        unit: USD,
        series: [
          {
            ...base,
            id: 'A',
            displayName: 'AI cost',
            segment: 'property_sum',
            property: 'properties.ai_cost',
          },
        ],
      };
    case 'users':
      return {
        ...common,
        series: [{ ...base, id: 'A', displayName: 'Users', segment: 'user' }],
      };
    case 'costPerUser':
      return {
        ...common,
        unit: USD,
        metric: 'average',
        series: [
          {
            ...base,
            id: 'A',
            displayName: 'AI cost',
            segment: 'property_sum',
            property: 'properties.ai_cost',
          },
          { ...base, id: 'B', displayName: 'Users', segment: 'user' },
          {
            id: 'C',
            type: 'formula',
            formula: 'A/B',
            displayName: 'Cost per user',
            hideSeries: ['A', 'B'],
          },
        ],
      };
    case 'inputTokens':
      return {
        ...common,
        series: [
          {
            ...base,
            id: 'A',
            displayName: 'Input tokens',
            segment: 'property_sum',
            property: 'properties.ai_input_tokens',
          },
        ],
      };
    case 'outputTokens':
      return {
        ...common,
        series: [
          {
            ...base,
            id: 'A',
            displayName: 'Output tokens',
            segment: 'property_sum',
            property: 'properties.ai_output_tokens',
          },
        ],
      };
    case 'p95LatencyMs':
      return {
        ...common,
        metric: 'average',
        series: [
          {
            ...base,
            id: 'A',
            displayName: 'Latency p95 (ms)',
            segment: 'property_p95',
            property: 'properties.ai_latency_ms',
          },
        ],
      };
    case 'errorRate':
      return {
        ...common,
        metric: 'average',
        unit: '%',
        series: [
          {
            ...base,
            id: 'A',
            displayName: 'Failed',
            segment: 'event',
            filters: [...filters, ERROR_FILTER],
          },
          { ...base, id: 'B', displayName: 'Generations', segment: 'event' },
          {
            id: 'C',
            type: 'formula',
            formula: 'A/B*100',
            displayName: 'Error rate',
            hideSeries: ['A', 'B'],
          },
        ],
      };
    default:
      return {
        ...common,
        series: [
          { ...base, id: 'A', displayName: 'Generations', segment: 'event' },
        ],
      };
  }
}
