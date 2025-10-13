import { Sidebar } from '@/components/sidebar';
import { Outlet, createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(
      context.trpc.auth.session.queryOptions(undefined, {
        staleTime: 1000 * 60 * 5,
        gcTime: 1000 * 60 * 10,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        refetchOnReconnect: false,
      }),
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
