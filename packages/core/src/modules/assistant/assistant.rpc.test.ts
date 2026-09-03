// Only the "is anyone logged in" boundary and the deterministic model-list
// shape are exercised here — no LLM call, no database. `chat.models` reads
// only `process.env` + the static whitelist (assistant.constants.ts);
// wiring the live-model whitelist against real provider keys is out of
// scope for a unit test — see assistant.rpc.ts's header.

import { afterEach, beforeEach, expect, test } from 'bun:test';
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

async function callerWith(session: unknown) {
  const { ctx } = stubHttpCtx({}, session);
  const trpcCtx = await makeTrpcContext(ctx, new Headers(), {
    cookieOptions: COOKIE_OPTIONS,
  });
  return chatRouter.createCaller(trpcCtx);
}

const ORIGINAL_ENV = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
};

beforeEach(() => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
});

afterEach(() => {
  if (ORIGINAL_ENV.OPENAI_API_KEY === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = ORIGINAL_ENV.OPENAI_API_KEY;
  }
  if (ORIGINAL_ENV.ANTHROPIC_API_KEY === undefined) {
    delete process.env.ANTHROPIC_API_KEY;
  } else {
    process.env.ANTHROPIC_API_KEY = ORIGINAL_ENV.ANTHROPIC_API_KEY;
  }
});

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
  process.env.OPENAI_API_KEY = 'sk-test';
  const caller = await callerWith(TEST_SESSION);
  const result = await caller.models();
  expect(result.providers).toEqual({ openai: true, anthropic: false });
  expect(result.models.every((m) => m.group === 'OpenAI')).toBe(true);
  expect(result.defaultModelId).toBe('gpt-4-1-mini');
});
