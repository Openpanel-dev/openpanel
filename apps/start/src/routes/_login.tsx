import { MockEventList } from '@/components/mock-event-list';
import { Outlet, createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_login')({
  beforeLoad: async ({ context }) => {
    if (context.session.session) {
      throw redirect({ to: '/' });
    }
  },
  component: AuthLayout,
});

function AuthLayout() {
  return (
    <div className="bg-def-100">
      <div className="grid h-full md:grid-cols-[min(400px,40vw)_1fr]">
        <div className="min-h-screen border-r border-r-background bg-gradient-to-r from-background to-def-200 max-md:hidden">
          <MockEventList />
        </div>
        <div className="min-h-screen p-4">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
