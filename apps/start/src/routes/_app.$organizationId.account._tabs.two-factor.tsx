import FullPageLoadingState from '@/components/full-page-loading-state';
import { Button } from '@/components/ui/button';
import { Widget, WidgetBody, WidgetHead } from '@/components/widget';
import { useTRPC } from '@/integrations/trpc/react';
import { pushModal } from '@/modals';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { ShieldCheckIcon, ShieldOffIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute(
  '/_app/$organizationId/account/_tabs/two-factor',
)({
  component: Component,
  pendingComponent: FullPageLoadingState,
});

function Component() {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const status = useSuspenseQuery(trpc.auth.totpStatus.queryOptions());

  return (
    <Widget className="max-w-screen-md w-full">
      <WidgetHead>
        <span className="title">{t('account.two_factor_title')}</span>
      </WidgetHead>
      <WidgetBody className="col gap-4">
        <p className="text-sm text-muted-foreground leading-normal">
          {t('account.two_factor_description')}
        </p>

        {status.data.enabled ? (
          <EnabledView
            enabledAt={status.data.enabledAt!}
            remainingRecoveryCodes={status.data.remainingRecoveryCodes}
          />
        ) : (
          <DisabledView hasEmailProvider={status.data.hasEmailProvider} />
        )}
      </WidgetBody>
    </Widget>
  );
}

function DisabledView({ hasEmailProvider }: { hasEmailProvider: boolean }) {
  const { t } = useTranslation();

  if (!hasEmailProvider) {
    return (
      <div className="col gap-2 rounded-md border border-border bg-def-100 px-4 py-3 text-sm">
        <div className="row items-center gap-2">
          <ShieldOffIcon className="size-4 text-muted-foreground" />
          <span>{t('account.two_factor_not_available')}</span>
        </div>
        <p className="text-muted-foreground leading-normal">
          {t('account.two_factor_not_available_description')}
        </p>
      </div>
    );
  }

  return (
    <div className="row items-center justify-between rounded-md border border-border bg-def-100 px-4 py-3">
      <div className="row items-center gap-2 text-sm">
        <ShieldOffIcon className="size-4 text-muted-foreground" />
        <span>{t('account.two_factor_disabled')}</span>
      </div>
      <Button size="sm" onClick={() => pushModal('SetupTwoFactor')}>
        {t('account.two_factor_enable')}
      </Button>
    </div>
  );
}

function EnabledView({
  enabledAt,
  remainingRecoveryCodes,
}: {
  enabledAt: Date;
  remainingRecoveryCodes: number;
}) {
  const { t } = useTranslation();

  return (
    <>
      <div className="row items-center justify-between rounded-md border border-border bg-def-100 px-4 py-3">
        <div className="row items-center gap-2">
          <div className="size-10 bg-emerald-500/10 rounded-full center-center">
          <ShieldCheckIcon className="size-4 text-emerald-500" />
          </div>
          <div className="col gap-1">
            <span>{t('account.two_factor_enabled')}</span>
            <span className="text-xs text-muted-foreground">
              {t('account.two_factor_enabled_meta', {
                date: new Date(enabledAt).toLocaleString(),
                count: remainingRecoveryCodes,
              })}
            </span>
          </div>
        </div>
      </div>

      <div className="row gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => pushModal('RegenerateRecoveryCodes')}
        >
          {t('account.two_factor_regenerate_recovery_codes')}
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={() => pushModal('DisableTwoFactor')}
        >
          {t('account.two_factor_disable')}
        </Button>
      </div>
    </>
  );
}
