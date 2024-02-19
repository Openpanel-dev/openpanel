'use client';

import { api, handleError } from '@/app/_trpc/client';
import { ButtonContainer } from '@/components/ButtonContainer';
import { InputWithLabel } from '@/components/forms/InputWithLabel';
import { Button } from '@/components/ui/button';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import type { IServiceProject } from '@mixan/db';

import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';

type EditProjectProps = Exclude<IServiceProject, null>;

const validator = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});

type IForm = z.infer<typeof validator>;

export default function EditProject({ id, name }: EditProjectProps) {
  const router = useRouter();
  const { register, handleSubmit, reset, formState } = useForm<IForm>({
    resolver: zodResolver(validator),
    defaultValues: {
      id,
      name,
    },
  });

  const mutation = api.project.update.useMutation({
    onError: handleError,
    onSuccess() {
      reset();
      router.refresh();
      toast('Success', {
        description: 'Project updated.',
      });
      popModal();
    },
  });

  return (
    <ModalContent>
      <ModalHeader title="Edit project" />
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
            Save
          </Button>
        </ButtonContainer>
      </form>
    </ModalContent>
  );
}
