import { slug } from '@openpanel/common';
import { alphabetIds } from '@openpanel/constants';
import type {
  IChartBreakdown,
  IChartEvent,
  IChartEventItem,
} from '@openpanel/validation';
import { getSettingsForProject } from '../services/organization.service';
import type { ConcreteSeries, Plan } from './types';
import type { NormalizedInput } from './normalize';

/**
 * Create an execution plan from normalized input
 * This sets up ConcreteSeries placeholders - actual breakdown expansion happens during fetch
 */
export async function plan(
  normalized: NormalizedInput,
): Promise<Plan> {
  const { timezone } = await getSettingsForProject(normalized.projectId);

  const concreteSeries: ConcreteSeries[] = [];

  // Create concrete series placeholders for each definition
  normalized.series.forEach((definition, index) => {
    if (definition.type === 'event') {
      const event = definition as IChartEventItem & { type: 'event' };
      
      // For events, create a placeholder
      // If breakdowns exist, fetch will return multiple series (one per breakdown value)
      // If no breakdowns, fetch will return one series
      const concrete: ConcreteSeries = {
        id: `${slug(event.name)}-${event.id ?? index}`,
        definitionId: event.id ?? alphabetIds[index] ?? `series-${index}`,
        definitionIndex: index,
        name: [event.displayName || event.name],
        context: {
          event: event.name,
          filters: [...event.filters],
        },
        data: [], // Will be populated by fetch stage
        definition,
      };
      concreteSeries.push(concrete);
    } else {
      // For formulas, we'll create placeholders during compute stage
      // Formulas depend on event series, so we skip them here
    }
  });

  return {
    concreteSeries,
    definitions: normalized.series,
    input: normalized,
    timezone,
  };
}

export type NormalizedInput = Awaited<ReturnType<typeof import('./normalize').normalize>>;

