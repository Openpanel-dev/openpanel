import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { ShieldCheckIcon, ShieldOffIcon } from 'lucide-react';
import FullPageLoadingState from '@/components/full-page-loading-state';
import { Button } from '@/components/ui/button';
import { Widget, WidgetBody, WidgetHead } from '@/components/widget';
import { useTRPC } from '@/integrations/trpc/react';
import { pushModal } from '@/modals';

export const Route = createFileRoute(
  '/_app/$organizationId/account/_tabs/two-factor'
)({
  component: Component,
  pendingComponent: FullPageLoadingState,
});

function Component() {
  const trpc = useTRPC();
  const status = useSuspenseQuery(trpc.auth.totpStatus.queryOptions());

  return (
    <Widget className="w-full max-w-screen-md">
      <WidgetHead>
        <span className="title">Two-factor authentication</span>
      </WidgetHead>
      <WidgetBody className="col gap-4">
        <p className="text-muted-foreground text-sm leading-normal">
          Protect your account with an authenticator app (Google Authenticator,
          1Password, Authy, etc.). You'll be asked for a 6-digit code each time
          you sign in with email and password.
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
  if (!hasEmailProvider) {
    return (
      <div className="col gap-2 rounded-md border border-border bg-def-100 px-4 py-3 text-sm">
        <div className="row items-center gap-2">
          <ShieldOffIcon className="size-4 text-muted-foreground" />
          <span>Two-factor authentication is not available.</span>
        </div>
        <p className="text-muted-foreground leading-normal">
          Your account signs in with Google or GitHub, which handle two-factor
          authentication in their account settings. Enable it in your provider's
          security settings.
        </p>
      </div>
    );
  }

  return (
    <div className="row items-center justify-between rounded-md border border-border bg-def-100 px-4 py-3">
      <div className="row items-center gap-2 text-sm">
        <ShieldOffIcon className="size-4 text-muted-foreground" />
        <span>Two-factor authentication is disabled.</span>
      </div>
      <Button onClick={() => pushModal('SetupTwoFactor')} size="sm">
        Enable
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
  return (
    <>
      <div className="row items-center justify-between rounded-md border border-border bg-def-100 px-4 py-3">
        <div className="row items-center gap-2">
          <div className="center-center size-10 rounded-full bg-emerald-500/10">
            <ShieldCheckIcon className="size-4 text-emerald-500" />
          </div>
          <div className="col gap-1">
            <span>Two-factor authentication is enabled.</span>
            <span className="text-muted-foreground text-xs">
              Enabled {new Date(enabledAt).toLocaleString()} ·{' '}
              {remainingRecoveryCodes} recovery code
              {remainingRecoveryCodes === 1 ? '' : 's'} remaining
            </span>
          </div>
        </div>
      </div>

      <div className="row gap-2">
        <Button
          onClick={() => pushModal('RegenerateRecoveryCodes')}
          size="sm"
          variant="outline"
        >
          Regenerate recovery codes
        </Button>
        <Button
          onClick={() => pushModal('DisableTwoFactor')}
          size="sm"
          variant="destructive"
        >
          Disable
        </Button>
      </div>
    </>
  );
}
