import { ButtonContainer } from '@/components/button-container';
import { InputWithLabel } from '@/components/forms/input-with-label';
import { Button } from '@/components/ui/button';
import { useTRPC } from '@/integrations/trpc/react';
import { handleError } from '@/integrations/trpc/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import type { IServiceDashboard } from '@openpanel/db';

import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';

type EditDashboardProps = Exclude<IServiceDashboard, null>;

const validator = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});

type IForm = z.infer<typeof validator>;

export default function EditDashboard({ id, name }: EditDashboardProps) {
  const { register, handleSubmit, reset, formState } = useForm<IForm>({
    resolver: zodResolver(validator),
    defaultValues: {
      id,
      name,
    },
  });

  const queryClient = useQueryClient();
  const trpc = useTRPC();
  const mutation = useMutation(
    trpc.dashboard.update.mutationOptions({
      onSuccess() {
        reset();
        toast('Success', {
          description: 'Dashboard updated.',
        });
        popModal();
        queryClient.invalidateQueries(trpc.dashboard.list.pathFilter());
      },
    }),
  );

  return (
    <ModalContent>
      <ModalHeader title="Edit dashboard" />
      <form
        onSubmit={handleSubmit((values) => {
          mutation.mutate(values);
        })}
      >
        <InputWithLabel
          label="Name"
          placeholder="Name"
          {...register('name')}
          defaultValue={name}
        />
        <ButtonContainer>
          <Button type="button" variant="outline" onClick={() => popModal()}>
            Cancel
          </Button>
          <Button type="submit" disabled={!formState.isDirty}>
            Update
          </Button>
        </ButtonContainer>
      </form>
    </ModalContent>
  );
}
