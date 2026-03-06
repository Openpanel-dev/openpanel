import { getRedisCache } from '@openpanel/redis';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSafeJson } from '@openpanel/json';
import type { IClickhouseProfile } from '../services/profile.service';

// Mock chQuery to avoid hitting real ClickHouse
vi.mock('../clickhouse/client', () => ({
  ch: {
    insert: vi.fn().mockResolvedValue(undefined),
  },
  chQuery: vi.fn().mockResolvedValue([]),
  TABLE_NAMES: {
    profiles: 'profiles',
  },
}));

import { ProfileBuffer } from './profile-buffer';
import { chQuery } from '../clickhouse/client';

const redis = getRedisCache();

function makeProfile(overrides: Partial<IClickhouseProfile>): IClickhouseProfile {
  return {
    id: 'profile-1',
    project_id: 'project-1',
    first_name: '',
    last_name: '',
    email: '',
    avatar: '',
    properties: {},
    is_external: true,
    created_at: new Date().toISOString(),
    groups: [],
    ...overrides,
  };
}

beforeEach(async () => {
  await redis.flushdb();
  vi.mocked(chQuery).mockResolvedValue([]);
});

afterAll(async () => {
  try {
    await redis.quit();
  } catch {}
});

describe('ProfileBuffer', () => {
  let profileBuffer: ProfileBuffer;

  beforeEach(() => {
    profileBuffer = new ProfileBuffer();
  });

  it('adds a profile to the buffer', async () => {
    const profile = makeProfile({ first_name: 'John', email: 'john@example.com' });

    const sizeBefore = await profileBuffer.getBufferSize();
    await profileBuffer.add(profile);
    const sizeAfter = await profileBuffer.getBufferSize();

    expect(sizeAfter).toBe(sizeBefore + 1);
  });

  it('merges subsequent updates via cache (sequential calls)', async () => {
    const identifyProfile = makeProfile({
      first_name: 'John',
      email: 'john@example.com',
      groups: [],
    });

    const groupProfile = makeProfile({
      first_name: '',
      email: '',
      groups: ['group-abc'],
    });

    // Sequential: identify first, then group
    await profileBuffer.add(identifyProfile);
    await profileBuffer.add(groupProfile);

    // Second add should read the cached identify profile and merge groups in
    const cached = await profileBuffer.fetchFromCache('profile-1', 'project-1');
    expect(cached?.first_name).toBe('John');
    expect(cached?.email).toBe('john@example.com');
    expect(cached?.groups).toContain('group-abc');
  });

  it('race condition: concurrent identify + group calls preserve all data', async () => {
    const identifyProfile = makeProfile({
      first_name: 'John',
      email: 'john@example.com',
      groups: [],
    });

    const groupProfile = makeProfile({
      first_name: '',
      email: '',
      groups: ['group-abc'],
    });

    // Both calls run concurrently — the per-profile lock serializes them so the
    // second one reads the first's result from cache and merges correctly.
    await Promise.all([
      profileBuffer.add(identifyProfile),
      profileBuffer.add(groupProfile),
    ]);

    const cached = await profileBuffer.fetchFromCache('profile-1', 'project-1');

    expect(cached?.first_name).toBe('John');
    expect(cached?.email).toBe('john@example.com');
    expect(cached?.groups).toContain('group-abc');
  });

  it('race condition: concurrent writes produce one merged buffer entry', async () => {
    const identifyProfile = makeProfile({
      first_name: 'John',
      email: 'john@example.com',
      groups: [],
    });

    const groupProfile = makeProfile({
      first_name: '',
      email: '',
      groups: ['group-abc'],
    });

    const sizeBefore = await profileBuffer.getBufferSize();

    await Promise.all([
      profileBuffer.add(identifyProfile),
      profileBuffer.add(groupProfile),
    ]);

    const sizeAfter = await profileBuffer.getBufferSize();

    // The second add merges into the first — only 2 buffer entries total
    // (one from identify, one merged update with group)
    expect(sizeAfter).toBe(sizeBefore + 2);

    // The last entry in the buffer should have both name and group
    const rawEntries = await redis.lrange('profile-buffer', 0, -1);
    const entries = rawEntries.map((e) => getSafeJson<IClickhouseProfile>(e));
    const lastEntry = entries[entries.length - 1];

    expect(lastEntry?.first_name).toBe('John');
    expect(lastEntry?.groups).toContain('group-abc');
  });
});
