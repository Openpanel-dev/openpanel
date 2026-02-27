import { ButtonContainer } from '@/components/button-container';
import { InputWithLabel } from '@/components/forms/input-with-label';
import { Button } from '@/components/ui/button';
import { useAppParams } from '@/hooks/use-app-params';
import { useTRPC } from '@/integrations/trpc/react';
import { handleError } from '@/integrations/trpc/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
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
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { register, handleSubmit, formState } = useForm<IForm>({
    resolver: zodResolver(validator),
    defaultValues: {
      name: '',
    },
  });

  const mutation = useMutation(
    trpc.dashboard.create.mutationOptions({
      onSuccess(res) {
        router.navigate({
          to: '/$organizationId/$projectId/dashboards/$dashboardId',
          params: {
            organizationId,
            projectId,
            dashboardId: res.id,
          },
        });
        toast('Success', {
          description: 'Dashboard created.',
        });
        queryClient.invalidateQueries(trpc.dashboard.list.pathFilter());
        popModal();
      },
      onError: handleError,
    }),
  );

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
