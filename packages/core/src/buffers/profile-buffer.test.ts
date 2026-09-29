import { afterAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import { getRedisCache } from '@openpanel/redis';
import { bufferDepsWithCh } from '../../test/buffer-fixtures';
import type { IClickhouseProfile } from '../modules/profile/profile.service';

// The client comes in as `BufferDeps.ch` and reads go through core's own
// `chQuery` — see event-buffer.test.ts's header.
const realChQuery = { ...(await import('../ch-query')) };

const chInsert = mock(async (_options: unknown): Promise<unknown> => undefined);
const chQuery = mock(async (_sql: string): Promise<IClickhouseProfile[]> => []);

mock.module('../ch-query', () => ({
  ...realChQuery,
  chQuery: (_scope: unknown, sql: string) => chQuery(sql),
}));

const { ProfileBuffer } = await import('./profile-buffer');
type ProfileBuffer = InstanceType<typeof ProfileBuffer>;

const redis = getRedisCache();

function makeProfile(
  overrides: Partial<IClickhouseProfile>
): IClickhouseProfile {
  const now = new Date().toISOString();
  return {
    id: 'profile-1',
    project_id: 'project-1',
    first_name: '',
    last_name: '',
    email: '',
    avatar: '',
    properties: {},
    is_external: true,
    created_at: now,
    last_seen_at: now,
    groups: [],
    ...overrides,
  };
}

beforeEach(async () => {
  const keys = [
    ...(await redis.keys('profile*')),
    ...(await redis.keys('lock:profile')),
  ];
  if (keys.length > 0) {
    await redis.del(...keys);
  }
  chInsert.mockClear();
  chQuery.mockReset();
  chQuery.mockResolvedValue([]);
});

// The shared `getRedisCache()` client is deliberately NOT quit here: bun runs
// every file in one process, and closing the singleton takes it away from the
// files that run next.
afterAll(() => {
  mock.module('../ch-query', () => realChQuery);
});

describe('ProfileBuffer', () => {
  let profileBuffer: ProfileBuffer;

  beforeEach(() => {
    profileBuffer = new ProfileBuffer(bufferDepsWithCh({ insert: chInsert }));
  });

  it('adds a profile to the buffer', async () => {
    const profile = makeProfile({
      first_name: 'John',
      email: 'john@example.com',
    });

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
    chQuery.mockResolvedValue([existingInClickhouse]);

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

    chInsert.mockRejectedValueOnce(new Error('ClickHouse unavailable'));

    // Errors propagate to tryFlush (which resyncs the counter). The safety
    // property — queue preserved on CH failure — still holds.
    await expect(profileBuffer.processBuffer()).rejects.toThrow(
      'ClickHouse unavailable'
    );
    expect(await profileBuffer.getBufferSize()).toBe(1);
  });

  it('proceeds with insert when ClickHouse fetch fails (treats profiles as new)', async () => {
    chQuery.mockRejectedValueOnce(new Error('ClickHouse unavailable'));

    await profileBuffer.add(makeProfile({ first_name: 'John' }));
    await profileBuffer.processBuffer();

    // Insert must still have been called — no data loss even when fetch fails
    expect(chInsert).toHaveBeenCalled();
    expect(await profileBuffer.getBufferSize()).toBe(0);
  });
});
