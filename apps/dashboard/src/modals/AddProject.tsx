'use client';

import { ButtonContainer } from '@/components/button-container';
import { InputWithLabel } from '@/components/forms/input-with-label';
import { Button } from '@/components/ui/button';
import { api, handleError } from '@/trpc/client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';

const validator = z.object({
  name: z.string().min(1),
});

type IForm = z.infer<typeof validator>;
interface AddProjectProps {
  organizationId: string;
}
export default function AddProject({ organizationId }: AddProjectProps) {
  const router = useRouter();
  const mutation = api.project.create.useMutation({
    onError: handleError,
    onSuccess() {
      router.refresh();
      toast('Success', {
        description: 'Project created! Lets create a client for it 🤘',
      });
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
            organizationId,
          });
        })}
      >
        <div className="flex flex-col gap-4">
          <InputWithLabel
            label="Name"
            placeholder="Name"
            {...register('name')}
          />
        </div>
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
