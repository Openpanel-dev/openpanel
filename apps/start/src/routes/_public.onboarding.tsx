import { useQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { MailIcon } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Or } from '@/components/auth/or';
import { SignInGithub } from '@/components/auth/sign-in-github';
import { SignInGoogle } from '@/components/auth/sign-in-google';
import { SignUpEmailForm } from '@/components/auth/sign-up-email-form';
import FullPageLoadingState from '@/components/full-page-loading-state';
import i18n from '@/i18n';
import { useTRPC } from '@/integrations/trpc/react';
import { createEntityTitle, PAGE_TITLES } from '@/utils/title';

const validateSearch = z.object({
  inviteId: z.string().optional(),
});
export const Route = createFileRoute('/_public/onboarding')({
  head: () => ({
    meta: [
      {
        title: createEntityTitle(
          i18n.t('onboarding.step_create_account'),
          PAGE_TITLES.ONBOARDING
        ),
      },
      { name: 'robots', content: 'noindex, follow' },
    ],
  }),
  beforeLoad: async ({ context }) => {
    if (context.session?.session) {
      throw redirect({ to: '/' });
    }
  },
  component: Component,
  validateSearch,
  loader: async ({ context, location }) => {
    const search = validateSearch.safeParse(location.search);
    if (search.success && search.data.inviteId) {
      await context.queryClient.prefetchQuery(
        context.trpc.organization.getInvite.queryOptions({
          inviteId: search.data.inviteId,
        })
      );
    }
  },
  pendingComponent: FullPageLoadingState,
});

function Component() {
  const { t } = useTranslation();
  const { inviteId } = Route.useSearch();
  const trpc = useTRPC();
  const { data: invite } = useQuery(
    trpc.organization.getInvite.queryOptions(
      {
        inviteId,
      },
      {
        enabled: !!inviteId,
      }
    )
  );
  return (
    <div className="col w-full gap-8 py-4 text-left">
      <div>
        <h1 className="mb-2 font-bold text-3xl text-foreground">
          {t('auth.start_tracking')}
        </h1>
        <p className="text-muted-foreground">
          <Trans
            components={{
              privacy: (
                <a
                  className="underline transition-colors hover:text-foreground"
                  href="https://openpanel.dev/privacy"
                  rel="noreferrer"
                  target="_blank"
                />
              ),
              terms: (
                <a
                  className="underline transition-colors hover:text-foreground"
                  href="https://openpanel.dev/terms"
                  rel="noreferrer"
                  target="_blank"
                />
              ),
            }}
            i18nKey="auth.accept_terms"
          />
        </p>
        <p className="mt-3 text-muted-foreground">
          {t('auth.already_have_account')}{' '}
          <a
            className="font-medium text-foreground underline"
            href={
              inviteId
                ? `/login?inviteId=${encodeURIComponent(inviteId)}`
                : '/login'
            }
          >
            {t('auth.sign_in')}
          </a>
        </p>
      </div>

      {invite && !invite.isExpired && (
        <div className="mb-6 rounded-lg border border-border bg-card p-6">
          <h2 className="mb-2 font-semibold text-xl">
            {t('auth.invitation_to', {
              organization: invite.organization?.name,
            })}
          </h2>
          <p className="text-muted-foreground">
            {t('auth.invitation_description')}
          </p>
        </div>
      )}
      {invite?.isExpired && (
        <div className="mb-6 rounded-lg border border-destructive/20 bg-destructive/10 p-6">
          <h2 className="mb-2 font-semibold text-destructive text-xl">
            {t('auth.invitation_expired', {
              organization: invite.organization?.name,
            })}
          </h2>
          <p className="text-muted-foreground">
            {t('auth.invitation_expired_description')}
          </p>
        </div>
      )}

      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <SignInGithub inviteId={inviteId} type="sign-up" />
          <SignInGoogle inviteId={inviteId} type="sign-up" />
        </div>
        <p className="text-center text-muted-foreground text-xs">
          {t('auth.trial_benefits')}
        </p>

        <Or className="my-6" />

        <div className="mb-4 flex items-center gap-2 font-semibold text-lg">
          <MailIcon className="size-4" />
          {t('auth.sign_up_with_email')}
        </div>
        <SignUpEmailForm inviteId={inviteId} />
      </div>
    </div>
  );
}
