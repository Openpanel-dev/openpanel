import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { ShieldAlertIcon, ShieldCheckIcon, ShieldOffIcon } from 'lucide-react';
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
  const status = useSuspenseQuery(trpc.auth.twoFactorStatus.queryOptions());

  return (
    <Widget className="w-full max-w-screen-md">
      <WidgetHead>
        <span className="title">Two-factor authentication</span>
      </WidgetHead>
      <WidgetBody className="col gap-4">
        <p className="text-muted-foreground text-sm">
          Protect your account with an authenticator app (Google Authenticator,
          1Password, Authy, etc.). You'll be asked for a 6-digit code each time
          you sign in with email and password.
        </p>

        {status.data.enabled ? (
          <EnabledView />
        ) : (
          <DisabledView
            hasPassword={status.data.hasPassword}
            wasReset={status.data.wasReset}
          />
        )}
      </WidgetBody>
    </Widget>
  );
}

function DisabledView({
  hasPassword,
  wasReset,
}: {
  hasPassword: boolean;
  wasReset: boolean;
}) {
  if (!hasPassword) {
    return (
      <div className="col gap-2 rounded-md border border-border bg-def-100 px-4 py-3 text-sm">
        <div className="row items-center gap-2">
          <ShieldOffIcon className="size-4 text-muted-foreground" />
          <span>Two-factor authentication is not available.</span>
        </div>
        <p className="text-muted-foreground">
          Your account signs in with Google or GitHub, which handle two-factor
          authentication in their account settings. Enable it in your provider's
          security settings.
        </p>
      </div>
    );
  }

  return (
    <>
      {wasReset && (
        <div className="col gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <div className="row items-center gap-2">
            <ShieldAlertIcon className="size-4 text-amber-500" />
            <span>Set up two-factor authentication again</span>
          </div>
          <p className="text-muted-foreground">
            We moved sign-in to a new system, and authenticator codes set up
            before the move no longer work there. Two-factor is off until you
            enable it again; remove the old OpenPanel entry from your
            authenticator app first.
          </p>
        </div>
      )}
      <div className="row items-center justify-between rounded-md border border-border bg-def-100 px-4 py-3">
        <div className="row items-center gap-2 text-sm">
          <ShieldOffIcon className="size-4 text-muted-foreground" />
          <span>Two-factor authentication is disabled.</span>
        </div>
        <Button onClick={() => pushModal('SetupTwoFactor')} size="sm">
          Enable
        </Button>
      </div>
    </>
  );
}

function EnabledView() {
  return (
    <>
      <div className="row items-center justify-between rounded-md border border-border bg-def-100 px-4 py-3">
        <div className="row items-center gap-2">
          <div className="center-center size-10 rounded-full bg-emerald-500/10">
            <ShieldCheckIcon className="size-4 text-emerald-500" />
          </div>
          <span>Two-factor authentication is enabled.</span>
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
