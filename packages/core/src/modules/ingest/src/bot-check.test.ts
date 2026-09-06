/**
 * Tests for checkIngestBot — the bot filter V1 runs as `isBotHook` on
 * ingestion (apps/api/src/hooks/is-bot.hook.test.ts, moved with M8-002).
 *
 * The key behaviour guarded here: requests authenticated with a client secret
 * (server-side SDKs) are never treated as bots, regardless of user agent. Bot
 * detection only applies to public/frontend (origin-authenticated) traffic.
 */

import { beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { BotMatch } from './bots/detect';

const isBot = mock(async (_ua: string): Promise<BotMatch | null> => null);
const createBotEvent = mock(
  async (_deps: unknown, _payload: unknown) => undefined
);

let checkIngestBot: typeof import('../ingest.service').checkIngestBot;

// M10-005: `checkIngestBot` takes `ServiceDeps` first and hands it to
// `createBotEvent`, which is mocked below — nothing here reads a client.
const deps = {} as unknown as import('../../../services').ServiceDeps;

// Spread the real modules and override by name: ingest.service re-exports
// `detectBot` and reaches more of event.service than `createBotEvent`, and a
// factory returning only the overrides makes those exports vanish under
// `--isolate`.
beforeAll(async () => {
  const detect = await import('./bots/detect');
  const eventService = await import('../../event/event.service');
  mock.module('./bots/detect', () => ({ ...detect, isBot }));
  mock.module('../../event/event.service', () => ({
    ...eventService,
    createBotEvent,
  }));
  ({ checkIngestBot } = await import('../ingest.service'));
});

const baseRequest = {
  headers: { 'user-agent': 'Googlebot/2.1' },
  clientSecretAuth: false,
  projectId: 'proj-1',
  body: { type: 'track', payload: { properties: { path: '/home' } } },
};

beforeEach(() => {
  isBot.mockReset();
  createBotEvent.mockReset();
});

describe('checkIngestBot', () => {
  it('skips bot detection entirely for client-secret (server-side) traffic', async () => {
    const bot = await checkIngestBot(deps, {
      ...baseRequest,
      clientSecretAuth: true,
    });

    expect(isBot).not.toHaveBeenCalled();
    expect(createBotEvent).not.toHaveBeenCalled();
    expect(bot).toBeNull();
  });

  it('records a bot event and reports the bot for public bot traffic', async () => {
    isBot.mockResolvedValue({ name: 'Googlebot', type: 'Search bot' });

    const bot = await checkIngestBot(deps, baseRequest);

    expect(isBot).toHaveBeenCalledWith('Googlebot/2.1');
    expect(createBotEvent).toHaveBeenCalledTimes(1);
    expect(createBotEvent.mock.calls[0]?.[1]).toMatchObject({
      name: 'Googlebot',
      type: 'Search bot',
      projectId: 'proj-1',
      path: '/home',
    });
    expect(bot).toEqual({ name: 'Googlebot', type: 'Search bot' });
  });

  it('passes legitimate public traffic through untouched', async () => {
    isBot.mockResolvedValue(null);

    const bot = await checkIngestBot(deps, {
      ...baseRequest,
      headers: { 'user-agent': 'node' },
    });

    expect(createBotEvent).not.toHaveBeenCalled();
    expect(bot).toBeNull();
  });
});
