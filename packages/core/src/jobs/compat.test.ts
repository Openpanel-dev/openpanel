import { describe, expect, test } from 'bun:test';
import { queues } from '../jobs.registry';
import { resolveJob } from './compat';
import { wrap } from './envelope';

// One test per legacy shape, from ADR-005's table. The data is exactly what a
// V1 producer left in Redis; the assertion is the V2 (job name, payload) pair a
// worker must see. Fixtures are shape-only — nothing here validates a payload,
// and nothing in V1 did either.

describe('sessions', () => {
  const payload = {
    name: 'session_end',
    projectId: 'proj_1',
    deviceId: 'dev_1',
    sessionId: 'ses_1',
    profileId: 'prof_1',
  };
  const snapshot = {
    id: 'ses_1',
    project_id: 'proj_1',
    device_id: 'dev_1',
    profile_id: 'prof_1',
    entry_path: '/',
  };

  test('{type:createSessionEnd, payload, snapshot} lands as {event, snapshot}', () => {
    expect(
      resolveJob(queues.sessions, {
        name: 'session',
        data: { type: 'createSessionEnd', payload, snapshot },
      })
    ).toEqual({
      job: 'session',
      // `snapshot` sat BESIDE `payload` on the wire, not inside it — the
      // envelope wraps that, it does not clean it up.
      payload: { event: payload, snapshot },
      meta: {},
    });
  });
});

describe('cron', () => {
  // `payload: undefined` disappears through JSON, so what is actually stored
  // is `{"type":"salt"}` — the hook must resolve both spellings, and it
  // resolves them to the same `null` a V2-enqueued cron job carries.
  test('{type, payload:undefined} keys the job on the type', () => {
    expect(
      resolveJob(queues.cron, { name: 'salt', data: { type: 'salt' } })
    ).toEqual({ job: 'salt', payload: null, meta: {} });

    expect(
      resolveJob(queues.cron, {
        name: 'flushSessions',
        data: { type: 'flushSessions', payload: undefined },
      })
    ).toEqual({ job: 'flushSessions', payload: null, meta: {} });
  });
});

describe('notification', () => {
  test('{type:sendNotification, payload} keeps the wire job name', () => {
    const notification = { projectId: 'proj_1', payload: {} };

    expect(
      resolveJob(queues.notification, {
        name: 'sendNotification',
        data: { type: 'sendNotification', payload: { notification } },
      })
    ).toEqual({
      job: 'sendNotification',
      payload: { notification },
      meta: {},
    });
  });
});

describe('import', () => {
  test('{type:import, payload:{importId}}', () => {
    expect(
      resolveJob(queues.import, {
        name: 'import',
        data: { type: 'import', payload: { importId: 'imp_1' } },
      })
    ).toEqual({ job: 'import', payload: { importId: 'imp_1' }, meta: {} });
  });
});

describe('insights', () => {
  test('{type:insightsProject, payload:{projectId,date}}', () => {
    expect(
      resolveJob(queues.insights, {
        name: 'insightsProject',
        data: {
          type: 'insightsProject',
          payload: { projectId: 'proj_1', date: '2026-09-01' },
        },
      })
    ).toEqual({
      job: 'insightsProject',
      payload: { projectId: 'proj_1', date: '2026-09-01' },
      meta: {},
    });
  });
});

describe('gsc', () => {
  test('both job names live on one queue and stay distinct', () => {
    expect(
      resolveJob(queues.gsc, {
        name: 'gscProjectSync',
        data: { type: 'gscProjectSync', payload: { projectId: 'proj_1' } },
      })
    ).toEqual({
      job: 'gscProjectSync',
      payload: { projectId: 'proj_1' },
      meta: {},
    });

    expect(
      resolveJob(queues.gsc, {
        name: 'gscProjectBackfill',
        data: { type: 'gscProjectBackfill', payload: { projectId: 'proj_1' } },
      })
    ).toEqual({
      job: 'gscProjectBackfill',
      payload: { projectId: 'proj_1' },
      meta: {},
    });
  });
});

describe('cohortCompute', () => {
  // The only V1 payload with no `type` discriminant, and the reason the
  // envelope test is `'payload' in data && 'meta' in data`.
  test('a bare {cohortId} resolves to the cohortCompute job', () => {
    expect(
      resolveJob(queues.cohortCompute, {
        name: 'cohortCompute',
        data: { cohortId: 'coh_1' },
      })
    ).toEqual({
      job: 'cohortCompute',
      payload: { cohortId: 'coh_1' },
      meta: {},
    });
  });
});

describe('the envelope path', () => {
  test('an envelope is taken as-is and keeps the BullMQ job name', () => {
    expect(
      resolveJob(queues.import, {
        name: 'import',
        data: wrap({ importId: 'imp_1' }, { requestId: 'req_1' }),
      })
    ).toEqual({
      job: 'import',
      payload: { importId: 'imp_1' },
      meta: { requestId: 'req_1' },
    });
  });

  test('the compat hook is not consulted for an envelope', () => {
    // A shape no hook recognises, wrapped: it resolves anyway.
    expect(
      resolveJob(queues.sessions, {
        name: 'session',
        data: wrap({ anything: true }, {}),
      })
    ).toEqual({ job: 'session', payload: { anything: true }, meta: {} });
  });
});

describe('unresolvable jobs', () => {
  // V1's cron switch had no `default`: an unknown type completed having done
  // nothing. V2 throws instead (ADR-005 risk 2).
  test.each([
    ['sessions' as const, { nope: true }],
    ['cron' as const, { payload: { a: 1 } }],
    ['notification' as const, 'a string'],
    ['import' as const, null],
    ['insights' as const, { type: 'somethingElse', payload: {} }],
    ['gsc' as const, { type: 'gscSomethingElse', payload: {} }],
    ['cohortCompute' as const, { notACohortId: 'x' }],
  ])('%s throws rather than silently doing nothing', (key, data) => {
    expect(() => resolveJob(queues[key], { name: 'whatever', data })).toThrow(
      /cannot resolve/
    );
  });
});
