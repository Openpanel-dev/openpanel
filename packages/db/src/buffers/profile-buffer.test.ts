import { getRedisCache } from '@openpanel/redis';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
  const keys = [
    ...await redis.keys('profile*'),
    ...await redis.keys('lock:profile'),
  ];
  if (keys.length > 0) await redis.del(...keys);
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

  it('concurrent adds: both raw profiles are queued', async () => {
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

    // Both raw profiles are queued; merge happens at flush time
    expect(sizeAfter).toBe(sizeBefore + 2);
  });

  it('merges sequential updates for the same profile at flush time', async () => {
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

    await profileBuffer.add(identifyProfile);
    await profileBuffer.add(groupProfile);
    await profileBuffer.processBuffer();

    const cached = await profileBuffer.fetchFromCache('profile-1', 'project-1');
    expect(cached?.first_name).toBe('John');
    expect(cached?.email).toBe('john@example.com');
    expect(cached?.groups).toContain('group-abc');
  });

  it('merges concurrent updates for the same profile at flush time', async () => {
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

    await Promise.all([
      profileBuffer.add(identifyProfile),
      profileBuffer.add(groupProfile),
    ]);
    await profileBuffer.processBuffer();

    const cached = await profileBuffer.fetchFromCache('profile-1', 'project-1');
    expect(cached?.first_name).toBe('John');
    expect(cached?.email).toBe('john@example.com');
    expect(cached?.groups).toContain('group-abc');
  });

  it('uses existing ClickHouse data for cache misses when merging', async () => {
    const existingInClickhouse = makeProfile({
      first_name: 'Jane',
      email: 'jane@example.com',
      groups: ['existing-group'],
    });
    vi.mocked(chQuery).mockResolvedValue([existingInClickhouse]);

    const incomingProfile = makeProfile({
      first_name: '',
      email: '',
      groups: ['new-group'],
    });

    await profileBuffer.add(incomingProfile);
    await profileBuffer.processBuffer();

    const cached = await profileBuffer.fetchFromCache('profile-1', 'project-1');
    expect(cached?.first_name).toBe('Jane');
    expect(cached?.email).toBe('jane@example.com');
    expect(cached?.groups).toContain('existing-group');
    expect(cached?.groups).toContain('new-group');
  });

  it('buffer is empty after flush', async () => {
    await profileBuffer.add(makeProfile({ first_name: 'John' }));
    expect(await profileBuffer.getBufferSize()).toBe(1);

    await profileBuffer.processBuffer();

    expect(await profileBuffer.getBufferSize()).toBe(0);
  });

  it('retains profiles in queue when ClickHouse insert fails', async () => {
    await profileBuffer.add(makeProfile({ first_name: 'John' }));

    const { ch } = await import('../clickhouse/client');
    const insertSpy = vi
      .spyOn(ch, 'insert')
      .mockRejectedValueOnce(new Error('ClickHouse unavailable'));

    await profileBuffer.processBuffer();

    // Profiles must still be in the queue — not lost
    expect(await profileBuffer.getBufferSize()).toBe(1);

    insertSpy.mockRestore();
  });

  it('proceeds with insert when ClickHouse fetch fails (treats profiles as new)', async () => {
    vi.mocked(chQuery).mockRejectedValueOnce(new Error('ClickHouse unavailable'));

    const { ch } = await import('../clickhouse/client');
    const insertSpy = vi
      .spyOn(ch, 'insert')
      .mockResolvedValueOnce(undefined as any);

    await profileBuffer.add(makeProfile({ first_name: 'John' }));
    await profileBuffer.processBuffer();

    // Insert must still have been called — no data loss even when fetch fails
    expect(insertSpy).toHaveBeenCalled();
    expect(await profileBuffer.getBufferSize()).toBe(0);

    insertSpy.mockRestore();
  });
});
