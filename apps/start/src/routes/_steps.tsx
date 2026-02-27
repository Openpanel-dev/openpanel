import { createFileRoute, Outlet, useMatchRoute } from '@tanstack/react-router';
import { SkeletonDashboard } from '@/components/skeleton-dashboard';
import { cn } from '@/utils/cn';
import { createEntityTitle, PAGE_TITLES } from '@/utils/title';

export const Route = createFileRoute('/_steps')({
  component: OnboardingLayout,
  head: () => ({
    meta: [{ title: createEntityTitle('Project', PAGE_TITLES.ONBOARDING) }],
  }),
});

function OnboardingLayout() {
  return (
    <div className="relative flex min-h-screen items-center justify-center p-4">
      <div className="fixed inset-0 hidden md:block">
        <SkeletonDashboard />
        <div className="fixed inset-0 z-10 bg-def-100/50" />
      </div>
      <div className="relative z-10 flex max-h-[calc(100vh-2rem)] w-full max-w-xl flex-col overflow-hidden rounded-lg border bg-background shadow-muted/50 shadow-xl">
        <div className="sticky top-0 z-10 flex-shrink-0 border-b bg-background">
          <Progress />
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

function Progress() {
  const steps = [
    {
      name: 'Create project',
      match: '/onboarding/project',
    },
    {
      name: 'Connect data',
      match: '/onboarding/$projectId/connect',
    },
    {
      name: 'Verify',
      match: '/onboarding/$projectId/verify',
    },
  ];
  const matchRoute = useMatchRoute();

  const currentStep = steps.find((step) =>
    matchRoute({
      // @ts-expect-error
      from: step.match,
      fuzzy: false,
    })
  );

  return (
    <div className="row w-full flex-shrink-0 items-center justify-between gap-4 p-4">
      <div className="font-bold">{currentStep?.name ?? 'Onboarding'}</div>
      <div className="row gap-4">
        {steps.map((step) => (
          <div
            className={cn(
              'h-2 w-10 rounded-full bg-muted',
              currentStep === step && 'w-20 bg-primary'
            )}
            key={step.match}
          />
        ))}
      </div>
    </div>
  );
}
