'use client';

import { api, handleError } from '@/app/_trpc/client';
import { ButtonContainer } from '@/components/ButtonContainer';
import { InputWithLabel } from '@/components/forms/InputWithLabel';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';

interface AddDashboardProps {
  projectId: string;
}

const validator = z.object({
  name: z.string().min(1, 'Required'),
});

type IForm = z.infer<typeof validator>;

export default function AddDashboard({ projectId }: AddDashboardProps) {
  const router = useRouter();

  const { register, handleSubmit, formState } = useForm<IForm>({
    resolver: zodResolver(validator),
    defaultValues: {
      name: '',
    },
  });

  const mutation = api.dashboard.create.useMutation({
    onError: handleError,
    onSuccess() {
      router.refresh();
      toast({
        title: 'Success',
        description: 'Dashboard created.',
      });
      popModal();
    },
  });

  return (
    <ModalContent>
      <ModalHeader title="Add dashboard" />
      <form
        className="flex flex-col gap-4"
        onSubmit={handleSubmit(({ name }) => {
          mutation.mutate({
            name,
            projectId,
          });
        })}
      >
        <InputWithLabel
          label="Name"
          placeholder="Name of the dashboard"
          {...register('name')}
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
