import { describe, expect, it, mock } from 'bun:test';
import type { ServiceDeps } from './services';
import { getId } from './slug-id';

const MAX_ATTEMPTS = 10;

function dbWithTakenIds(isTaken: (id: string) => boolean) {
  const findUnique = mock(({ where }: { where: { id: string } }) =>
    Promise.resolve(isTaken(where.id) ? { id: where.id } : null)
  );
  const db = { dashboard: { findUnique } } as unknown as ServiceDeps['db'];
  return { db, findUnique };
}

describe('getId', () => {
  it('returns the slug when it is free', async () => {
    const { db } = dbWithTakenIds(() => false);
    expect(await getId({ db }, 'dashboard', 'Overview')).toBe('overview');
  });

  it('suffixes a taken slug', async () => {
    const { db } = dbWithTakenIds((id) => id === 'overview');
    expect(await getId({ db }, 'dashboard', 'Overview')).toMatch(
      /^overview-\d{4}$/
    );
  });

  it('gives up after a bounded number of lookups', async () => {
    const { db, findUnique } = dbWithTakenIds(() => true);
    await expect(getId({ db }, 'dashboard', 'Overview')).rejects.toThrow(
      'Could not generate a unique dashboard id'
    );
    expect(findUnique).toHaveBeenCalledTimes(MAX_ATTEMPTS);
  });
});
