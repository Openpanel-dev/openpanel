import { ButtonContainer } from '@/components/button-container';
import { Button } from '@/components/ui/button';
import { useAppParams } from '@/hooks/use-app-params';
import { handleError } from '@/integrations/trpc/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';

import { zShareOverview } from '@openpanel/validation';

import { Input } from '@/components/ui/input';
import { useTRPC } from '@/integrations/trpc/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';

const validator = zShareOverview;

type IForm = z.infer<typeof validator>;

export default function ShareOverviewModal() {
  const { projectId, organizationId } = useAppParams();

  const { register, handleSubmit } = useForm<IForm>({
    resolver: zodResolver(validator),
    defaultValues: {
      public: true,
      password: '',
      projectId,
      organizationId,
    },
  });

  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const mutation = useMutation(
    trpc.share.createOverview.mutationOptions({
      onError: handleError,
      onSuccess(res) {
        queryClient.invalidateQueries(trpc.share.overview.pathFilter());
        toast('Success', {
          description: `Your overview is now ${
            res.public ? 'public' : 'private'
          }`,
        });
        popModal();
      },
    }),
  );

  return (
    <ModalContent className="max-w-md">
      <ModalHeader
        title="Dashboard public availability"
        text="You can choose if you want to add a password to make it a bit more private."
      />
      <form
        onSubmit={handleSubmit((values) => {
          mutation.mutate(values);
        })}
      >
        <Input
          {...register('password')}
          placeholder="Enter your password"
          size="large"
        />
        <ButtonContainer>
          <Button type="button" variant="outline" onClick={() => popModal()}>
            Cancel
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            Make it public
          </Button>
        </ButtonContainer>
      </form>
    </ModalContent>
  );
}
