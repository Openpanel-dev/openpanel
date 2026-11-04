import { describe, expect, it, mock } from 'bun:test';
import { Glob } from 'bun';
import { readFileSync } from 'node:fs';
import type { ServiceDeps } from './services';
import { getId, RESERVED_PROJECT_IDS } from './slug-id';

const MAX_ATTEMPTS = 10;
const FIXED_SESSION_KEY_SEGMENT = /session:([a-z_]+)[:'"`]/g;

function fixedSessionKeySegmentsInSource(): Set<string> {
  const segments = new Set<string>();
  const sourceDir = import.meta.dir;
  for (const file of new Glob('**/*.ts').scanSync(sourceDir)) {
    if (file.endsWith('.test.ts')) {
      continue;
    }
    const source = readFileSync(`${sourceDir}/${file}`, 'utf8');
    for (const [, segment] of source.matchAll(FIXED_SESSION_KEY_SEGMENT)) {
      if (segment) {
        segments.add(segment);
      }
    }
  }
  return segments;
}

function dbWithTakenIds(isTaken: (id: string) => boolean) {
  const findUnique = mock(({ where }: { where: { id: string } }) =>
    Promise.resolve(isTaken(where.id) ? { id: where.id } : null)
  );
  const db = {
    dashboard: { findUnique },
    project: { findUnique },
  } as unknown as ServiceDeps['db'];
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

  it('never gives a project an id reserved by session buffer keys', async () => {
    const { db } = dbWithTakenIds(() => false);
    expect(await getId({ db }, 'project', 'Wallclock')).toMatch(
      /^wallclock-\d{4}$/
    );
  });

  it('reserves every fixed segment of a session Redis key', () => {
    const segments = fixedSessionKeySegmentsInSource();
    expect(segments.size).toBeGreaterThan(0);
    expect(
      [...segments].filter((segment) => !RESERVED_PROJECT_IDS.has(segment))
    ).toEqual([]);
  });
});
