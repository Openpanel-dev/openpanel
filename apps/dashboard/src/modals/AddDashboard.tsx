import { ButtonContainer } from '@/components/button-container';
import { InputWithLabel } from '@/components/forms/input-with-label';
import { Button } from '@/components/ui/button';
import { useAppParams } from '@/hooks/useAppParams';
import { api, handleError } from '@/trpc/client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';

const validator = z.object({
  name: z.string().min(1, 'Required'),
});

type IForm = z.infer<typeof validator>;

export default function AddDashboard() {
  const { projectId, organizationId } = useAppParams();
  const router = useRouter();

  const { register, handleSubmit, formState } = useForm<IForm>({
    resolver: zodResolver(validator),
    defaultValues: {
      name: '',
    },
  });

  const mutation = api.dashboard.create.useMutation({
    onError: handleError,
    onSuccess(res) {
      router.push(`/${organizationId}/${projectId}/dashboards/${res.id}`);
      toast('Success', {
        description: 'Dashboard created.',
      });
      popModal();
      router.refresh();
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
