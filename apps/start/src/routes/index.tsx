import { useTRPC } from '@/integrations/trpc/react';
import { useQuery } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: LandingPage,
  loader: async ({ context }) => {
    await context.queryClient.prefetchQuery(
      context.trpc.organization.list.queryOptions()
    );
  },
});

function LandingPage() {
  const trpc = useTRPC();
  const latestOrganization = null
  const { data: organizations } = useQuery(trpc.organization.list.queryOptions());

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
      <div className="max-w-2xl mx-auto text-center px-4">
        <h1 className="text-4xl font-bold text-gray-900 mb-6">
          Welcome to Your SaaS App
        </h1>

        {latestOrganization ? (
          <div className="mb-8">
            <p className="text-xl text-gray-600 mb-4">
              Continue where you left off:
            </p>
            <a
              href={`/${latestOrganization}`}
              className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              Go to Latest Organization
            </a>
          </div>
        ) : (
          <div className="mb-8">
            <p className="text-xl text-gray-600 mb-4">
              Get started by logging in or creating a new account.
            </p>
            <div className="space-x-4">
              <Link
                to="/login"
                className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                Login
              </Link>
              <Link
                to="/onboarding"
                className="inline-block bg-gray-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-gray-700 transition-colors"
              >
                Get Started
              </Link>
            </div>
          </div>
        )}

        <div className="mt-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Your Organizations
          </h2>
          <div className="space-y-2">
            {organizations?.map((org) => (
              <a
                key={org.id}
                href={`/${org.id}`}
                className="block p-3 bg-white rounded-lg border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all"
              >
                <span className="font-medium text-gray-900">{org.name}</span>
                <span className="text-gray-500 text-sm ml-2">({org.id})</span>
              </a>
            ))}
          </div>
        </div>

        <div className="mt-12 text-sm text-gray-500">
          <p>Example routes:</p>
          <div className="mt-2 space-y-1">
            <a href="/org123" className="block text-blue-600 hover:underline">
              /org123 - Projects list
            </a>
            <a
              href="/org123/proj456"
              className="block text-blue-600 hover:underline"
            >
              /org123/proj456 - Project dashboard
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
