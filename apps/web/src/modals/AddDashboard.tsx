import { ButtonContainer } from '@/components/ButtonContainer';
import { InputWithLabel } from '@/components/forms/InputWithLabel';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { useRefetchActive } from '@/hooks/useRefetchActive';
import { api, handleError } from '@/utils/api';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';

interface AddDashboardProps {
  organizationSlug: string;
  projectSlug: string;
}

const validator = z.object({
  name: z.string().min(1, 'Required'),
});

type IForm = z.infer<typeof validator>;

export default function AddDashboard({
  // organizationSlug,
  projectSlug,
}: AddDashboardProps) {
  const refetch = useRefetchActive();

  const { register, handleSubmit, formState } = useForm<IForm>({
    resolver: zodResolver(validator),
    defaultValues: {
      name: '',
    },
  });

  const mutation = api.dashboard.create.useMutation({
    onError: handleError,
    onSuccess() {
      refetch();
      toast({
        title: 'Success',
        description: 'Dashboard created.',
      });
      popModal();
    },
  });

  return (
    <ModalContent>
      <ModalHeader title="Edit client" />
      <form
        className="flex flex-col gap-4"
        onSubmit={handleSubmit(({ name }) => {
          mutation.mutate({
            name,
            projectSlug,
          });
        })}
      >
        <InputWithLabel
          label="Name"
          placeholder="Name of the dashboard"
          {...register('name')}
        />
        <ButtonContainer>
          <Button type="button" variant="outline" onClick={() => popModal()}>
            Cancel
          </Button>
          <Button type="submit" disabled={!formState.isDirty}>
            Create
          </Button>
        </ButtonContainer>
      </form>
    </ModalContent>
  );
}
