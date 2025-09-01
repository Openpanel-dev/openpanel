import { Outlet, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_auth/onboarding')({
  component: OnboardingLayout,
});

function OnboardingLayout() {
  return (
    <div className="px-6 py-8">
      <div className="border-b border-gray-200 pb-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Onboarding</h1>
      </div>
      <Outlet />
    </div>
  );
}
