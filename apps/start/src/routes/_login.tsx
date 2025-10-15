import { LoginLeftPanel } from '@/components/login-left-panel';
import { SkeletonDashboard } from '@/components/skeleton-dashboard';
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
    <div className="relative min-h-screen grid md:grid-cols-2">
      <div className="hidden md:block">
        <LoginLeftPanel />
      </div>
      <div className="center-center w-full max-w-md mx-auto pr-4">
        <Outlet />
      </div>
    </div>
  );
}
