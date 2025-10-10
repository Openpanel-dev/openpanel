import Chat from '@/components/chat/chat';
import FullPageLoadingState from '@/components/full-page-loading-state';
import { useTRPC } from '@/integrations/trpc/react';
import { PAGE_TITLES, createProjectTitle } from '@/utils/title';
import { keepPreviousData, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import type { UIMessage } from 'ai';

export const Route = createFileRoute('/_app/$organizationId/$projectId_/chat')({
  component: Component,
  pendingComponent: FullPageLoadingState,
  head: () => {
    return {
      meta: [
        {
          title: createProjectTitle(PAGE_TITLES.CHAT),
        },
      ],
    };
  },
});

function Component() {
  const { organizationId, projectId } = Route.useParams();
  const trpc = useTRPC();
  const { data } = useSuspenseQuery(
    trpc.chat.get.queryOptions(
      {
        projectId,
      },
      {
        placeholderData: keepPreviousData,
      },
    ),
  );

  const { data: organization } = useSuspenseQuery(
    trpc.organization.get.queryOptions({
      organizationId,
    }),
  );

  const messages = ((data?.messages as unknown as UIMessage[]) || []).slice(
    -10,
  );

  return (
    <Chat
      projectId={projectId}
      initialMessages={messages}
      organization={organization}
    />
  );
}
