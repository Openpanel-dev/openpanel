import { HistoryIcon } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { ChatConversations } from './chat-conversations';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';

/**
 * The parts of the chat page that stay put while a conversation loads: the
 * list on the left (a sheet on phones) and the header. The pane is the child.
 */
export function ChatLayout({
  activeId,
  activeTitle,
  onSelect,
  onNew,
  children,
}: {
  activeId: string | null;
  activeTitle: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  children: ReactNode;
}) {
  const [listOpen, setListOpen] = useState(false);
  const select = (id: string) => {
    setListOpen(false);
    onSelect(id);
  };
  const startNew = () => {
    setListOpen(false);
    onNew();
  };

  return (
    <div className="flex h-full min-h-0 w-full">
      <ChatConversations
        activeId={activeId}
        activeTitle={activeTitle}
        className="hidden w-64 shrink-0 border-r bg-card/50 lg:flex"
        onNew={startNew}
        onSelect={select}
      />
      <Sheet onOpenChange={setListOpen} open={listOpen}>
        <SheetContent className="w-80 p-0" side="left">
          <SheetTitle className="sr-only">Conversations</SheetTitle>
          <ChatConversations
            activeId={activeId}
            activeTitle={activeTitle}
            onNew={startNew}
            onSelect={select}
          />
        </SheetContent>
      </Sheet>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <Button
            aria-label="Conversations"
            className="lg:hidden"
            onClick={() => setListOpen(true)}
            size="icon"
            variant="ghost"
          >
            <HistoryIcon className="size-4" />
          </Button>
          <div className="min-w-0 flex-1 truncate font-medium text-sm">
            {activeTitle ?? 'New chat'}
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}

export function ChatPaneLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 py-6">
      <div className="ml-auto h-10 w-2/5 animate-pulse rounded-2xl bg-muted" />
      <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
      <div className="h-48 w-full animate-pulse rounded-xl bg-muted" />
      <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
      <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
    </div>
  );
}
