import { useMutation } from '@tanstack/react-query';
import { forgetOnboardingKeys } from '@/hooks/use-client-secret';
import { useTRPC } from '@/integrations/trpc/react';

export function useLogout() {
  const trpc = useTRPC();
  const signOut = useMutation(
    trpc.auth.signOut.mutationOptions({
      onSuccess() {
        // The one-time secrets must not outlive the session that minted them.
        forgetOnboardingKeys();
        window.location.href = '/';
      },
    })
  );
  return signOut;
}
