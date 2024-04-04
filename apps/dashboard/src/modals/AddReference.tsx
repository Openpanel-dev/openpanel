import { ButtonContainer } from '@/components/button-container';
import { InputWithLabel } from '@/components/forms/input-with-label';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { useAppParams } from '@/hooks/useAppParams';
import { api, handleError } from '@/trpc/client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';

import { zCreateReference } from '@openpanel/validation';

import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';

type IForm = z.infer<typeof zCreateReference>;

export default function AddReference() {
  const { projectId } = useAppParams();
  const router = useRouter();

  const { register, handleSubmit, formState } = useForm<IForm>({
    resolver: zodResolver(zCreateReference),
    defaultValues: {
      title: '',
      description: '',
      projectId,
      datetime: new Date().toISOString(),
    },
  });

  const mutation = api.reference.create.useMutation({
    onError: handleError,
    onSuccess() {
      router.refresh();
      toast('Success', {
        description: 'Reference created.',
      });
      popModal();
    },
  });

  return (
    <ModalContent>
      <ModalHeader title="Add reference" />
      <form
        className="flex flex-col gap-4"
        onSubmit={handleSubmit((values) => mutation.mutate(values))}
      >
        <InputWithLabel label="Title" {...register('title')} />
        <InputWithLabel label="Description" {...register('description')} />
        <InputWithLabel label="Datetime" {...register('datetime')} />
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
