import { createFileRoute, Outlet, useMatchRoute } from '@tanstack/react-router';
import { LogOutIcon } from 'lucide-react';
import { LogoSquare } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { useLogout } from '@/hooks/use-logout';
import { cn } from '@/utils/cn';
import { trackFunnel } from '@/utils/funnel-tracking';
import { createEntityTitle, PAGE_TITLES } from '@/utils/title';

export const Route = createFileRoute('/_steps')({
  component: OnboardingLayout,
  head: () => ({
    meta: [{ title: createEntityTitle('Project', PAGE_TITLES.ONBOARDING) }],
  }),
});

const STEPS = [
  { name: 'Create project', match: '/onboarding/project' },
  { name: 'Install', match: '/onboarding/$projectId/connect' },
] as const;

function OnboardingLayout() {
  const logout = useLogout();
  const matchRoute = useMatchRoute();
  // The install step has a sidebar; the project form stays a single column.
  const isWide = Boolean(
    matchRoute({ to: '/onboarding/$projectId/connect', fuzzy: false })
  );
  const width = isWide ? 'max-w-5xl' : 'max-w-2xl';
  return (
    <div className="min-h-screen bg-background">
      <header
        className={cn(
          'mx-auto flex w-full items-center justify-between px-6 py-6',
          width
        )}
      >
        <a className="row items-center gap-2.5 font-medium" href="/">
          <LogoSquare className="size-8 shrink-0" />
          <span>OpenPanel</span>
        </a>
        <Button
          icon={LogOutIcon}
          loading={logout.isPending}
          onClick={() => {
            trackFunnel('onboarding_signed_out', {
              step: isWide ? 'install' : 'project',
            });
            logout.mutate();
          }}
          size="sm"
          variant="ghost"
        >
          Sign out
        </Button>
      </header>
      <main className={cn('mx-auto w-full px-6 pt-8 pb-24', width)}>
        <StepIndicator />
        <Outlet />
      </main>
    </div>
  );
}

function StepIndicator() {
  const matchRoute = useMatchRoute();
  const currentIndex = STEPS.findIndex((step) =>
    matchRoute({ to: step.match, fuzzy: false })
  );
  if (currentIndex === -1) {
    return null;
  }
  return (
    <nav aria-label="Onboarding progress" className="col mb-8 gap-3">
      <div className="text-muted-foreground text-sm tabular-nums">
        Step {currentIndex + 1} of {STEPS.length}
      </div>
      <ol className="row gap-2">
        {STEPS.map((step, index) => (
          <li
            aria-current={index === currentIndex ? 'step' : undefined}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors',
              index <= currentIndex ? 'bg-foreground' : 'bg-def-300'
            )}
            key={step.match}
          >
            <span className="sr-only">{step.name}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
