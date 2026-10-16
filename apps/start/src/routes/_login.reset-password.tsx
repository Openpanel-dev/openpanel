import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';
import { FullPageErrorState } from '@/components/full-page-error-state';
import { createTitle, PAGE_TITLES } from '@/utils/title';

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
    <div className="col w-full gap-8 text-left">
      <ResetPasswordForm token={token} />
    </div>
  );
}
