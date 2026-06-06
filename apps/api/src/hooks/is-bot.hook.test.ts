/**
 * Tests for isBotHook — the preHandler that filters bot traffic on ingestion.
 *
 * The key behaviour guarded here: requests authenticated with a client secret
 * (server-side SDKs) are never treated as bots, regardless of user agent. Bot
 * detection only applies to public/frontend (origin-authenticated) traffic.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const isBot = vi.fn();
const createBotEvent = vi.fn();

vi.mock('@/bots', () => ({ isBot: (ua: string) => isBot(ua) }));
vi.mock('@openpanel/db', () => ({
  createBotEvent: (...args: unknown[]) => createBotEvent(...args),
}));

const { isBotHook } = await import('./is-bot.hook');

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
    headers: { 'user-agent': 'Googlebot/2.1' },
    client: { projectId: 'proj-1' },
    body: { type: 'track', payload: { properties: { path: '/home' } } },
    ...overrides,
  } as unknown as FastifyRequest;
}

beforeEach(() => {
  isBot.mockReset();
  createBotEvent.mockReset();
});

describe('isBotHook', () => {
  it('skips bot detection entirely for client-secret (server-side) traffic', async () => {
    const req = makeReq({ clientSecretAuth: true });
    const { reply, status } = makeReply();

    await isBotHook(req as never, reply);

    expect(isBot).not.toHaveBeenCalled();
    expect(createBotEvent).not.toHaveBeenCalled();
    expect(status).not.toHaveBeenCalled();
  });

  it('records a bot event and responds 202 for public bot traffic', async () => {
    isBot.mockResolvedValue({ name: 'Googlebot', type: 'Search bot' });
    const req = makeReq();
    const { reply, status } = makeReply();

    await isBotHook(req as never, reply);

    expect(isBot).toHaveBeenCalledWith('Googlebot/2.1');
    expect(createBotEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Googlebot',
        type: 'Search bot',
        projectId: 'proj-1',
        path: '/home',
      }),
    );
    expect(status).toHaveBeenCalledWith(202);
  });

  it('passes legitimate public traffic through untouched', async () => {
    isBot.mockResolvedValue(null);
    const req = makeReq({ headers: { 'user-agent': 'node' } as never });
    const { reply, status } = makeReply();

    const result = await isBotHook(req as never, reply);

    expect(createBotEvent).not.toHaveBeenCalled();
    expect(status).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });
});
