import { useEffect } from 'react';
import { useChatState } from './chat-context';
import { ChatDrawerBody } from './chat-drawer-body';
import { ChatDrawerNotConfigured } from './chat-drawer-empty';
import { ChatDrawerFooter } from './chat-drawer-footer';
import { ChatDrawerHeader } from './chat-drawer-header';
import { ChatRuntimeProvider } from './chat-runtime';
import { useAppParams } from '@/hooks/use-app-params';
import { useResizableDrawer } from '@/hooks/use-resizable-drawer';

const WIDTH_STORAGE_KEY = 'op-chat-drawer-width';
const DEFAULT_WIDTH = 440;
const MIN_WIDTH = 360;
const MAX_WIDTH = 720;

/**
 * Persistent right-side drawer for the context-aware AI chat. Mounts
 * once inside `_app.tsx` (so it can flex-shrink the main content on
 * `lg+`). Renders nothing when `?chat` is absent from the URL or
 * there's no project in scope.
 *
 * The drawer wraps body + footer in `<ChatRuntimeProvider>`, which
 * owns the single `useAgent()` instance for the active agent +
 * conversation. Header sits outside the runtime and only reads the
 * thin `useChatState()` context (conversation list, new chat button).
 */
export function ChatDrawer() {
  const { projectId } = useAppParams();
  const {
    agentName,
    conversationId,
    isOpen,
    isAiEnabled,
    closeChat,
    openChatForContext,
  } = useChatState();
  const { width, dragHandleProps } = useResizableDrawer({
    defaultWidth: DEFAULT_WIDTH,
    minWidth: MIN_WIDTH,
    maxWidth: MAX_WIDTH,
    storageKey: WIDTH_STORAGE_KEY,
  });

  // Cmd+J / Ctrl+J shortcut — toggles the drawer. Opening resumes
  // the last conversation for the current context (same page +
  // same entity); closing just clears `?chat`.
  useEffect(() => {
    if (!projectId) {
      return;
    }
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        if (isOpen) {
          closeChat();
        } else {
          openChatForContext();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [projectId, isOpen, closeChat, openChatForContext]);

  if (!(projectId && isOpen)) {
    return null;
  }

  return (
    <>
      {/* The aside is `fixed`; this spacer makes the page shrink on `lg+`. */}
      <div aria-hidden className="hidden shrink-0 lg:block" style={{ width }} />
      <aside
        className="fixed top-0 right-0 z-40 flex h-screen flex-col border-l bg-background shadow-2xl"
        style={{ width }}
      >
        <div
          aria-label="Resize chat drawer"
          className="absolute top-0 left-0 z-10 h-full w-1 cursor-ew-resize transition-colors hover:bg-border"
          {...dragHandleProps}
        />
        <ChatDrawerHeader onClose={closeChat} projectId={projectId} />
        {/* `key={conversationId}` remounts the runtime so a switch re-hydrates. The
            placeholder avoids `useAgent({ agent: '' })` while models load. */}
        {isAiEnabled === false ? (
          <ChatDrawerNotConfigured />
        ) : agentName ? (
          <ChatRuntimeProvider key={conversationId}>
            <ChatDrawerBody />
            <ChatDrawerFooter />
          </ChatRuntimeProvider>
        ) : (
          <div className="flex-1" />
        )}
      </aside>
    </>
  );
}
