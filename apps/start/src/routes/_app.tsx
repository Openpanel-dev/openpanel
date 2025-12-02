import { FullPageEmptyState } from '@/components/full-page-empty-state';
import { Sidebar } from '@/components/sidebar';
import { Button, LinkButton, buttonVariants } from '@/components/ui/button';
import { useAppContext } from '@/hooks/use-app-context';
import { cn } from '@/utils/cn';
import { Outlet, createFileRoute, redirect } from '@tanstack/react-router';
import { ConstructionIcon } from 'lucide-react';

export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ context }) => {
    if (!context.session.session) {
      throw redirect({ to: '/login' });
    }
  },
  component: AppLayout,
});

function AppLayout() {
  const { isMaintenance } = useAppContext();

  if (isMaintenance) {
    return (
      <FullPageEmptyState
        icon={ConstructionIcon}
        className="min-h-screen"
        title="Maintenance mode"
        description="We are currently performing maintenance on the system. Please check back later."
      >
        <a
          href="https://status.openpanel.dev/"
          className={cn(buttonVariants())}
          target="_blank"
          rel="noopener noreferrer"
        >
          Check out our status page
        </a>
      </FullPageEmptyState>
    );
  }

  return (
    <div className="flex h-screen w-full">
      <Sidebar />
      <div className="lg:pl-72 w-full">
        <div className="block lg:hidden bg-background h-16 w-full fixed top-0 z-10 border-b" />
        <div className="block lg:hidden h-16" />
        <Outlet />
      </div>
    </div>
  );
}
