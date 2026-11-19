import { afterAll, beforeAll, expect, test } from 'bun:test';
import { streamText } from 'ai';
import { testCoreConfig } from '../../../../test/config-fixture';
import { CHAT_MODELS } from '../assistant.constants';
import { reasoningProviderOptions, resolveChatModel } from './providers';

const NOT_FOUND = 404;

let server: ReturnType<typeof Bun.serve>;
let captured: { body: Record<string, unknown>; headers: Headers } | null = null;

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch: async (request) => {
      captured = {
        body: (await request.json()) as Record<string, unknown>,
        headers: request.headers,
      };
      return new Response('', { status: NOT_FOUND });
    },
  });
});

afterAll(() => {
  server.stop(true);
});

// A thinking block replayed after any change to the conversation before it is
// a 400 unless the request opts into dropping it instead.
test('a Claude turn asks Anthropic to drop stale thinking blocks', async () => {
  const config = testCoreConfig();
  config.ai.anthropic.apiKey = 'test-key';
  config.ai.anthropic.baseUrl = server.url.origin;
  const entry = CHAT_MODELS.find((model) => model.provider === 'anthropic');
  if (!entry) {
    throw new Error('no Anthropic chat model in the catalog');
  }

  const result = streamText({
    model: resolveChatModel(config, entry),
    prompt: 'hi',
    providerOptions: reasoningProviderOptions(entry),
    onError: () => undefined,
  });
  // The stub answers 404 on purpose; only the request matters.
  await result.consumeStream();

  expect(captured?.body.thinking).toEqual({
    type: 'adaptive',
    display: 'summarized',
    block_binding: { prefix_mismatch_behavior: 'drop_block' },
  });
  expect(captured?.headers.get('anthropic-beta')?.split(',')).toContain(
    'thinking-binding-controls-2026-08-01'
  );
});
