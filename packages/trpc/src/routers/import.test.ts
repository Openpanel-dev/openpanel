// The worker's success-path cleanup deletes staged rows by importId. Two
// concurrent retry calls both reading status 'failed' before either writes
// would enqueue two jobs for the same importId, and one finishing could
// delete rows the other has staged but not yet consumed. The retry mutation
// closes that race with an atomic status transition — this pins that only
// one of two concurrent callers can win it.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { dbMock, importQueueMock, getProjectAccessMock } = vi.hoisted(() => ({
  dbMock: {
    import: {
      findUniqueOrThrow: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
  },
  importQueueMock: { add: vi.fn() },
  getProjectAccessMock: vi.fn(),
}));

vi.mock('@openpanel/db', () => ({
  db: dbMock,
  getProjectAccess: getProjectAccessMock,
  canWriteProject: () => true,
  getOrganizationAccess: vi.fn(),
  getProjectById: vi.fn(),
  getClientAccess: vi.fn(),
  runWithAlsSession: (_sessionId: string | null, fn: () => unknown) => fn(),
}));

vi.mock('@openpanel/queue', () => ({
  importQueue: importQueueMock,
}));

const { importRouter } = await import('./import');

const PROJECT_ID = 'project-1';
const IMPORT_ID = 'import-1';

function caller() {
  return importRouter.createCaller({
    session: { userId: 'user-1', session: { id: 'session-1' } },
    req: { log: { info: vi.fn() } },
    res: {},
    setCookie: vi.fn(),
    cookies: {},
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  getProjectAccessMock.mockResolvedValue({
    id: 'access-1',
    userId: 'user-1',
    projectId: PROJECT_ID,
    level: 'write',
  });
  dbMock.import.findUniqueOrThrow.mockResolvedValue({
    id: IMPORT_ID,
    projectId: PROJECT_ID,
    status: 'failed',
  });
  importQueueMock.add.mockResolvedValue({ id: 'job-1' });
  dbMock.import.update.mockResolvedValue({ id: IMPORT_ID, jobId: 'job-1' });
});

describe('import.retry', () => {
  it('enqueues a job when the status transition wins', async () => {
    dbMock.import.updateMany.mockResolvedValue({ count: 1 });

    await caller().retry({ id: IMPORT_ID });

    expect(dbMock.import.updateMany).toHaveBeenCalledWith({
      where: { id: IMPORT_ID, status: 'failed' },
      data: { status: 'pending', errorMessage: null },
    });
    expect(importQueueMock.add).toHaveBeenCalledTimes(1);
  });

  it('does not enqueue a second job when another retry already won the transition', async () => {
    // Simulates the race: by the time this call's updateMany runs, a
    // concurrent retry has already flipped status away from 'failed'.
    dbMock.import.updateMany.mockResolvedValue({ count: 0 });

    await expect(caller().retry({ id: IMPORT_ID })).rejects.toThrow(
      'Only failed imports can be retried'
    );
    expect(importQueueMock.add).not.toHaveBeenCalled();
  });

  it('reverts to failed instead of leaving the import stuck in pending when enqueueing fails', async () => {
    dbMock.import.updateMany.mockResolvedValue({ count: 1 });
    importQueueMock.add.mockRejectedValue(new Error('redis unavailable'));

    await expect(caller().retry({ id: IMPORT_ID })).rejects.toThrow(
      'redis unavailable'
    );

    expect(dbMock.import.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: IMPORT_ID, status: 'failed' },
      data: { status: 'pending', errorMessage: null },
    });
    expect(dbMock.import.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: IMPORT_ID, status: 'pending' },
      data: { status: 'failed' },
    });
    expect(dbMock.import.update).not.toHaveBeenCalled();
  });
});
