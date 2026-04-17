import { useAppContext } from '@/hooks/use-app-context';
import { useAppParams } from '@/hooks/use-app-params';
import { useResizableDrawer } from '@/hooks/use-resizable-drawer';
import { useEffect } from 'react';
import { useChatState } from './chat-context';
import { ChatDrawerBody } from './chat-drawer-body';
import { ChatDrawerNotConfigured } from './chat-drawer-empty';
import { ChatDrawerFooter } from './chat-drawer-footer';
import { ChatDrawerHeader } from './chat-drawer-header';
import { ChatRuntimeProvider } from './chat-runtime';

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
  const { isAiEnabled } = useAppContext();
  const { agentName, conversationId, isOpen, closeChat, openChatForContext } =
    useChatState();
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
    if (!projectId) return;
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

  if (!projectId || !isOpen) return null;

  return (
    <>
      {/*
        Spacer in the flex layout — the aside is `fixed` so the main
        content would otherwise render under it. This empty div takes
        the drawer's width on `lg+` so the page naturally shrinks.
        Hidden on mobile where the drawer overlays as a modal-style
        panel (standard behavior for narrow viewports).
      */}
      <div
        className="hidden lg:block shrink-0"
        style={{ width }}
        aria-hidden
      />
      <aside
        className="fixed top-0 right-0 z-40 h-screen flex flex-col bg-background border-l shadow-2xl"
        style={{ width }}
      >
        <div
          className="absolute top-0 left-0 z-10 w-1 h-full cursor-ew-resize hover:bg-border transition-colors"
          aria-label="Resize chat drawer"
          {...dragHandleProps}
        />
        <ChatDrawerHeader projectId={projectId} onClose={closeChat} />
        {/*
          Three states here:
            1. `!isAiEnabled` — neither `OPENAI_API_KEY` nor
               `ANTHROPIC_API_KEY` is set on the API. Skip the runtime
               entirely and render the setup-instructions empty state.
            2. `isAiEnabled` but `agentName` is still empty — the
               `trpc.chat.models` query is in flight. Render a brief
               placeholder so we don't crash `useAgent({ agent: '' })`.
            3. `agentName` resolved — mount the runtime as normal.
               `key={conversationId}` remounts the `useAgent` controller
               on conversation switches to force a fresh hydrate.
        */}
        {!isAiEnabled ? (
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
