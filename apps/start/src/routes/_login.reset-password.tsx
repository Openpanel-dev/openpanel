import { ResetPasswordForm } from '@/components/auth/reset-password-form';
import { FullPageErrorState } from '@/components/full-page-error-state';
import { PAGE_TITLES, createTitle } from '@/utils/title';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

export const Route = createFileRoute('/_login/reset-password')({
  head: () => ({
    meta: [
      { title: createTitle(PAGE_TITLES.RESET_PASSWORD) },
      { name: 'robots', content: 'noindex, follow' },
    ],
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
    <div className="col gap-8 w-full text-left">
      <ResetPasswordForm token={token} />
    </div>
  );
}
