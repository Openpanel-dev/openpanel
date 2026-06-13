/**
 * Tests for duplicateHook — the preValidation hook that drops events whose
 * body hash was already seen within a short (100 ms) window.
 *
 * The key behaviour guarded here: replays (chunked) and batch envelopes
 * (offline-first SDKs retry whole batches) are NEVER run through the dedup
 * check — otherwise a retried batch would be silently dropped and answered
 * with `200 'Duplicate event'` instead of the `202 { accepted, rejected }`
 * batch shape its consumers parse.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const isDuplicatedEvent = vi.fn();

vi.mock('@/utils/deduplicate', () => ({
  isDuplicatedEvent: (...args: unknown[]) => isDuplicatedEvent(...args),
}));

const { duplicateHook } = await import('./duplicate.hook');

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
    method: 'POST',
    clientIp: '1.2.3.4',
    headers: {
      origin: 'https://app.example.com',
      'openpanel-client-id': 'proj-1',
    },
    body: { type: 'track', payload: { name: 'page_view' } },
    ...overrides,
  } as unknown as FastifyRequest;
}

beforeEach(() => {
  isDuplicatedEvent.mockReset();
});

describe('duplicateHook', () => {
  it('skips dedup for batch envelopes even when the body would be a duplicate', async () => {
    // getLock/isDuplicatedEvent would report a duplicate — but batches must
    // never be checked, so it should not even be consulted.
    isDuplicatedEvent.mockResolvedValue(true);
    const req = makeReq({
      body: { type: 'batch', payload: [{ type: 'track', payload: {} }] },
    } as Partial<FastifyRequest>);
    const { reply, status } = makeReply();

    await duplicateHook(req as never, reply);

    expect(isDuplicatedEvent).not.toHaveBeenCalled();
    expect(status).not.toHaveBeenCalled();
  });

  it('skips dedup for replay events', async () => {
    isDuplicatedEvent.mockResolvedValue(true);
    const req = makeReq({
      body: { type: 'replay', payload: {} },
    } as Partial<FastifyRequest>);
    const { reply, status } = makeReply();

    await duplicateHook(req as never, reply);

    expect(isDuplicatedEvent).not.toHaveBeenCalled();
    expect(status).not.toHaveBeenCalled();
  });

  it('answers 200 "Duplicate event" for a duplicate single event', async () => {
    isDuplicatedEvent.mockResolvedValue(true);
    const req = makeReq();
    const { reply, status, send } = makeReply();

    await duplicateHook(req as never, reply);

    expect(isDuplicatedEvent).toHaveBeenCalledTimes(1);
    expect(status).toHaveBeenCalledWith(200);
    expect(send).toHaveBeenCalledWith('Duplicate event');
  });

  it('passes through a non-duplicate single event', async () => {
    isDuplicatedEvent.mockResolvedValue(false);
    const req = makeReq();
    const { reply, status } = makeReply();

    await duplicateHook(req as never, reply);

    expect(isDuplicatedEvent).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
  });

  it('skips dedup when origin is absent (server-side traffic)', async () => {
    isDuplicatedEvent.mockResolvedValue(true);
    const req = makeReq({
      headers: { 'openpanel-client-id': 'proj-1' },
    } as Partial<FastifyRequest>);
    const { reply, status } = makeReply();

    await duplicateHook(req as never, reply);

    expect(isDuplicatedEvent).not.toHaveBeenCalled();
    expect(status).not.toHaveBeenCalled();
  });
});
