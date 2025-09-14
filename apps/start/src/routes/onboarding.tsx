import FullWidthNavbar from '@/components/full-width-navbar';
import { SkipOnboarding } from '@/components/onboarding/skip-onboarding';
import { OnboardingSteps } from '@/components/onboarding/steps';
import { Outlet, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/onboarding')({
  component: OnboardingLayout,
});

function OnboardingLayout() {
  return (
    <>
      <div className="fixed inset-0 hidden md:grid md:grid-cols-[30vw_1fr] lg:grid-cols-[30vw_1fr]">
        <div className="" />
        <div className="border-l border-border bg-card" />
      </div>
      <div className="relative min-h-screen bg-card md:bg-transparent">
        <FullWidthNavbar>
          <SkipOnboarding />
        </FullWidthNavbar>
        <div className="mx-auto w-full md:max-w-[95vw] lg:max-w-[80vw]">
          <div className="grid md:grid-cols-[25vw_1fr] lg:grid-cols-[20vw_1fr]">
            <div className="max-w-screen flex flex-col gap-4 overflow-hidden bg-def-200 p-4 pr-0 md:bg-transparent md:py-14">
              <div className="hidden md:block">
                <div className="text-sm font-bold uppercase text-[#7b94ac]">
                  Welcome to Openpanel
                </div>
                <div className="text-xl font-medium leading-loose">
                  Get started
                </div>
              </div>
              <OnboardingSteps />
            </div>
            <div className="h-full p-4 md:p-14">
              <Outlet />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
