// Only the "is anyone logged in" boundary and the deterministic model-list
// shape are exercised here — no LLM call, no database. `chat.models` reads
// only `ctx.config.ai` + the static whitelist (assistant.constants.ts);
// wiring the live-model whitelist against real provider keys is out of
// scope for a unit test — see assistant.rpc.ts's header.

import { expect, test } from 'bun:test';
import { testCoreConfig } from '../../../test/config-fixture';
import { stubHttpCtx, TEST_SESSION } from '../../../test/rpc-fixtures';
import { makeTrpcContext } from '../../rpc/base';
import type { CookieOptions } from '../../shared/cookie';
import { chatRouter } from './assistant.rpc';

const COOKIE_OPTIONS: CookieOptions = {
  domain: '.openpanel.dev',
  secure: true,
  sameSite: 'lax',
  httpOnly: true,
  path: '/',
};

// EMPTY_SESSION's shape (packages/db/src/services/auth-session.service.ts) —
// `TrpcContext.session` is never literally `null`, only its `userId` is.
const EMPTY_SESSION = { session: null, user: null, userId: null };

/** OPENAI_API_KEY / ANTHROPIC_API_KEY arrive as `ctx.config.ai`. */
function configWithKeys(keys: { openai?: string; anthropic?: string }) {
  const base = testCoreConfig();
  return testCoreConfig({
    ai: {
      openai: { ...base.ai.openai, apiKey: keys.openai },
      anthropic: { ...base.ai.anthropic, apiKey: keys.anthropic },
    },
  });
}

async function callerWith(
  session: unknown,
  keys: { openai?: string; anthropic?: string } = {}
) {
  const { ctx } = stubHttpCtx({ config: configWithKeys(keys) }, session);
  const trpcCtx = await makeTrpcContext(ctx, new Headers(), {
    cookieOptions: COOKIE_OPTIONS,
  });
  return chatRouter.createCaller(trpcCtx);
}

test('models rejects an unauthenticated caller before reading provider keys', async () => {
  const caller = await callerWith(EMPTY_SESSION);
  await expect(caller.models()).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
  });
});

test('models returns no models and a null default with no provider keys set', async () => {
  const caller = await callerWith(TEST_SESSION);
  await expect(caller.models()).resolves.toEqual({
    providers: { openai: false, anthropic: false },
    models: [],
    defaultModelId: null,
  });
});

test('models filters to the configured provider and prefers the recorded default', async () => {
  const caller = await callerWith(TEST_SESSION, { openai: 'sk-test' });
  const result = await caller.models();
  expect(result.providers).toEqual({ openai: true, anthropic: false });
  expect(result.models.every((m) => m.group === 'OpenAI')).toBe(true);
  expect(result.defaultModelId).toBe('gpt-4-1-mini');
});
