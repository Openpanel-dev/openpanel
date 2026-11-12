import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  TranslationText as DashboardText,
  useTranslation as useDashboardTranslation,
} from '@/i18n/provider';
import { unwrap, useAuthClient } from '@/integrations/auth/client';
import { toastAuthError } from '@/integrations/auth/toast-auth-error';
import { useTRPC } from '@/integrations/trpc/react';

export default function DisableTwoFactor() {
  const { t: translateUi } = useDashboardTranslation();

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
      toastAuthError(error);
      setPassword('');
    },
  });

  return (
    <ModalContent>
      <ModalHeader
        text="Enter your password to confirm."
        title={translateUi('Disable two-factor authentication')}
      />
      <Input
        aria-label={translateUi('Password')}
        autoComplete="current-password"
        autoFocus
        onChange={(e) => setPassword(e.target.value)}
        placeholder={translateUi('Your password')}
        type="password"
        value={password}
      />
      <DialogFooter>
        <Button onClick={() => popModal()} variant="secondary">
          <DashboardText i18nKey={'Cancel'} />{' '}
        </Button>
        <Button
          disabled={!password}
          loading={mutation.isPending}
          onClick={() => mutation.mutate()}
          variant="destructive"
        >
          <DashboardText i18nKey={'Disable'} />{' '}
        </Button>
      </DialogFooter>
    </ModalContent>
  );
}
