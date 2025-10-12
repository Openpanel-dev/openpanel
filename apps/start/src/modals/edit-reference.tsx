import { ButtonContainer } from '@/components/button-container';
import { InputWithLabel } from '@/components/forms/input-with-label';
import { Button } from '@/components/ui/button';
import { InputDateTime } from '@/components/ui/input-date-time';
import { useTRPC } from '@/integrations/trpc/react';
import { handleError } from '@/integrations/trpc/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import type { IServiceReference } from '@openpanel/db';

import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';

const validator = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullish(),
  datetime: z.string().min(1),
});

type IForm = z.infer<typeof validator>;

type EditReferenceProps = Pick<
  IServiceReference,
  'id' | 'title' | 'description' | 'date'
>;

export default function EditReference({
  id,
  title,
  description,
  date,
}: EditReferenceProps) {
  const trpc = useTRPC();
  const { handleSubmit, register, control, formState, reset } = useForm<IForm>({
    resolver: zodResolver(validator),
    defaultValues: {
      id,
      title: title ?? '',
      description: description ?? undefined,
      datetime: new Date(date).toISOString(),
    },
  });
  const queryClient = useQueryClient();

  const mutation = useMutation(
    trpc.reference.update.mutationOptions({
      onSuccess() {
        toast('Success', { description: 'Reference updated.' });
        reset();
        queryClient.invalidateQueries(
          trpc.reference.getReferences.pathFilter(),
        );
        queryClient.invalidateQueries(
          trpc.reference.getChartReferences.pathFilter(),
        );
        popModal();
      },
      onError: handleError,
    }),
  );

  return (
    <ModalContent>
      <ModalHeader title="Edit reference" />
      <form
        className="flex flex-col gap-4"
        onSubmit={handleSubmit((values) => {
          mutation.mutate(values);
        })}
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
            Update
          </Button>
        </ButtonContainer>
      </form>
    </ModalContent>
  );
}
