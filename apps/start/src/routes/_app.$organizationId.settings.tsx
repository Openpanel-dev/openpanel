import { InputWithLabel, WithLabel } from '@/components/forms/input-with-label';
import { FullPageEmptyState } from '@/components/full-page-empty-state';
import FullPageLoadingState from '@/components/full-page-loading-state';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Widget, WidgetBody, WidgetHead } from '@/components/widget';
import { handleError, useTRPC } from '@/integrations/trpc/react';
import { zEditOrganization } from '@openpanel/validation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';

const validator = zEditOrganization;

type IForm = z.infer<typeof validator>;

export const Route = createFileRoute('/_app/$organizationId/settings')({
  component: Component,
  loader: async ({ context, params }) => {
    await context.queryClient.prefetchQuery(
      context.trpc.organization.get.queryOptions({
        organizationId: params.organizationId,
      }),
    );
  },
});

function Component() {
  const { organizationId } = Route.useParams();
  const trpc = useTRPC();
  const {
    data: organization,
    isLoading,
    refetch,
  } = useQuery(
    trpc.organization.get.queryOptions({
      organizationId,
    }),
  );

  if (isLoading) {
    return <FullPageLoadingState />;
  }

  if (!organization) {
    return <FullPageEmptyState title="Organization not found" />;
  }

  const { register, handleSubmit, formState, reset, control } = useForm<IForm>({
    defaultValues: {
      id: organization.id,
      name: organization.name,
      timezone: organization.timezone ?? undefined,
    },
  });

  const mutation = useMutation(
    trpc.organization.update.mutationOptions({
      onSuccess(res) {
        toast('Organization updated', {
          description: 'Your organization has been updated.',
        });
        reset({
          ...res,
          timezone: res.timezone!,
        });
        refetch();
      },
      onError: handleError,
    }),
  );

  return (
    <div className="container p-8">
      <PageHeader
        title="Workspace settings"
        description="Manage your workspace settings here"
        className="mb-8"
      />

      <form
        onSubmit={handleSubmit((values) => {
          mutation.mutate(values);
        })}
      >
        <Widget>
          <WidgetHead className="flex items-center justify-between">
            <span className="title">Details</span>
          </WidgetHead>
          <WidgetBody className="gap-4 col">
            <InputWithLabel
              className="flex-1"
              label="Name"
              {...register('name')}
              defaultValue={organization?.name}
            />
            <Controller
              name="timezone"
              control={control}
              render={({ field }) => (
                <WithLabel label="Timezone">
                  <Combobox
                    placeholder="Select timezone"
                    items={Intl.supportedValuesOf('timeZone').map((item) => ({
                      value: item,
                      label: item,
                    }))}
                    value={field.value}
                    onChange={field.onChange}
                    className="w-full"
                  />
                </WithLabel>
              )}
            />
            <Button
              size="sm"
              type="submit"
              disabled={!formState.isDirty}
              className="self-end"
            >
              Save
            </Button>
          </WidgetBody>
        </Widget>
      </form>
    </div>
  );
}
