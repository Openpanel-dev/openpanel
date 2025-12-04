import { LoginNavbar } from '@/components/login-navbar';
import { OnboardingLeftPanel } from '@/components/onboarding-left-panel';
import { Outlet, createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_public')({
  component: OnboardingLayout,
});

function OnboardingLayout() {
  return (
    <div className="relative min-h-screen grid md:grid-cols-2">
      <LoginNavbar />
      <div className="hidden md:block">
        <OnboardingLeftPanel />
      </div>
      <div className="center-center w-full max-w-md mx-auto px-4">
        <Outlet />
      </div>
    </div>
  );
}
