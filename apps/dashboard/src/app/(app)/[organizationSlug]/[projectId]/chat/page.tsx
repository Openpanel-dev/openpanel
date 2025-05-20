import Chat from '@/components/chat/chat';
import { db, getOrganizationById } from '@openpanel/db';
import type { UIMessage } from 'ai';

export default async function ChatPage({
  params,
}: {
  params: { organizationSlug: string; projectId: string };
}) {
  const { projectId } = await params;
  const [organization, chat] = await Promise.all([
    getOrganizationById(params.organizationSlug),
    db.chat.findFirst({
      where: {
        projectId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    }),
  ]);

  const messages = ((chat?.messages as UIMessage[]) || []).slice(-10);
  return (
    <Chat
      projectId={projectId}
      initialMessages={messages}
      organization={organization}
    />
  );
}
