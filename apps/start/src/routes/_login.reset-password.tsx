import { ResetPasswordForm } from '@/components/auth/reset-password-form';
import { FullPageErrorState } from '@/components/full-page-error-state';
import { LinkButton } from '@/components/ui/button';
import { PAGE_TITLES, createTitle } from '@/utils/title';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { z } from 'zod';

export const Route = createFileRoute('/_login/reset-password')({
  head: () => ({
    meta: [{ title: createTitle(PAGE_TITLES.RESET_PASSWORD) }],
  }),
  component: Component,
  validateSearch: z.object({
    token: z.string(),
  }),
  errorComponent: () => (
    <FullPageErrorState description="Missing reset password token" />
  ),
});

function Component() {
  const { token } = Route.useSearch();

  return (
    <div className="flex h-full center-center w-full">
      <div className="col gap-8 max-w-md w-full">
        <div className="card p-8">
          <ResetPasswordForm token={token} />
        </div>
        <LinkButton variant={'outline'} size="lg" href="/onboarding">
          No account? Sign up today
        </LinkButton>
      </div>
    </div>
  );
}
