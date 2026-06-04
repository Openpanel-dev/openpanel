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
    <div className="relative flex min-h-screen flex-col md:grid md:grid-cols-2">
      <LoginNavbar className="relative top-auto left-auto p-4 md:absolute md:top-0 md:left-0 md:p-8" />
      <div className="hidden md:block">
        <OnboardingLeftPanel />
      </div>
      <div className="mx-auto w-full max-w-xl px-4 pt-8 pb-8 md:max-w-md md:px-8 md:pt-28">
        <Outlet />
      </div>
    </div>
  );
}
