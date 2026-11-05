import { expect, mock, test } from 'bun:test';
import type { ServiceDeps } from '../../../services';
import { fetchCohortsMetadata } from './statement';

test('cohort names are looked up inside the chart project only', async () => {
  const findMany = mock(async () => [{ id: 'c1', name: 'Local cohort' }]);
  const deps = { db: { cohort: { findMany } } } as unknown as ServiceDeps;

  const metadata = await fetchCohortsMetadata(deps, 'proj_1', ['c1', 'c2']);

  expect(findMany).toHaveBeenCalledWith({
    where: { projectId: 'proj_1', id: { in: ['c1', 'c2'] } },
    select: { id: true, name: true },
  });
  expect(metadata.get('c1')?.name).toBe('Local cohort');
  expect(metadata.has('c2')).toBe(false);
});
