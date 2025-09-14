import { ButtonContainer } from '@/components/button-container';
import { InputWithLabel } from '@/components/forms/input-with-label';
import { Button } from '@/components/ui/button';
import { useAppParams } from '@/hooks/use-app-params';
import { handleError } from '@/integrations/trpc/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';

import { zCreateReference } from '@openpanel/validation';

import { InputDateTime } from '@/components/ui/input-date-time';
import { useTRPC } from '@/integrations/trpc/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';

type IForm = z.infer<typeof zCreateReference>;

export default function AddReference() {
  const { projectId } = useAppParams();
  const queryClient = useQueryClient();
  const { register, handleSubmit, formState, control } = useForm<IForm>({
    resolver: zodResolver(zCreateReference),
    defaultValues: {
      title: '',
      description: '',
      projectId,
      datetime: new Date().toISOString(),
    },
  });

  const trpc = useTRPC();
  const mutation = useMutation(
    trpc.reference.create.mutationOptions({
      onSuccess() {
        queryClient.invalidateQueries(trpc.reference.pathFilter());
        toast('Success', {
          description: 'Reference created.',
        });
        popModal();
      },
      onError: handleError,
    }),
  );

  return (
    <ModalContent>
      <ModalHeader title="Add reference" />
      <form
        className="flex flex-col gap-4"
        onSubmit={handleSubmit((values) => mutation.mutate(values))}
      >
        <InputWithLabel label="Title" {...register('title')} />
        <InputWithLabel label="Description" {...register('description')} />
        <Controller
          control={control}
          name="datetime"
          render={({ field }) => (
            <InputDateTime {...field} label="Date and time" />
          )}
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
