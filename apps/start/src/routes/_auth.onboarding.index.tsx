import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_auth/onboarding/')({
  component: OnboardingIndex,
});

function OnboardingIndex() {
  return (
    <div className="text-center">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">
        Welcome to Onboarding
      </h2>
      <p className="text-gray-600">
        This is the main onboarding page. Nested routes can be added here.
      </p>
    </div>
  );
}
