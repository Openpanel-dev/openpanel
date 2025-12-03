import { OnboardingLeftPanel } from '@/components/onboarding-left-panel';
import { SkeletonDashboard } from '@/components/skeleton-dashboard';
import { cn } from '@/utils/cn';
import { PAGE_TITLES, createEntityTitle } from '@/utils/title';
import {
  Outlet,
  createFileRoute,
  redirect,
  useLocation,
  useMatchRoute,
} from '@tanstack/react-router';

export const Route = createFileRoute('/_steps')({
  component: OnboardingLayout,
  head: () => ({
    meta: [{ title: createEntityTitle('Project', PAGE_TITLES.ONBOARDING) }],
  }),
});

function OnboardingLayout() {
  return (
    <div className="relative min-h-screen pt-32 pb-8">
      <div className="fixed inset-0 hidden md:block">
        <SkeletonDashboard />
      </div>
      <div className="relative z-10 border bg-background rounded-lg shadow-xl shadow-muted/50 max-w-xl mx-auto">
        <Progress />
        <Outlet />
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
    }),
  );

  return (
    <div className="row gap-4 p-4 border-b justify-between items-center flex-1 w-full">
      <div className="font-bold">{currentStep?.name ?? 'Onboarding'}</div>
      <div className="row gap-4">
        {steps.map((step) => (
          <div
            className={cn(
              'w-10 h-2 rounded-full bg-muted',
              currentStep === step && 'w-20 bg-primary',
            )}
            key={step.match}
          />
        ))}
      </div>
    </div>
  );
}
