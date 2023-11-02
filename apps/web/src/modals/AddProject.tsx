import { ButtonContainer } from '@/components/ButtonContainer';
import { InputWithLabel } from '@/components/forms/InputWithLabel';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { useOrganizationParams } from '@/hooks/useOrganizationParams';
import { useRefetchActive } from '@/hooks/useRefetchActive';
import { api, handleError } from '@/utils/api';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';

const validator = z.object({
  name: z.string().min(1),
});

type IForm = z.infer<typeof validator>;

export default function AddProject() {
  const params = useOrganizationParams();
  const refetch = useRefetchActive();
  const mutation = api.project.create.useMutation({
    onError: handleError,
    onSuccess() {
      toast({
        title: 'Success',
        description: 'Project created! Lets create a client for it 🤘',
      });
      refetch();
      popModal();
    },
  });
  const { register, handleSubmit, formState } = useForm<IForm>({
    resolver: zodResolver(validator),
    defaultValues: {
      name: '',
    },
  });

  return (
    <ModalContent>
      <ModalHeader title="Create project" />
      <form
        onSubmit={handleSubmit((values) => {
          mutation.mutate({
            ...values,
            organizationSlug: params.organization,
          });
        })}
      >
        <InputWithLabel label="Name" placeholder="Name" {...register('name')} />
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
