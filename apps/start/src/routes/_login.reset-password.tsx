import { ResetPasswordForm } from '@/components/auth/reset-password-form';
import { FullPageErrorState } from '@/components/full-page-error-state';
import { LinkButton } from '@/components/ui/button';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

const zLoginSearch = z.object({
  token: z.string(),
});

export const Route = createFileRoute('/_login/reset-password')({
  component: Component,
  validateSearch: (search) => zLoginSearch.parse(search),
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
