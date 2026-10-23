import { expect, mock, test } from 'bun:test';
import { testCoreConfig } from '../../../../test/config-fixture';
import type { ServiceDeps } from '../../../services';
import { createInsightStore } from './store';

test.each([
  false,
  true,
])('daily candidates preserve activity filters with selfHosted=%s', async (selfHosted) => {
  const findMany = mock(async (_query: unknown) => [{ id: 'project' }]);
  const deps = {
    db: { project: { findMany } },
    prisma: { DbNull: null },
    config: testCoreConfig({ selfHosted }),
  } as unknown as ServiceDeps;

  const result =
    await createInsightStore(deps).listProjectIdsForCadence('daily');

  expect(result).toEqual(['project']);
  expect(findMany).toHaveBeenCalledTimes(1);
  const query = findMany.mock.calls[0]![0] as {
    where: Record<string, unknown>;
    select: unknown;
  };
  expect(query.where).toEqual({
    deleteAt: null,
    eventsCount: { gt: 10_000 },
    updatedAt: { gt: expect.any(Date) },
    ...(selfHosted ? {} : { organization: { subscriptionStatus: 'active' } }),
  });
  expect(query.select).toEqual({ id: true });
});
