import { useScrollAnchor } from '@/hooks/use-scroll-anchor';
import type { IServiceOrganization, Organization } from '@openpanel/db';
import type { UIMessage } from 'ai';
import { Loader2Icon } from 'lucide-react';
import { useEffect } from 'react';
import { ProjectLink } from '../links';
import { Markdown } from '../markdown';
import { Skeleton } from '../skeleton';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Button, LinkButton } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import { ChatMessage } from './chat-message';

export function ChatMessages({
  messages,
  debug,
  status,
  isLimited,
}: {
  messages: UIMessage[];
  debug: boolean;
  status: 'submitted' | 'streaming' | 'ready' | 'error';
  isLimited: boolean;
}) {
  const { messagesRef, scrollRef, visibilityRef, scrollToBottom } =
    useScrollAnchor();

  useEffect(() => {
    scrollToBottom();
  }, []);

  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === 'user') {
      scrollToBottom();
    }
  }, [messages]);

  return (
    <ScrollArea className="h-full" ref={scrollRef}>
      <div ref={messagesRef} className="p-8 col gap-2">
        {messages.map((m, index) => {
          return (
            <ChatMessage
              key={m.id}
              message={m}
              isStreaming={status === 'streaming'}
              isLast={index === messages.length - 1}
              debug={debug}
            />
          );
        })}
        {status === 'submitted' && (
          <div className="card p-4 center-center max-w-xl pl-8">
            <Loader2Icon className="w-4 h-4 animate-spin" />
          </div>
        )}
        {isLimited && (
          <div className="max-w-xl pl-8 mt-8">
            <Alert variant={'warning'}>
              <AlertTitle>Upgrade your account</AlertTitle>
              <AlertDescription>
                <p>
                  To keep using this feature you need to upgrade your account.
                </p>
                <p>
                  <ProjectLink
                    href="/settings/organization?tab=billing"
                    className="font-medium underline"
                  >
                    Visit Billing
                  </ProjectLink>{' '}
                  to upgrade.
                </p>
              </AlertDescription>
            </Alert>
          </div>
        )}
        <div className="h-20 p-4 w-full" />
        <div className="w-full h-px" ref={visibilityRef} />
      </div>
    </ScrollArea>
  );
}
