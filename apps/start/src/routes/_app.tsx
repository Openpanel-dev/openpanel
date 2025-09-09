import { Sidebar } from '@/components/sidebar';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { getAuthSession, getAuthSessionQueryOptions } from '@/lib/auth';
import { Outlet, createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(
      getAuthSessionQueryOptions,
    );
    if (!session) {
      throw redirect({ to: '/login' });
    }
    return { session };
  },
  component: AppLayout,
});

function AppLayout() {
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
