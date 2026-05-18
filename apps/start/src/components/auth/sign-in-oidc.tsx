import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import { useTRPC } from '@/integrations/trpc/react';
import { getServerEnvsQueryOptions } from '@/server/get-envs';
import { Button } from '../ui/button';

// Conditionally renders an OIDC sign-in button when the server has
// configured a generic OIDC provider (Zitadel, Keycloak, Authentik,
// Okta, etc.). The button label is driven by OIDC_DISPLAY_NAME and
// defaults to "Single Sign-On" when not set.
export function SignInOidc({
  type,
  inviteId,
  isLastUsed,
}: {
  type: 'sign-in' | 'sign-up';
  inviteId?: string;
  isLastUsed?: boolean;
}) {
  const { data: envs } = useSuspenseQuery(getServerEnvsQueryOptions);
  const trpc = useTRPC();
  const mutation = useMutation(
    trpc.auth.signInOAuth.mutationOptions({
      onSuccess(res) {
        if (res.url) {
          window.location.href = res.url;
        }
      },
    })
  );

  if (!envs.oidc?.enabled) {
    return null;
  }

  const displayName = envs.oidc.displayName || 'Single Sign-On';
  const title =
    type === 'sign-in'
      ? `Sign in with ${displayName}`
      : `Sign up with ${displayName}`;

  return (
    <div className="relative">
      <Button
        className="w-full border border-def-300 bg-background text-foreground shadow-sm transition-all duration-200 hover:bg-def-100 hover:shadow-md [&_svg]:shrink-0"
        onClick={() =>
          mutation.mutate({
            provider: 'oidc',
            inviteId: type === 'sign-up' ? inviteId : undefined,
          })
        }
        size="lg"
      >
        <KeyRound className="mr-2 size-4" />
        {title}
      </Button>
      {isLastUsed && (
        <span className="absolute -top-2 right-3 rounded-full bg-highlight px-1.5 py-0.5 font-medium text-[10px] text-white leading-none">
          Used last time
        </span>
      )}
    </div>
  );
}
