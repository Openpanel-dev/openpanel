import { zodResolver } from '@hookform/resolvers/zod';
import { zCreateReference } from '@openpanel/core/modules/reference/reference.constants';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';
import { ButtonContainer } from '@/components/button-container';
import { InputWithLabel } from '@/components/forms/input-with-label';
import { Button } from '@/components/ui/button';
import { InputDateTime } from '@/components/ui/input-date-time';
import { useAppParams } from '@/hooks/use-app-params';
import { handleError, useTRPC } from '@/integrations/trpc/react';

type IForm = z.infer<typeof zCreateReference>;

interface AddReferenceProps {
  datetime?: string;
}

export default function AddReference({ datetime }: AddReferenceProps = {}) {
  const { projectId } = useAppParams();
  const queryClient = useQueryClient();
  const { register, handleSubmit, formState, control } = useForm<IForm>({
    resolver: zodResolver(zCreateReference),
    defaultValues: {
      title: '',
      description: '',
      projectId,
      datetime: datetime || new Date().toISOString(),
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
    })
  );

  return (
    <ModalContent>
      <ModalHeader title="Add reference" />
      <form
        className="flex flex-col gap-4"
        onSubmit={handleSubmit((values) => mutation.mutate(values))}
      >
        <InputWithLabel label="Title" {...register('title')} autoFocus />
        <InputWithLabel label="Description" {...register('description')} />
        <Controller
          control={control}
          name="datetime"
          render={({ field }) => (
            <InputDateTime {...field} label="Date and time" />
          )}
        />
        <ButtonContainer>
          <Button onClick={() => popModal()} type="button" variant="outline">
            Cancel
          </Button>
          <Button disabled={!formState.isDirty} type="submit">
            Create
          </Button>
        </ButtonContainer>
      </form>
    </ModalContent>
  );
}
