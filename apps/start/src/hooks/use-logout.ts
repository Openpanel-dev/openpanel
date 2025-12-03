import { useTRPC } from '@/integrations/trpc/react';
import { useMutation } from '@tanstack/react-query';

export function useLogout() {
  const trpc = useTRPC();
  const signOut = useMutation(
    trpc.auth.signOut.mutationOptions({
      onSuccess() {
        window.location.href = '/';
      },
    }),
  );
  return signOut;
}
