import { FullPageEmptyState } from '@/components/full-page-empty-state';
import { Sidebar } from '@/components/sidebar';
import { Button, LinkButton, buttonVariants } from '@/components/ui/button';
import { useAppContext } from '@/hooks/use-app-context';
import { useSidebarCollapsed } from '@/hooks/use-sidebar-collapsed';
import { cn } from '@/utils/cn';
import { Outlet, createFileRoute, redirect } from '@tanstack/react-router';
import { ConstructionIcon } from 'lucide-react';
import { useEffect } from 'react';

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
  const [collapsed] = useSidebarCollapsed();

  // Nudge width-measuring layouts (react-grid-layout) to reflow after collapse.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `collapsed` triggers the effect; it isn't read.
  useEffect(() => {
    const id = setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 50);
    return () => clearTimeout(id);
  }, [collapsed]);

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
      <div className={cn('w-full', collapsed ? 'lg:pl-16' : 'lg:pl-72')}>
        <div className="block lg:hidden bg-background h-16 w-full fixed top-0 z-10 border-b" />
        <div className="block lg:hidden h-16" />
        <Outlet />
      </div>
    </div>
  );
}
