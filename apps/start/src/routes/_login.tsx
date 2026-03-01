import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { LoginNavbar } from '@/components/login-navbar';
import { OnboardingLeftPanel } from '@/components/onboarding-left-panel';

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
        <OnboardingLeftPanel />
      </div>
      <div className="center-center mx-auto w-full max-w-md px-4">
        <Outlet />
      </div>
    </div>
  );
}
