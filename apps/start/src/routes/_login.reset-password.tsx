import { ResetPasswordForm } from '@/components/auth/reset-password-form';
import { FullPageErrorState } from '@/components/full-page-error-state';
import { LinkButton } from '@/components/ui/button';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { z } from 'zod';

export const Route = createFileRoute('/_login/reset-password')({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(
      context.trpc.auth.session.queryOptions(undefined, {
        staleTime: 1000 * 60 * 5,
        gcTime: 1000 * 60 * 10,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        refetchOnReconnect: false,
      }),
    );

    if (session) {
      throw redirect({ to: '/' });
    }
  },
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
