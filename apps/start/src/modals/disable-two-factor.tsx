import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { unwrap, useAuthClient } from '@/integrations/auth/client';
import { useTRPC } from '@/integrations/trpc/react';

export default function DisableTwoFactor() {
  const trpc = useTRPC();
  const authClient = useAuthClient();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState('');

  const mutation = useMutation({
    mutationFn: () => unwrap(authClient.twoFactor.disable({ password })),
    onSuccess: () => {
      toast.success('Two-factor authentication disabled');
      queryClient.invalidateQueries(trpc.auth.twoFactorStatus.pathFilter());
      popModal();
    },
    onError: (error) => {
      toast.error(error.message);
      setPassword('');
    },
  });

  return (
    <ModalContent>
      <ModalHeader
        text="Enter your password to confirm."
        title="Disable two-factor authentication"
      />
      <Input
        aria-label="Password"
        autoComplete="current-password"
        autoFocus
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Your password"
        type="password"
        value={password}
      />
      <DialogFooter>
        <Button onClick={() => popModal()} variant="secondary">
          Cancel
        </Button>
        <Button
          disabled={!password}
          loading={mutation.isPending}
          onClick={() => mutation.mutate()}
          variant="destructive"
        >
          Disable
        </Button>
      </DialogFooter>
    </ModalContent>
  );
}
