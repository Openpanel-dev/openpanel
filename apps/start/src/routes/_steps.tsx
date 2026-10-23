import { createFileRoute, Outlet } from '@tanstack/react-router';
import { LogOutIcon } from 'lucide-react';
import { LogoSquare } from '@/components/logo';
import {
  OnboardingShellProvider,
  STEP_NAMES,
  useOnboardingShellConfig,
} from '@/components/onboarding/onboarding-shell';
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

function OnboardingLayout() {
  return (
    <OnboardingShellProvider>
      <OnboardingFrame />
    </OnboardingShellProvider>
  );
}

function OnboardingFrame() {
  const logout = useLogout();
  const { step, wide } = useOnboardingShellConfig();
  const width = wide ? 'max-w-5xl' : 'max-w-2xl';
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
              step: STEP_NAMES[step - 1] ?? String(step),
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
        <StepIndicator current={step} />
        <Outlet />
      </main>
    </div>
  );
}

function StepIndicator({ current }: { current: number }) {
  const currentIndex = current - 1;
  return (
    <nav aria-label="Onboarding progress" className="col mb-8 gap-3">
      <div className="text-muted-foreground text-sm tabular-nums">
        Step {current} of {STEP_NAMES.length}
      </div>
      <ol className="row gap-2">
        {STEP_NAMES.map((name, index) => (
          <li
            aria-current={index === currentIndex ? 'step' : undefined}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors',
              index <= currentIndex ? 'bg-foreground' : 'bg-def-300'
            )}
            key={name}
          >
            <span className="sr-only">{name}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
