import { slug } from '@openpanel/common';
import { alphabetIds } from '@openpanel/constants';
import type { IChartEventItem } from '@openpanel/validation';
import type { ServiceDeps } from '../../../../services';
import { getSettingsForProject } from '../../../organization/organization.service';
import type { NormalizedInput } from './normalize';
import type { ConcreteSeries, Plan } from './types';

/**
 * One placeholder per event definition; breakdown expansion happens in fetch.
 * Formulas are derived from event series, so they only exist after compute.
 */
export async function plan(
  deps: ServiceDeps,
  normalized: NormalizedInput
): Promise<Plan> {
  const { timezone } = await getSettingsForProject(deps, normalized.projectId);

  const concreteSeries: ConcreteSeries[] = [];
  normalized.series.forEach((definition, index) => {
    if (definition.type !== 'event') {
      return;
    }
    const event = definition as IChartEventItem & { type: 'event' };
    concreteSeries.push({
      id: `${slug(event.name)}-${event.id ?? index}`,
      definitionId: event.id ?? alphabetIds[index] ?? `series-${index}`,
      definitionIndex: index,
      name: [event.displayName || event.name],
      context: {
        event: event.name,
        filters: [...event.filters],
      },
      data: [],
      definition,
    });
  });

  return {
    concreteSeries,
    definitions: normalized.series,
    input: normalized,
    timezone,
  };
}
