/**
 * Tests for `isIngestionWoundDown` — the gate that stops ingestion for
 * organizations blocked by the wind-down sequence.
 *
 * Ported from apps/api/src/hooks/subscription.hook.test.ts with M9-004, when
 * V1's `subscriptionHook` moved into the ingest module. Same three behaviours
 * matter: it gates on the wind-down STEP rather than the subscription state
 * (so an expired trial keeps ingesting until it has actually been warned), the
 * caller answers 202 rather than a 4xx (the SDKs retry everything except 401
 * and 2xx), and it fails open. `SELF_HOSTED` is a `selfHosted` argument now —
 * core reads no environment — so V1's `vi.stubEnv` becomes a parameter.
 */

import { beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { Logger } from '../../logger';

const getOrganizationByProjectIdCached = mock(
  async (_projectId: string): Promise<unknown> => null
);

// Spread the real module: a partial factory replaces the whole barrel, and
// every other importer of it then fails on a missing export.
const organizationService = await import(
  '../organization/organization.service'
);
mock.module('../organization/organization.service', () => ({
  ...organizationService,
  getOrganizationByProjectIdCached,
}));

let isIngestionWoundDown: typeof import('./ingest.service').isIngestionWoundDown;

beforeAll(async () => {
  ({ isIngestionWoundDown } = await import('./ingest.service'));
});

function makeLogger() {
  const calls = { info: 0, warn: 0, error: 0 };
  const noop = () => undefined;
  const logger = {
    info: () => {
      calls.info++;
    },
    warn: () => {
      calls.warn++;
    },
    error: () => {
      calls.error++;
    },
    debug: noop,
    trace: noop,
    fatal: noop,
    child: () => logger,
  } as unknown as Logger;
  return { logger, calls };
}

beforeEach(() => {
  getOrganizationByProjectIdCached.mockReset();
});

describe('isIngestionWoundDown', () => {
  for (const windDownStep of ['blocked', 'final_warning']) {
    it(`blocks ingestion at step ${windDownStep}`, async () => {
      getOrganizationByProjectIdCached.mockResolvedValue({
        id: 'org-1',
        windDownStep,
      });
      const { logger } = makeLogger();

      expect(
        await isIngestionWoundDown({
          projectId: 'proj-1',
          selfHosted: false,
          logger,
        })
      ).toBe(true);
      expect(getOrganizationByProjectIdCached).toHaveBeenCalledWith('proj-1');
    });
  }

  for (const windDownStep of ['expired_notice', 'stopping_soon']) {
    it(`still accepts ingestion at step ${windDownStep}`, async () => {
      getOrganizationByProjectIdCached.mockResolvedValue({
        id: 'org-1',
        windDownStep,
      });
      const { logger } = makeLogger();

      expect(
        await isIngestionWoundDown({
          projectId: 'proj-1',
          selfHosted: false,
          logger,
        })
      ).toBe(false);
      expect(getOrganizationByProjectIdCached).toHaveBeenCalled();
    });
  }

  it('accepts ingestion from an expired trial that has not been warned yet', async () => {
    // The reason the gate reads windDownStep and not subscriptionState: every
    // lapsed trial is already trial_expired, so gating on state would block
    // thousands of orgs the moment this ships.
    getOrganizationByProjectIdCached.mockResolvedValue({
      id: 'org-1',
      subscriptionState: 'trial_expired',
      windDownStep: null,
    });
    const { logger } = makeLogger();

    expect(
      await isIngestionWoundDown({
        projectId: 'proj-1',
        selfHosted: false,
        logger,
      })
    ).toBe(false);
  });

  it('fails open when the organization lookup throws', async () => {
    getOrganizationByProjectIdCached.mockRejectedValue(new Error('redis down'));
    const { logger, calls } = makeLogger();

    expect(
      await isIngestionWoundDown({
        projectId: 'proj-1',
        selfHosted: false,
        logger,
      })
    ).toBe(false);
    expect(calls.error).toBe(1);
  });

  it('does nothing when self hosted', async () => {
    const { logger } = makeLogger();

    expect(
      await isIngestionWoundDown({
        projectId: 'proj-1',
        selfHosted: true,
        logger,
      })
    ).toBe(false);
    expect(getOrganizationByProjectIdCached).not.toHaveBeenCalled();
  });

  it('does nothing without a resolved client project', async () => {
    const { logger } = makeLogger();

    expect(
      await isIngestionWoundDown({
        projectId: null,
        selfHosted: false,
        logger,
      })
    ).toBe(false);
    expect(getOrganizationByProjectIdCached).not.toHaveBeenCalled();
  });
});
