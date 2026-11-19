import { CONVERSATION_LIST_LIMIT_DEFAULT } from '@openpanel/core/modules/conversation/conversation.constants';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquarePlusIcon, Trash2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppParams } from '@/hooks/use-app-params';
import { useTRPC } from '@/integrations/trpc/react';
import { showConfirm } from '@/modals';
import { cn } from '@/utils/cn';

const MS_PER_DAY = 86_400_000;

function groupLabel(date: Date, now: Date): string {
  const days = Math.floor((now.getTime() - date.getTime()) / MS_PER_DAY);
  if (days <= 0) {
    return 'Today';
  }
  if (days === 1) {
    return 'Yesterday';
  }
  if (days < 7) {
    return 'This week';
  }
  if (days < 30) {
    return 'This month';
  }
  return 'Older';
}

export function ChatConversations({
  activeId,
  activeTitle,
  onSelect,
  onNew,
  className,
}: {
  activeId: string | null;
  activeTitle: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  className?: string;
}) {
  const { projectId } = useAppParams();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: conversations = [] } = useQuery(
    trpc.conversation.list.queryOptions({
      projectId,
      limit: CONVERSATION_LIST_LIMIT_DEFAULT,
    })
  );
  const remove = useMutation(
    trpc.conversation.delete.mutationOptions({
      onSuccess: (_data, variables) => {
        queryClient.invalidateQueries(trpc.conversation.list.pathFilter());
        if (variables.id === activeId) {
          onNew();
        }
      },
    })
  );

  const now = new Date();
  const groups: { label: string; items: typeof conversations }[] = [];
  for (const conversation of conversations) {
    const label = groupLabel(new Date(conversation.updatedAt), now);
    const group = groups.find((entry) => entry.label === label);
    if (group) {
      group.items.push(conversation);
    } else {
      groups.push({ label, items: [conversation] });
    }
  }

  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)}>
      <div className="flex h-16 shrink-0 items-center px-3">
        <Button
          className="h-9 w-full justify-start gap-2"
          onClick={onNew}
          variant="outline"
        >
          <MessageSquarePlusIcon className="size-4" />
          New chat
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {conversations.length === 0 && (
          <p className="px-2 py-6 text-center text-muted-foreground text-sm">
            Your chats will show up here.
          </p>
        )}
        {groups.map((group) => (
          <div className="mb-3" key={group.label}>
            <div className="mt-2 mb-1.5 px-2.5 font-medium text-muted-foreground text-xs">
              {group.label}
            </div>
            {group.items.map((conversation) => {
              const isActive = conversation.id === activeId;
              const title =
                (isActive ? activeTitle : null) ??
                conversation.title ??
                'Untitled chat';
              return (
                <div
                  className={cn(
                    'group flex items-center gap-1 rounded-md pr-1 text-sm',
                    isActive ? 'bg-muted' : 'hover:bg-muted/60'
                  )}
                  key={conversation.id}
                >
                  <button
                    className="min-w-0 flex-1 truncate px-2 py-1.5 text-left"
                    onClick={() => onSelect(conversation.id)}
                    type="button"
                  >
                    {title}
                  </button>
                  <button
                    aria-label="Delete chat"
                    className="rounded p-1 text-muted-foreground opacity-0 hover:text-destructive focus:opacity-100 group-hover:opacity-100"
                    onClick={() =>
                      showConfirm({
                        title: 'Delete chat',
                        text: 'This removes the conversation for good.',
                        onConfirm: () => remove.mutate({ id: conversation.id }),
                      })
                    }
                    type="button"
                  >
                    <Trash2Icon className="size-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
