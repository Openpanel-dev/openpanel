// importRouter.retry must be safe across ambiguous queue enqueue outcomes:
// a lost acknowledgement must not permit two live jobs for one import, and a
// definite enqueue failure must stay retryable. reconcile is the recovery
// path for pending imports with no live job.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { dbMock, importQueueMock, getProjectAccessMock } = vi.hoisted(() => ({
  dbMock: {
    import: {
      findUniqueOrThrow: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
  },
  importQueueMock: {
    add: vi.fn(),
    getJob: vi.fn(),
  },
  getProjectAccessMock: vi.fn(),
}));

vi.mock('@openpanel/db', () => ({
  db: dbMock,
  getProjectAccess: getProjectAccessMock,
  getOrganizationAccess: vi.fn(),
  getClientAccess: vi.fn(),
  getProjectById: vi.fn(),
  canWriteProject: () => true,
  runWithAlsSession: (_sessionId: string | null, fn: () => unknown) => fn(),
}));

vi.mock('@openpanel/queue', () => ({
  importQueue: importQueueMock,
}));

const { importRouter } = await import('./import');

const PROJECT_ID = 'project-1';
const IMPORT_ID = 'import-1';
const JOB_ID = `import-${IMPORT_ID}`;

function caller() {
  return importRouter.createCaller({
    session: { userId: 'user-1', session: { id: 'session-1' } },
    req: { log: { info: vi.fn() } },
    res: {},
    setCookie: vi.fn(),
    cookies: {},
  } as never);
}

function failedImport(overrides = {}) {
  return {
    id: IMPORT_ID,
    projectId: PROJECT_ID,
    status: 'failed',
    jobId: 'old-random-job-id',
    errorMessage: 'boom',
    ...overrides,
  };
}

function liveJob() {
  return { id: JOB_ID, getState: vi.fn().mockResolvedValue('active') };
}

beforeEach(() => {
  vi.clearAllMocks();
  getProjectAccessMock.mockResolvedValue({
    id: 'access-1',
    userId: 'user-1',
    projectId: PROJECT_ID,
    level: 'write',
  });
  importQueueMock.getJob.mockResolvedValue(undefined);
  dbMock.import.update.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({
      ...failedImport(),
      ...data,
    }),
  );
});

describe('import.retry', () => {
  it('enqueues with a deterministic job id and clears a finished job', async () => {
    const finishedJob = {
      id: JOB_ID,
      getState: vi.fn().mockResolvedValue('failed'),
      remove: vi.fn(),
    };
    importQueueMock.getJob.mockResolvedValue(finishedJob);
    importQueueMock.add.mockResolvedValue({ id: JOB_ID });
    dbMock.import.findUniqueOrThrow.mockResolvedValue(failedImport());
    dbMock.import.updateMany.mockResolvedValue({ count: 1 });

    const result = await caller().retry({ id: IMPORT_ID });

    expect(dbMock.import.updateMany).toHaveBeenCalledWith({
      where: { id: IMPORT_ID, status: 'failed' },
      data: { status: 'pending', errorMessage: null },
    });
    expect(finishedJob.remove).toHaveBeenCalled();
    expect(importQueueMock.add).toHaveBeenCalledWith(
      'import',
      { type: 'import', payload: { importId: IMPORT_ID } },
      { jobId: JOB_ID },
    );
    expect(result).toMatchObject({ jobId: JOB_ID });
  });

  it('adopts a live job instead of enqueueing a duplicate', async () => {
    const job = liveJob();
    importQueueMock.getJob.mockResolvedValue(job);
    dbMock.import.findUniqueOrThrow.mockResolvedValue(failedImport());
    dbMock.import.updateMany.mockResolvedValue({ count: 1 });

    const result = await caller().retry({ id: IMPORT_ID });

    expect(importQueueMock.add).not.toHaveBeenCalled();
    expect(dbMock.import.update).toHaveBeenCalledWith({
      where: { id: IMPORT_ID },
      data: { jobId: JOB_ID },
    });
    expect(result).toMatchObject({ jobId: JOB_ID });
  });

  it('adopts the persisted job on an ambiguous enqueue outcome', async () => {
    dbMock.import.findUniqueOrThrow.mockResolvedValue(failedImport());
    dbMock.import.updateMany.mockResolvedValue({ count: 1 });
    importQueueMock.getJob
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(liveJob());
    importQueueMock.add.mockRejectedValue(new Error('Command timed out'));

    const result = await caller().retry({ id: IMPORT_ID });

    expect(result).toMatchObject({ jobId: JOB_ID });
    expect(dbMock.import.updateMany).toHaveBeenCalledTimes(1);
  });

  it('reverts to failed on a definite enqueue failure', async () => {
    dbMock.import.findUniqueOrThrow.mockResolvedValue(failedImport());
    dbMock.import.updateMany.mockResolvedValue({ count: 1 });
    importQueueMock.add.mockRejectedValue(new Error('Connection is closed'));

    await expect(caller().retry({ id: IMPORT_ID })).rejects.toThrow(
      'Connection is closed',
    );
    expect(dbMock.import.updateMany).toHaveBeenCalledWith({
      where: { id: IMPORT_ID, status: 'pending' },
      data: { status: 'failed', errorMessage: 'boom' },
    });
  });

  it('rejects non-failed imports without touching the queue', async () => {
    dbMock.import.findUniqueOrThrow.mockResolvedValue(
      failedImport({ status: 'pending' }),
    );
    dbMock.import.updateMany.mockResolvedValue({ count: 0 });

    await expect(caller().retry({ id: IMPORT_ID })).rejects.toThrow(
      'Only failed imports can be retried',
    );
    expect(importQueueMock.getJob).not.toHaveBeenCalled();
    expect(importQueueMock.add).not.toHaveBeenCalled();
  });
});

