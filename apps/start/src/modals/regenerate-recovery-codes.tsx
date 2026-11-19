import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { unwrap, useAuthClient } from '@/integrations/auth/client';
import { toastAuthError } from '@/integrations/auth/toast-auth-error';
import { useTRPC } from '@/integrations/trpc/react';

export default function RegenerateRecoveryCodes() {
  const trpc = useTRPC();
  const authClient = useAuthClient();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState('');
  const [newCodes, setNewCodes] = useState<string[] | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      unwrap(authClient.twoFactor.generateBackupCodes({ password })),
    onSuccess: (data) => {
      setNewCodes(data.backupCodes);
      queryClient.invalidateQueries(trpc.auth.twoFactorStatus.pathFilter());
    },
    onError: (error) => {
      toastAuthError(error);
      setPassword('');
    },
  });

  if (newCodes) {
    return (
      <ModalContent>
        <ModalHeader
          text="Your old recovery codes are no longer valid."
          title="New recovery codes"
        />
        <div className="col gap-2">
          <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-def-100 p-3 font-mono text-sm">
            {newCodes.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
          <Button
            className="self-start"
            onClick={() => {
              navigator.clipboard.writeText(newCodes.join('\n'));
              toast.success('Copied to clipboard');
            }}
            size="sm"
            variant="outline"
          >
            Copy all
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={() => popModal()}>Done</Button>
        </DialogFooter>
      </ModalContent>
    );
  }

  return (
    <ModalContent>
      <ModalHeader
        text="Enter your password to generate a fresh set of recovery codes."
        title="Regenerate recovery codes"
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
        >
          Regenerate
        </Button>
      </DialogFooter>
    </ModalContent>
  );
}
