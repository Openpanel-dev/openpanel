'use client';

import { ChatForm } from '@/components/chat/chat-form';
import { ChatMessages } from '@/components/chat/chat-messages';
import { useChat } from '@ai-sdk/react';
import type { IServiceOrganization } from '@openpanel/db';
import type { UIMessage } from 'ai';
import { parseAsBoolean, useQueryState } from 'nuqs';
import { toast } from 'sonner';

const getErrorMessage = (error: Error) => {
  try {
    const parsed = JSON.parse(error.message);
    return parsed.message || error.message;
  } catch (e) {
    return error.message;
  }
};
export default function Chat({
  initialMessages,
  projectId,
  organization,
}: {
  initialMessages?: UIMessage[];
  projectId: string;
  organization: IServiceOrganization;
}) {
  const { messages, input, handleInputChange, handleSubmit, status, append } =
    useChat({
      onError(error) {
        const message = getErrorMessage(error);
        toast.error(message);
      },
      api: `${process.env.NEXT_PUBLIC_API_URL}/ai/chat?projectId=${projectId}`,
      initialMessages: (initialMessages ?? []) as any,
      fetch: (url, options) => {
        return fetch(url, {
          ...options,
          credentials: 'include',
          mode: 'cors',
        });
      },
    });

  const [debug, setDebug] = useQueryState(
    'debug',
    parseAsBoolean.withDefault(false),
  );
  const isLimited = Boolean(
    messages.length > 5 &&
      (organization.isCanceled ||
        organization.isTrial ||
        organization.isWillBeCanceled ||
        organization.isExceeded ||
        organization.isExpired),
  );

  return (
    <div className="h-screen w-full col relative">
      <ChatMessages
        messages={messages}
        debug={debug}
        status={status}
        isLimited={isLimited}
      />
      <ChatForm
        handleSubmit={handleSubmit}
        input={input}
        handleInputChange={handleInputChange}
        append={append}
        projectId={projectId}
        isLimited={isLimited}
      />
    </div>
  );
}