describe('import.reconcile', () => {
  it('marks a pending import with no live job as failed for retry', async () => {
    dbMock.import.findUniqueOrThrow.mockResolvedValue(
      failedImport({ status: 'pending', jobId: null, errorMessage: null }),
    );
    dbMock.import.updateMany.mockResolvedValue({ count: 1 });

    const result = await caller().reconcile({ id: IMPORT_ID });

    expect(result).toEqual({ status: 'failed', action: 'marked-failed' });
    expect(dbMock.import.updateMany).toHaveBeenCalledWith({
      where: { id: IMPORT_ID, status: 'pending' },
      data: {
        status: 'failed',
        errorMessage: expect.stringContaining('No live import job found'),
      },
    });
  });

  it('leaves a pending import with a live job alone', async () => {
    dbMock.import.findUniqueOrThrow.mockResolvedValue(
      failedImport({ status: 'pending', jobId: JOB_ID }),
    );
    importQueueMock.getJob.mockResolvedValue(liveJob());

    const result = await caller().reconcile({ id: IMPORT_ID });

    expect(result).toEqual({ status: 'pending', action: 'adopted' });
    expect(dbMock.import.updateMany).not.toHaveBeenCalled();
    expect(dbMock.import.update).not.toHaveBeenCalled();
  });

  it('leaves a pending import whose job completed for manual review', async () => {
    dbMock.import.findUniqueOrThrow.mockResolvedValue(
      failedImport({ status: 'pending', jobId: JOB_ID }),
    );
    importQueueMock.getJob.mockResolvedValue({
      id: JOB_ID,
      getState: vi.fn().mockResolvedValue('completed'),
    });

    const result = await caller().reconcile({ id: IMPORT_ID });

    expect(result).toEqual({ status: 'pending', action: 'none' });
    expect(dbMock.import.updateMany).not.toHaveBeenCalled();
  });

  it('ignores non-pending imports', async () => {
    dbMock.import.findUniqueOrThrow.mockResolvedValue(failedImport());

    const result = await caller().reconcile({ id: IMPORT_ID });

    expect(result).toEqual({ status: 'failed', action: 'none' });
    expect(importQueueMock.getJob).not.toHaveBeenCalled();
    expect(dbMock.import.updateMany).not.toHaveBeenCalled();
  });
});
