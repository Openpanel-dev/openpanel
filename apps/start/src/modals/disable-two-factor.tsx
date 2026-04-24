import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useTRPC } from '@/integrations/trpc/react';

export default function DisableTwoFactor() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');

  const mutation = useMutation(
    trpc.auth.totpDisable.mutationOptions({
      onSuccess: () => {
        toast.success('Two-factor authentication disabled');
        queryClient.invalidateQueries(trpc.auth.totpStatus.pathFilter());
        popModal();
      },
      onError: (error) => {
        toast.error(error.message);
        setCode('');
      },
    })
  );

  return (
    <ModalContent>
      <ModalHeader
        text="Enter a code from your authenticator app, or a recovery code, to confirm."
        title="Disable two-factor authentication"
      />
      <Input
        autoCapitalize="characters"
        autoFocus
        onChange={(e) => setCode(e.target.value)}
        placeholder="123456 or ABCDE-FGHIJ"
        value={code}
      />
      <DialogFooter>
        <Button onClick={() => popModal()} variant="secondary">
          Cancel
        </Button>
        <Button
          disabled={!code.trim()}
          loading={mutation.isPending}
          onClick={() => mutation.mutate({ code })}
          variant="destructive"
        >
          Disable
        </Button>
      </DialogFooter>
    </ModalContent>
  );
}
