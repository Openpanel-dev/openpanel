'use client';

import { api, handleError } from '@/app/_trpc/client';
import { ButtonContainer } from '@/components/ButtonContainer';
import { InputWithLabel } from '@/components/forms/InputWithLabel';
import { Button } from '@/components/ui/button';
import type { IClientWithProject } from '@/types';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';

type EditClientProps = IClientWithProject;

const validator = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  cors: z.string().min(1),
});

type IForm = z.infer<typeof validator>;

export default function EditClient({ id, name, cors }: EditClientProps) {
  const router = useRouter();
  const { register, handleSubmit, reset, formState } = useForm<IForm>({
    resolver: zodResolver(validator),
    defaultValues: {
      id,
      name,
      cors,
    },
  });

  const mutation = api.client.update.useMutation({
    onError: handleError,
    onSuccess() {
      reset();
      toast({
        title: 'Success',
        description: 'Client updated.',
      });
      popModal();
      router.refresh();
    },
  });

  return (
    <ModalContent>
      <ModalHeader title="Edit client" />
      <form
        onSubmit={handleSubmit((values) => {
          mutation.mutate(values);
        })}
      >
        <div className="flex flex-col gap-4">
          <InputWithLabel
            label="Name"
            placeholder="Name"
            {...register('name')}
            defaultValue={name}
          />
          <InputWithLabel
            label="Cors"
            placeholder="Cors"
            {...register('cors')}
            defaultValue={cors}
          />
        </div>
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
