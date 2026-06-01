import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { handleError, useTRPC } from '@/integrations/trpc/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';

type Props = {
  organizationId: string;
  organizationName: string;
};

export default function ConfirmDeleteOrganization({
  organizationId,
  organizationName,
}: Props) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [confirmation, setConfirmation] = useState('');

  const mutation = useMutation(
    trpc.organization.delete.mutationOptions({
      onError: handleError,
      onSuccess: () => {
        toast.success('Organization scheduled for deletion');
        queryClient.invalidateQueries(
          trpc.organization.get.queryFilter({ organizationId }),
        );
        popModal();
      },
    }),
  );

  const canDelete = confirmation.trim() === organizationName.trim();

  return (
    <ModalContent>
      <ModalHeader
        title="Delete organization"
        text={`${organizationName} and all of its projects and events will be permanently deleted after 24 hours. You can cancel before then.`}
      />
      <div className="col gap-2">
        <label className="text-sm font-medium" htmlFor="confirm-org-name">
          Type <span className="font-bold">{organizationName}</span> to confirm
        </label>
        <Input
          autoComplete="off"
          autoFocus
          id="confirm-org-name"
          onChange={(e) => setConfirmation(e.target.value)}
          placeholder={organizationName}
          value={confirmation}
        />
      </div>
      <DialogFooter>
        <Button onClick={() => popModal()} variant="secondary">
          Cancel
        </Button>
        <Button
          disabled={!canDelete}
          loading={mutation.isPending}
          onClick={() => mutation.mutate({ organizationId })}
          variant="destructive"
        >
          Delete organization
        </Button>
      </DialogFooter>
    </ModalContent>
  );
}
