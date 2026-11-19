import {
  createFileRoute,
  Outlet,
  redirect,
  useParams,
} from '@tanstack/react-router';
import { ConstructionIcon } from 'lucide-react';
import { useEffect } from 'react';
import { useChatLaunch } from '@/components/chat/chat-launch';
import { EmptyState } from '@/components/empty-state';
import { EventDrawer } from '@/components/events/event-drawer';
import { Sidebar } from '@/components/sidebar';
import { buttonVariants } from '@/components/ui/button';
import { useAppContext } from '@/hooks/use-app-context';
import { cn } from '@/utils/cn';
import { isSignedIn } from '@/utils/route-session';

export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ context }) => {
    if (!(await isSignedIn(context))) {
      throw redirect({ to: '/login' });
    }
  },
  component: AppLayout,
});

function AppLayout() {
  const { isMaintenance } = useAppContext();
  useChatShortcut();

  if (isMaintenance) {
    return (
      <EmptyState
        description="We're doing maintenance right now. Check back in a little while."
        icon={ConstructionIcon}
        title="Maintenance mode"
        variant="page"
      >
        <a
          className={cn(buttonVariants())}
          href="https://status.openpanel.dev/"
          rel="noopener noreferrer"
          target="_blank"
        >
          Check out our status page
        </a>
      </EmptyState>
    );
  }

  return (
    <div className="flex h-screen w-full">
      <Sidebar />
      <div className="w-full min-w-0 flex-1 lg:pl-72">
        <div className="fixed top-0 z-10 block h-16 w-full border-b bg-background lg:hidden" />
        <div className="block h-16 lg:hidden" />
        <Outlet />
      </div>
      <EventDrawer />
    </div>
  );
}

/** ⌘J / Ctrl+J opens the chat for the current project. */
function useChatShortcut() {
  const launchChat = useChatLaunch();
  const { organizationId, projectId } = useParams({ strict: false });
  useEffect(() => {
    if (!(organizationId && projectId)) {
      return;
    }
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'j') {
        event.preventDefault();
        launchChat();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [launchChat, organizationId, projectId]);
}
