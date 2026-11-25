import { useMutation } from '@tanstack/react-query';
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
import { handleError, useTRPC } from '@/integrations/trpc/react';

const CONFIRMATION = 'DELETE';

export default function ConfirmDeleteAccount() {
  const { t: translateUi } = useDashboardTranslation();

  const trpc = useTRPC();
  const [confirmation, setConfirmation] = useState('');

  const mutation = useMutation(
    trpc.user.delete.mutationOptions({
      onError: handleError,
      onSuccess: () => {
        toast.success('Your account has been deleted');
        // The session is now gone server-side; send the user back to the start.
        window.location.href = '/';
      },
    })
  );

  const canDelete = confirmation.trim() === CONFIRMATION;

  return (
    <ModalContent>
      <ModalHeader
        text="Your account and all of your personal data will be permanently deleted. Organizations you created that have no other admin will also be removed, along with their projects and events. This cannot be undone."
        title={translateUi('Delete account')}
      />
      <div className="col gap-2">
        <label className="font-medium text-sm" htmlFor="confirm-delete-account">
          <DashboardText i18nKey={'Type'} />{' '}
          <span className="font-bold">{CONFIRMATION}</span>{' '}
          <DashboardText i18nKey={'to confirm'} />{' '}
        </label>
        <Input
          autoComplete="off"
          autoFocus
          id="confirm-delete-account"
          onChange={(e) => setConfirmation(e.target.value)}
          placeholder={CONFIRMATION}
          value={confirmation}
        />
      </div>
      <DialogFooter>
        <Button onClick={() => popModal()} variant="secondary">
          <DashboardText i18nKey={'Cancel'} />{' '}
        </Button>
        <Button
          disabled={!canDelete}
          loading={mutation.isPending}
          onClick={() => mutation.mutate()}
          variant="destructive"
        >
          <DashboardText i18nKey={'Delete account'} />{' '}
        </Button>
      </DialogFooter>
    </ModalContent>
  );
}
