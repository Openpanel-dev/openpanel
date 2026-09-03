// conversation.service.ts's db access is lazy (`await import(...)` inside
// each function — see the file's header), which is exactly what makes
// `mock.module` work here with no import-time side effects to race: every
// mock below is registered before the subject's first call, not before its
// (side-effect-free) import.

import { beforeAll, beforeEach, expect, mock, test } from 'bun:test';

interface FakeConversation {
  id: string;
  title: string | null;
  projectId: string;
  organizationId: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

interface FakeMessage {
  id: string;
  conversationId: string;
  role: string;
  parts: unknown;
  createdAt: Date;
}

const conversationStore = new Map<string, FakeConversation>();
const messagesByConversation = new Map<string, FakeMessage[]>();

function makeConversation(
  overrides: Partial<FakeConversation> & { id: string }
): FakeConversation {
  const epoch = new Date('2026-09-03T00:00:00.000Z');
  return {
    title: null,
    projectId: 'proj_1',
    organizationId: 'org_1',
    userId: 'user_1',
    createdAt: epoch,
    updatedAt: epoch,
    ...overrides,
  };
}

const conversation = {
  findUnique: mock(
    async ({
      where: { id },
      include,
    }: {
      where: { id: string };
      include?: { messages?: unknown };
    }) => {
      const conv = conversationStore.get(id);
      if (!conv) {
        return null;
      }
      if (include?.messages) {
        return { ...conv, messages: messagesByConversation.get(id) ?? [] };
      }
      return conv;
    }
  ),
  findMany: mock(
    async ({
      where,
      take,
    }: {
      where: { projectId: string; userId: string };
      take?: number;
    }) => {
      const rows = [...conversationStore.values()]
        .filter(
          (c) => c.projectId === where.projectId && c.userId === where.userId
        )
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
      return take ? rows.slice(0, take) : rows;
    }
  ),
  upsert: mock(
    async ({
      where: { id },
      create,
      update,
    }: {
      where: { id: string };
      create: FakeConversation;
      update: { title: string };
    }) => {
      const existing = conversationStore.get(id);
      const next = existing
        ? { ...existing, ...update, updatedAt: new Date() }
        : makeConversation(create);
      conversationStore.set(id, next);
      return next;
    }
  ),
  delete: mock(async ({ where: { id } }: { where: { id: string } }) => {
    conversationStore.delete(id);
    messagesByConversation.delete(id);
  }),
};

mock.module('@openpanel/db/src/prisma-client', () => ({
  db: { conversation },
}));

let subject: typeof import('./conversation.service');
beforeAll(async () => {
  subject = await import('./conversation.service');
});

beforeEach(() => {
  conversationStore.clear();
  messagesByConversation.clear();
});

test('getConversationById returns null for a missing conversation', async () => {
  expect(await subject.getConversationById('missing')).toBeNull();
});

test('getConversationById returns the row without messages by default', async () => {
  conversationStore.set('conv_1', makeConversation({ id: 'conv_1' }));
  const result = await subject.getConversationById('conv_1');
  expect(result).not.toBeNull();
  expect(result).not.toHaveProperty('messages');
});

test('getConversationById includes ordered messages when asked', async () => {
  conversationStore.set('conv_1', makeConversation({ id: 'conv_1' }));
  messagesByConversation.set('conv_1', [
    {
      id: 'm1',
      conversationId: 'conv_1',
      role: 'user',
      parts: {},
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
    },
  ]);
  const result = await subject.getConversationById('conv_1', {
    withMessages: true,
  });
  expect(result).toMatchObject({ id: 'conv_1', messages: [{ id: 'm1' }] });
});

test('listConversations scopes to project and user, newest first', async () => {
  conversationStore.set(
    'conv_old',
    makeConversation({
      id: 'conv_old',
      updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    })
  );
  conversationStore.set(
    'conv_new',
    makeConversation({
      id: 'conv_new',
      updatedAt: new Date('2026-09-02T00:00:00.000Z'),
    })
  );
  conversationStore.set(
    'conv_other_user',
    makeConversation({ id: 'conv_other_user', userId: 'user_2' })
  );

  const result = await subject.listConversations({
    projectId: 'proj_1',
    userId: 'user_1',
  });
  expect(result.map((c) => c.id)).toEqual(['conv_new', 'conv_old']);
});

test('listConversations defaults to a limit of 50', async () => {
  const CONVERSATION_COUNT = 60;
  const DEFAULT_LIMIT = 50;
  for (const i of Array.from({ length: CONVERSATION_COUNT }, (_, idx) => idx)) {
    conversationStore.set(`conv_${i}`, makeConversation({ id: `conv_${i}` }));
  }
  const result = await subject.listConversations({
    projectId: 'proj_1',
    userId: 'user_1',
  });
  expect(result).toHaveLength(DEFAULT_LIMIT);
});

test('upsertConversationTitle creates the row when it does not exist yet', async () => {
  const result = await subject.upsertConversationTitle({
    id: 'conv_new',
    title: 'Hello',
    projectId: 'proj_1',
    organizationId: 'org_1',
    userId: 'user_1',
  });
  expect(result).toMatchObject({
    id: 'conv_new',
    title: 'Hello',
    userId: 'user_1',
  });
});

test('upsertConversationTitle only updates the title on an existing row', async () => {
  // The race this upsert guards against: the row already exists under a
  // different owner (the agent's save won first) — only the title changes.
  conversationStore.set(
    'conv_1',
    makeConversation({
      id: 'conv_1',
      projectId: 'proj_other',
      userId: 'user_other',
    })
  );
  const result = await subject.upsertConversationTitle({
    id: 'conv_1',
    title: 'Renamed',
    projectId: 'proj_1',
    organizationId: 'org_1',
    userId: 'user_1',
  });
  expect(result).toMatchObject({
    id: 'conv_1',
    title: 'Renamed',
    projectId: 'proj_other',
    userId: 'user_other',
  });
});

test('deleteConversation removes the row', async () => {
  conversationStore.set('conv_1', makeConversation({ id: 'conv_1' }));
  await subject.deleteConversation('conv_1');
  expect(conversationStore.has('conv_1')).toBe(false);
});
