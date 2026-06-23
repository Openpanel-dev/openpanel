import { ResetPasswordForm } from '@/components/auth/reset-password-form';
import { FullPageErrorState } from '@/components/full-page-error-state';
import { PAGE_TITLES, createTitle } from '@/utils/title';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
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
  errorComponent: ResetPasswordError,
});

function ResetPasswordError() {
  const { t } = useTranslation();
  return <FullPageErrorState description={t('auth.missing_reset_password_token')} />;
}

function Component() {
  const { token } = Route.useSearch();

  return (
    <div className="col gap-8 w-full text-left">
      <ResetPasswordForm token={token} />
    </div>
  );
}
