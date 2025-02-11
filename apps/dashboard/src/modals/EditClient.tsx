import { ButtonContainer } from '@/components/button-container';
import { InputWithLabel } from '@/components/forms/input-with-label';
import { Button } from '@/components/ui/button';
import { api, handleError } from '@/trpc/client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import type { IServiceClient } from '@openpanel/db';

import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';

type EditClientProps = IServiceClient;

const validator = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});

type IForm = z.infer<typeof validator>;

export default function EditClient({ id, name }: EditClientProps) {
  const router = useRouter();
  const { register, handleSubmit, reset, formState, control, setError } =
    useForm<IForm>({
      resolver: zodResolver(validator),
      defaultValues: {
        id,
        name,
      },
    });

  const mutation = api.client.update.useMutation({
    onError: handleError,
    onSuccess() {
      reset();
      toast('Success', {
        description: 'Client updated.',
      });
      popModal();
      router.refresh();
    },
  });

  return (
    <ModalContent>
      <ModalHeader title="Edit client" />
      <form onSubmit={handleSubmit((values) => mutation.mutate(values))}>
        <InputWithLabel label="Name" placeholder="Name" {...register('name')} />
        <ButtonContainer>
          <Button type="button" variant="outline" onClick={() => popModal()}>
            Cancel
          </Button>
          <Button type="submit" disabled={!formState.isDirty}>
            Save
          </Button>
        </ButtonContainer>
      </form>
    </ModalContent>
  );
}
