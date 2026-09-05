import { alphabetIds } from '@openpanel/constants';
import { getChartStartEndDate } from '@openpanel/core';
import type {
  IChartEvent,
  IReportInput,
  IReportInputWithDates,
} from '@openpanel/validation';
import { getSettingsForProject } from '../../../organization/organization.service';
import type { SeriesDefinition } from './types';

export type NormalizedInput = IReportInputWithDates & {
  series: SeriesDefinition[];
};

// `mergeGlobalFilters` belongs to the report module (its own task); until it
// moves, reach V1's copy lazily — reports.service imports prisma at load.
function loadGlobalFilterMerge() {
  return import('@openpanel/core').then(
    (m) => m.mergeGlobalFilters
  );
}

type LegacySeriesItem = Partial<IChartEvent> & { type?: string };

function toSeriesDefinition(
  item: LegacySeriesItem,
  index: number
): SeriesDefinition {
  const fallbackId = alphabetIds[index] ?? `series-${index}`;
  if (item && typeof item === 'object' && 'type' in item) {
    return { ...item, id: item.id ?? fallbackId } as SeriesDefinition;
  }
  // Pre-`type` payloads are events.
  return {
    type: 'event',
    id: item.id ?? fallbackId,
    name: item.name || 'unknown_event',
    segment: item.segment ?? 'event',
    filters: item.filters ?? [],
    displayName: item.displayName,
    property: item.property,
  } as SeriesDefinition;
}

/** Resolve the date range in the project's timezone and normalize every series item. */
export async function normalize(input: IReportInput): Promise<NormalizedInput> {
  const { timezone } = await getSettingsForProject(input.projectId);
  const { startDate, endDate } = getChartStartEndDate(
    {
      range: input.range,
      startDate: input.startDate ?? undefined,
      endDate: input.endDate ?? undefined,
    },
    timezone
  );

  // The schema already maps `events` to `series`; older callers may still send `events`.
  const rawSeries: LegacySeriesItem[] =
    (input as { series?: LegacySeriesItem[] }).series ??
    (input as { events?: LegacySeriesItem[] }).events ??
    [];
  const mergeGlobalFilters = await loadGlobalFilterMerge();

  return {
    ...input,
    series: mergeGlobalFilters(
      rawSeries.map(toSeriesDefinition),
      input.globalFilters
    ),
    startDate,
    endDate,
  };
}
