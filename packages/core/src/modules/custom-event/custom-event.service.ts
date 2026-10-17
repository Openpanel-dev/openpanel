import type { CustomEvent } from '@openpanel/db/src/prisma-client';
import { cacheablePerDeps } from '../../cacheable-per-deps';
import { TRPCBadRequestError, TRPCNotFoundError } from '../../rpc/errors';
import type { ServiceDeps, Services } from '../../services';
import type { IChartSeries } from '../report/report.constants';
import type {
  ICustomEventInput,
  ICustomEventUpdate,
} from './custom-event.constants';

export type IServiceCustomEvent = CustomEvent;

const CUSTOM_EVENTS_CACHE_NAME = 'getCustomEvents';
const CUSTOM_EVENTS_CACHE_SECONDS = 60 * 5;

function listCustomEvents(
  deps: ServiceDeps,
  projectId: string
): Promise<CustomEvent[]> {
  return deps.db.customEvent.findMany({
    where: { projectId },
    orderBy: { name: 'asc' },
  });
}

const listCustomEventsCached = cacheablePerDeps(
  CUSTOM_EVENTS_CACHE_NAME,
  listCustomEvents,
  CUSTOM_EVENTS_CACHE_SECONDS
);

async function assertNameIsFree(
  deps: ServiceDeps,
  input: { projectId: string; name: string; id?: string }
): Promise<void> {
  const existing = await deps.db.customEvent.findFirst({
    where: {
      projectId: input.projectId,
      name: input.name,
      id: input.id ? { not: input.id } : undefined,
    },
    select: { id: true },
  });
  if (existing) {
    throw new TRPCBadRequestError(
      `A custom event named "${input.name}" already exists`
    );
  }
}

async function createCustomEvent(
  deps: ServiceDeps,
  input: ICustomEventInput
): Promise<CustomEvent> {
  await assertNameIsFree(deps, input);
  const created = await deps.db.customEvent.create({ data: input });
  await listCustomEventsCached.clear(deps, input.projectId);
  return created;
}

async function updateCustomEvent(
  deps: ServiceDeps,
  { id, projectId, name, items }: ICustomEventUpdate
): Promise<CustomEvent> {
  await assertNameIsFree(deps, { id, projectId, name });
  const updated = await deps.db.customEvent.update({
    where: { id, projectId },
    data: { name, items },
  });
  await listCustomEventsCached.clear(deps, projectId);
  return updated;
}

async function deleteCustomEvent(
  deps: ServiceDeps,
  input: { id: string; projectId: string }
): Promise<void> {
  await deps.db.customEvent.delete({
    where: { id: input.id, projectId: input.projectId },
  });
  await listCustomEventsCached.clear(deps, input.projectId);
}

/**
 * Resolves every series that references a custom event to its current
 * definition. Series without one pass through untouched and cost no lookup.
 */
export async function expandCustomEvents(
  deps: ServiceDeps,
  projectId: string,
  series: IChartSeries
): Promise<IChartSeries> {
  const referencesCustomEvent = series.some(
    (item) => item.type === 'event' && item.customEventId
  );
  if (!referencesCustomEvent) {
    return series;
  }

  const customEvents = await listCustomEventsCached(deps, projectId);
  return series.map((item) => {
    if (item.type !== 'event' || !item.customEventId) {
      return item;
    }
    const customEvent = customEvents.find(
      (candidate) => candidate.id === item.customEventId
    );
    if (!customEvent) {
      throw new TRPCNotFoundError(
        `Custom event "${item.name}" no longer exists`
      );
    }
    return { ...item, name: customEvent.name, anyOf: customEvent.items };
  });
}

export function createCustomEventService(
  deps: ServiceDeps,
  _services: () => Services
) {
  return {
    list: (projectId: string): Promise<CustomEvent[]> =>
      listCustomEventsCached(deps, projectId),
    create: (input: ICustomEventInput): Promise<CustomEvent> =>
      createCustomEvent(deps, input),
    update: (input: ICustomEventUpdate): Promise<CustomEvent> =>
      updateCustomEvent(deps, input),
    delete: (input: { id: string; projectId: string }): Promise<void> =>
      deleteCustomEvent(deps, input),
    expand: (projectId: string, series: IChartSeries): Promise<IChartSeries> =>
      expandCustomEvents(deps, projectId, series),
  };
}
