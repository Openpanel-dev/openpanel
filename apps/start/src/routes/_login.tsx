import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { LoginLeftPanel } from '@/components/login-left-panel';
import { LoginNavbar } from '@/components/login-navbar';

export const Route = createFileRoute('/_login')({
  beforeLoad: async ({ context }) => {
    if (context.session?.session) {
      throw redirect({ to: '/' });
    }
  },
  component: AuthLayout,
});

function AuthLayout() {
  return (
    <div className="relative grid min-h-screen md:grid-cols-2">
      <LoginNavbar />
      <div className="hidden md:block">
        <LoginLeftPanel />
      </div>
      <div className="center-center mx-auto w-full max-w-md px-4">
        <Outlet />
      </div>
    </div>
  );
}
