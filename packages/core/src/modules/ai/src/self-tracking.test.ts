import { describe, expect, test } from 'bun:test';
import { withAiContext } from '@openpanel/ai';
import type { LanguageModel } from 'ai';
import { testCoreConfig } from '../../../../test/config-fixture';
import { instrumentLanguageModel, selfTrackingClient } from './self-tracking';

const stubModel = {
  specificationVersion: 'v4',
  provider: 'openai.chat',
  modelId: 'gpt-5-mini',
  supportedUrls: {},
  doGenerate: async () => ({
    content: [{ type: 'text', text: 'hi' }],
    finishReason: { unified: 'stop', raw: 'stop' },
    usage: {
      inputTokens: {
        total: 10,
        noCache: 10,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: { total: 2, text: 2, reasoning: undefined },
    },
    warnings: [],
  }),
  doStream: async () => {
    throw new Error('not used');
  },
} as unknown as LanguageModel;

describe('self tracking', () => {
  test('without OP_CLIENT_ID the model is returned untouched', () => {
    const config = testCoreConfig();
    expect(selfTrackingClient(config)).toBeNull();
    expect(instrumentLanguageModel(config, stubModel)).toBe(stubModel);
  });

  test('with a client every call becomes an ai event carrying the ambient context', async () => {
    const config = testCoreConfig();
    config.selfTracking = {
      clientId: 'client_1',
      clientSecret: 'secret',
      apiUrl: 'http://127.0.0.1:1',
    };
    const op = selfTrackingClient(config);
    if (!op) {
      throw new Error('expected a client');
    }
    const sent: unknown[] = [];
    op.send = async (payload) => {
      sent.push(payload);
      return undefined;
    };

    const model = instrumentLanguageModel(config, stubModel) as Exclude<
      LanguageModel,
      string
    >;
    expect(model).not.toBe(stubModel);
    await withAiContext(
      { profileId: 'user_1', name: 'assistant-chat', groups: ['org_1'] },
      () =>
        model.doGenerate({
          prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
        })
    );

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      type: 'ai',
      payload: {
        kind: 'generation',
        model: 'gpt-5-mini',
        provider: 'openai',
        name: 'assistant-chat',
        profileId: 'user_1',
        groups: ['org_1'],
        usage: { inputTokens: 10, outputTokens: 2 },
      },
    });
  });
});
