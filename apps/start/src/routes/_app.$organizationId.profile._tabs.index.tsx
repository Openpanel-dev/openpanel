import { InputWithLabel } from '@/components/forms/input-with-label';
import FullPageLoadingState from '@/components/full-page-loading-state';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Widget, WidgetBody, WidgetHead } from '@/components/widget';
import { handleError, useTRPC } from '@/integrations/trpc/react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { SaveIcon } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

const validator = z.object({
  firstName: z.string(),
  lastName: z.string(),
});

type IForm = z.infer<typeof validator>;

export const Route = createFileRoute('/_app/$organizationId/profile/_tabs/')({
  component: Component,
  pendingComponent: FullPageLoadingState,
});

function Component() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const session = useSuspenseQuery(trpc.auth.session.queryOptions());
  const user = session.data?.user;

  const { register, handleSubmit, formState, reset } = useForm<IForm>({
    defaultValues: {
      firstName: user?.firstName ?? '',
      lastName: user?.lastName ?? '',
    },
  });

  const mutation = useMutation(
    trpc.user.update.mutationOptions({
      onSuccess: (data) => {
        toast('Profile updated', {
          description: 'Your profile has been updated.',
        });
        queryClient.invalidateQueries(trpc.auth.session.pathFilter());
        reset({
          firstName: data.firstName ?? '',
          lastName: data.lastName ?? '',
        });
      },
      onError: handleError,
    }),
  );

  if (!user) {
    return null;
  }

  return (
    <form
      onSubmit={handleSubmit((values) => {
        mutation.mutate(values);
      })}
    >
      <Widget className="max-w-screen-md w-full">
        <WidgetHead>
          <span className="title">Profile</span>
        </WidgetHead>
        <WidgetBody className="gap-4 col">
          <InputWithLabel
            label="First name"
            {...register('firstName')}
            defaultValue={user.firstName ?? ''}
          />
          <InputWithLabel
            label="Last name"
            {...register('lastName')}
            defaultValue={user.lastName ?? ''}
          />
          <Button
            size="sm"
            type="submit"
            disabled={!formState.isDirty || mutation.isPending}
            className="self-end"
            icon={SaveIcon}
            loading={mutation.isPending}
          >
            Save
          </Button>
        </WidgetBody>
      </Widget>
    </form>
  );
}
