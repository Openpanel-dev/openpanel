import { expect, test } from 'bun:test';
import { zChatRequest } from './assistant.constants';

function chatRequest(parts: Record<string, unknown>[]) {
  return {
    id: 'conversation-1',
    projectId: 'project-1',
    organizationId: 'organization-1',
    message: { id: 'message-1', role: 'user', parts },
  };
}

test('a text message is a valid chat request', () => {
  expect(
    zChatRequest.safeParse(chatRequest([{ type: 'text', text: 'Top pages?' }]))
      .success
  ).toBe(true);
});

// The AI SDK would fetch the URL from the API's own network.
test('a file part is refused', () => {
  expect(
    zChatRequest.safeParse(
      chatRequest([
        { type: 'text', text: 'Summarize this' },
        {
          type: 'file',
          mediaType: 'text/plain',
          url: 'http://169.254.169.254/latest/meta-data',
        },
      ])
    ).success
  ).toBe(false);
});
