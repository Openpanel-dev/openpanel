import { alphabetIds } from '@openpanel/constants';
import type {
  IChartEvent,
  IChartEventItem,
  IReportInput,
  IReportInputWithDates,
} from '@openpanel/validation';
import { getChartStartEndDate } from '../services/chart.service';
import { getSettingsForProject } from '../services/organization.service';
import type { SeriesDefinition } from './types';

export type NormalizedInput = Awaited<ReturnType<typeof normalize>>;

/**
 * Normalize a chart input into a clean structure with dates and normalized series
 */
export async function normalize(
  input: IReportInput,
): Promise<IReportInputWithDates & { series: SeriesDefinition[] }> {
  const { timezone } = await getSettingsForProject(input.projectId);
  const { startDate, endDate } = getChartStartEndDate(
    {
      range: input.range,
      startDate: input.startDate ?? undefined,
      endDate: input.endDate ?? undefined,
    },
    timezone,
  );

  // Get series from input (handles both 'series' and 'events' fields)
  // The schema preprocessing should have already converted 'events' to 'series', but handle both for safety
  const rawSeries = (input as any).series ?? (input as any).events ?? [];

  // Normalize each series item
  const normalizedSeries: SeriesDefinition[] = rawSeries.map(
    (item: any, index: number) => {
      // If item already has type field, it's the new format
      if (item && typeof item === 'object' && 'type' in item) {
        return {
          ...item,
          id: item.id ?? alphabetIds[index] ?? `series-${index}`,
        } as SeriesDefinition;
      }

      // Old format without type field - assume it's an event
      const event = item as Partial<IChartEvent>;
      return {
        type: 'event',
        id: event.id ?? alphabetIds[index] ?? `series-${index}`,
        name: event.name || 'unknown_event',
        segment: event.segment ?? 'event',
        filters: event.filters ?? [],
        displayName: event.displayName,
        property: event.property,
      } as SeriesDefinition;
    },
  );

  return {
    ...input,
    series: normalizedSeries,
    startDate,
    endDate,
  };
}

