import { afterAll, beforeAll, expect, test } from 'bun:test';
import { testServiceDeps } from '../../../../test/service-deps';
import type { ServiceDeps } from '../../../services';
import type { AssistantUIMessage } from './message';
import { loadMessages, saveMessages } from './persistence';

const ORGANIZATION_ID = 'chat-persistence-org';
const PROJECT_ID = 'chat-persistence-project';
const USER_ID = 'chat-persistence-user';
const CONVERSATION_ID = 'chat-persistence-conversation';

let deps: ServiceDeps;

beforeAll(async () => {
  deps = await testServiceDeps();
  await deps.db.organization.upsert({
    where: { id: ORGANIZATION_ID },
    create: { id: ORGANIZATION_ID, name: 'Chat org', timezone: 'UTC' },
    update: {},
  });
  await deps.db.project.upsert({
    where: { id: PROJECT_ID },
    create: { id: PROJECT_ID, name: 'Chat', organizationId: ORGANIZATION_ID },
    update: {},
  });
  await deps.db.user.upsert({
    where: { id: USER_ID },
    create: { id: USER_ID, email: 'chat-persistence@openpanel.test' },
    update: {},
  });
});

afterAll(async () => {
  await deps.db.conversation.deleteMany({ where: { id: CONVERSATION_ID } });
  await deps.db.project.deleteMany({ where: { id: PROJECT_ID } });
  await deps.db.organization.deleteMany({ where: { id: ORGANIZATION_ID } });
  await deps.db.user.deleteMany({ where: { id: USER_ID } });
});

// Anthropic binds a thinking block to the bytes of the conversation before
// it, so a tool input or output must come back exactly as the model saw it.
test('message parts survive storage byte for byte, including key order', async () => {
  const message: AssistantUIMessage = {
    id: 'chat-persistence-assistant',
    role: 'assistant',
    parts: [
      { type: 'step-start' },
      {
        type: 'reasoning',
        text: 'Look at pages first.',
        providerMetadata: { anthropic: { signature: 'sig-1' } },
      },
      {
        type: 'tool-get_top_pages',
        toolCallId: 'call-1',
        state: 'output-available',
        input: { startDate: '2026-10-01', endDate: '2026-10-23', limit: 5 },
        output: {
          rows: [{ views: 12, path: '/pricing' }],
          longerKeyAfterShort: true,
          a: 1,
        },
      } as unknown as AssistantUIMessage['parts'][number],
    ],
  };

  await saveMessages(deps, {
    conversationId: CONVERSATION_ID,
    projectId: PROJECT_ID,
    organizationId: ORGANIZATION_ID,
    userId: USER_ID,
    messages: [message],
  });
  const [loaded] = await loadMessages(deps, CONVERSATION_ID);

  expect(JSON.stringify(loaded?.parts)).toBe(JSON.stringify(message.parts));
});
