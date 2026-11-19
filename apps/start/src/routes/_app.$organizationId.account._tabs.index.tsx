import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { SaveIcon } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { InputWithLabel } from '@/components/forms/input-with-label';
import FullPageLoadingState from '@/components/full-page-loading-state';
import DeleteAccount from '@/components/settings/delete-account';
import { Button } from '@/components/ui/button';
import { Widget, WidgetBody, WidgetHead } from '@/components/widget';
import { handleError, useTRPC } from '@/integrations/trpc/react';

const validator = z.object({
  firstName: z.string(),
  lastName: z.string(),
});

type IForm = z.infer<typeof validator>;

export const Route = createFileRoute('/_app/$organizationId/account/_tabs/')({
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
    })
  );

  if (!user) {
    return null;
  }

  return (
    <div className="space-y-8">
      <form
        onSubmit={handleSubmit((values) => {
          mutation.mutate(values);
        })}
      >
        <Widget className="w-full max-w-screen-md">
          <WidgetHead>
            <span className="title">Profile</span>
          </WidgetHead>
          <WidgetBody className="col gap-4">
            <InputWithLabel
              disabled
              label="Email"
              readOnly
              value={user.email}
            />
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
              className="self-end"
              disabled={!formState.isDirty || mutation.isPending}
              icon={SaveIcon}
              loading={mutation.isPending}
              size="sm"
              type="submit"
            >
              Save
            </Button>
          </WidgetBody>
        </Widget>
      </form>
      <DeleteAccount />
    </div>
  );
}
