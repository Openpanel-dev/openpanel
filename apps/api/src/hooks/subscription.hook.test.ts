/**
 * Tests for subscriptionHook — the preHandler that rejects ingestion for
 * organizations blocked by the wind-down sequence.
 *
 * Three behaviours matter enough to pin down: it gates on the wind-down step
 * rather than the subscription state (so an expired trial keeps ingesting
 * until it has actually been warned), it answers 202 rather than a 4xx (the
 * SDKs retry everything except 401 and 2xx), and it fails open.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getOrganizationByProjectIdCached = vi.fn();

vi.mock('@openpanel/db', () => ({
  getOrganizationByProjectIdCached: (projectId: string) =>
    getOrganizationByProjectIdCached(projectId),
}));

const { subscriptionHook } = await import('./subscription.hook');

function makeReply() {
  const status = vi.fn();
  const send = vi.fn();
  const reply = { status, send };
  status.mockReturnValue(reply);
  send.mockReturnValue(reply);
  return { reply: reply as unknown as FastifyReply, status, send };
}

function makeReq(overrides: Partial<FastifyRequest> = {}) {
  return {
    client: { projectId: 'proj-1' },
    log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
    ...overrides,
  } as unknown as FastifyRequest;
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv('SELF_HOSTED', 'false');
  getOrganizationByProjectIdCached.mockReset();
});

describe('subscriptionHook', () => {
  it.each(['blocked', 'final_warning'])(
    'drops ingestion with 202 at step %s',
    async (windDownStep) => {
      getOrganizationByProjectIdCached.mockResolvedValue({
        id: 'org-1',
        windDownStep,
      });
      const { reply, status, send } = makeReply();

      await subscriptionHook(makeReq() as never, reply);

      // 202 rather than 402/403 on purpose: the SDKs treat every other
      // non-2xx as retryable and would hammer this endpoint four times per
      // event.
      expect(status).toHaveBeenCalledWith(202);
      expect(send).toHaveBeenCalledWith({ blocked: true });
    },
  );

  it.each(['expired_notice', 'stopping_soon'])(
    'still accepts ingestion at step %s',
    async (windDownStep) => {
      getOrganizationByProjectIdCached.mockResolvedValue({
        id: 'org-1',
        windDownStep,
      });
      const { reply, status } = makeReply();

      await subscriptionHook(makeReq() as never, reply);

      expect(status).not.toHaveBeenCalled();
    },
  );

  it('accepts ingestion from an expired trial that has not been warned yet', async () => {
    // The reason the gate reads windDownStep and not subscriptionState: every
    // lapsed trial is already trial_expired, so gating on state would block
    // thousands of orgs the moment this ships.
    getOrganizationByProjectIdCached.mockResolvedValue({
      id: 'org-1',
      subscriptionState: 'trial_expired',
      windDownStep: null,
    });
    const { reply, status } = makeReply();

    await subscriptionHook(makeReq() as never, reply);

    expect(status).not.toHaveBeenCalled();
  });

  it('fails open when the organization lookup throws', async () => {
    getOrganizationByProjectIdCached.mockRejectedValue(new Error('redis down'));
    const { reply, status } = makeReply();
    const req = makeReq();

    await subscriptionHook(req as never, reply);

    expect(status).not.toHaveBeenCalled();
    expect(req.log.error).toHaveBeenCalled();
  });

  it('does nothing when self hosted', async () => {
    vi.stubEnv('SELF_HOSTED', 'true');
    const { reply, status } = makeReply();

    await subscriptionHook(makeReq() as never, reply);

    expect(getOrganizationByProjectIdCached).not.toHaveBeenCalled();
    expect(status).not.toHaveBeenCalled();
  });

  it('does nothing without a resolved client', async () => {
    const { reply, status } = makeReply();

    await subscriptionHook(makeReq({ client: null }) as never, reply);

    expect(getOrganizationByProjectIdCached).not.toHaveBeenCalled();
    expect(status).not.toHaveBeenCalled();
  });
});
