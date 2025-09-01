import { Link, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_auth/onboarding/step1')({
  component: OnboardingStep1,
});

function OnboardingStep1() {
  return (
    <div className="text-center">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">
        Step 1: Welcome
      </h2>
      <p className="text-gray-600 mb-6">
        This is the first step of the onboarding process.
      </p>

      <div className="space-x-4">
        <Link
          to="/onboarding"
          className="inline-block bg-gray-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-gray-700 transition-colors"
        >
          Back to Onboarding
        </Link>
        <button
          type="button"
          className="inline-block bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors"
        >
          Next Step
        </button>
      </div>
    </div>
  );
}
