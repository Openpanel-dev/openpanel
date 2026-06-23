import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTRPC } from '@/integrations/trpc/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquarePlusIcon, Trash2Icon, XIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useChatState } from './chat-context';

/**
 * Header — conversation picker, model picker, new chat, close.
 *
 * Reads the global `useChatState()` for the current conversation and
 * agent. Conversation list still uses TRPC; switching a conversation
 * just sets the id — Better Agent's `hydrateFromServer` loads the
 * messages on the next render of the body.
 */
export function ChatDrawerHeader({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { conversationId, switchConversation, newConversation, streamingTitle } =
    useChatState();

  const { data: conversations } = useQuery(
    trpc.conversation.list.queryOptions({ projectId, limit: 50 }),
  );

  const deleteMutation = useMutation(
    trpc.conversation.delete.mutationOptions({
      onSuccess: (_data, variables) => {
        queryClient.invalidateQueries(trpc.conversation.list.pathFilter());
        if (variables.id === conversationId) {
          newConversation();
        }
      },
    }),
  );

  // Header title priority:
  //   1. In-session streaming title (either mid-stream or finalized
  //      after the title finished generating)
  //   2. Persisted title from the conversation list query
  //   3. "New chat" fallback when nothing is known yet
  const persistedTitle =
    conversations?.find((c) => c.id === conversationId)?.title ?? null;
  const activeTitle = streamingTitle ?? persistedTitle ?? t('chat.new_chat');

  return (
    <header className="flex items-center justify-between gap-2 border-b px-3 py-2">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="font-medium text-sm truncate max-w-[200px]"
            >
              {activeTitle}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-72 max-h-96 overflow-y-auto"
          >
            <DropdownMenuLabel>{t('chat.conversations')}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {(!conversations || conversations.length === 0) && (
              <div className="px-2 py-3 text-sm text-muted-foreground">
                {t('chat.no_conversations')}
              </div>
            )}
            {conversations?.map((c) => (
              <DropdownMenuItem
                key={c.id}
                className="flex items-center justify-between gap-2"
                onSelect={() => switchConversation(c.id)}
              >
                <span className="truncate">
                  {c.title ?? t('chat.untitled_chat')}
                </span>
                <InlineDeleteButton
                  onConfirm={() => deleteMutation.mutate({ id: c.id })}
                />
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => newConversation()}
          aria-label={t('chat.new_conversation')}
          title={t('chat.new_conversation')}
        >
          <MessageSquarePlusIcon className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          aria-label={t('chat.close_chat')}
        >
          <XIcon className="size-4" />
        </Button>
      </div>
    </header>
  );
}

/**
 * Two-step inline delete. First click swaps the X icon for a red
 * check; second click within the arm window fires `onConfirm`.
 * Auto-reverts after 4s of inactivity. Moving the mouse away doesn't
 * disarm — that was too aggressive (the dropdown re-layouts between
 * hovers and the button briefly loses hover state). Only the
 * time-based auto-revert applies.
 */
function InlineDeleteButton({ onConfirm }: { onConfirm: () => void }) {
  const { t } = useTranslation();
  const [armed, setArmed] = useState(false);
  const timerRef = useRef<number | null>(null);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  // Cleanup on unmount.
  useEffect(() => clearTimer, []);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (armed) {
      clearTimer();
      setArmed(false);
      onConfirm();
      return;
    }
    setArmed(true);
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      setArmed(false);
      timerRef.current = null;
    }, 4000);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={
        armed
          ? 'shrink-0 rounded bg-destructive p-1 text-white hover:bg-destructive/90 transition-colors'
          : 'shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive transition-colors'
      }
      aria-label={armed ? t('chat.confirm_delete') : t('chat.delete_conversation')}
      title={armed ? t('chat.click_again_to_confirm') : t('chat.delete')}
    >
      {armed ? (
        <Trash2Icon className="size-3" />
      ) : (
        <XIcon className="size-3" />
      )}
    </button>
  );
}
