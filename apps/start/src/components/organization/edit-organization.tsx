import type { IServiceOrganization } from '@openpanel/core';
import { zEditOrganization } from '@openpanel/core/modules/organization/organization.constants';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { InputWithLabel, WithLabel } from '@/components/forms/input-with-label';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Widget, WidgetBody, WidgetHead } from '@/components/widget';
import { useTRPC } from '@/integrations/trpc/react';
import { handleError } from '@/trpc/client';

const validator = zEditOrganization;

type IForm = z.infer<typeof validator>;
interface EditOrganizationProps {
  organization: IServiceOrganization;
}
export default function EditOrganization({
  organization,
}: EditOrganizationProps) {
  const { register, handleSubmit, formState, reset, control } = useForm<IForm>({
    defaultValues: {
      id: organization.id,
      name: organization.name,
      timezone: organization.timezone ?? undefined,
    },
  });

  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const mutation = useMutation(
    trpc.organization.update.mutationOptions({
      onSuccess(res: any) {
        toast('Organization updated', {
          description: 'Your organization has been updated.',
        });
        reset({
          ...res,
          timezone: res.timezone!,
        });
        queryClient.invalidateQueries(trpc.organization.get.pathFilter());
      },
      onError: handleError,
    })
  );

  return (
    <form
      onSubmit={handleSubmit((values) => {
        mutation.mutate(values);
      })}
    >
      <Widget>
        <WidgetHead className="flex items-center justify-between">
          <span className="title">Details</span>
        </WidgetHead>
        <WidgetBody className="col gap-4">
          <InputWithLabel
            className="flex-1"
            label="Name"
            {...register('name')}
            defaultValue={organization?.name}
          />
          <Controller
            control={control}
            name="timezone"
            render={({ field }) => (
              <WithLabel label="Timezone">
                <Combobox
                  className="w-full"
                  items={Intl.supportedValuesOf('timeZone').map((item) => ({
                    value: item,
                    label: item,
                  }))}
                  onChange={field.onChange}
                  placeholder="Select timezone"
                  value={field.value}
                />
              </WithLabel>
            )}
          />
          <Button
            className="self-end"
            disabled={!formState.isDirty}
            size="sm"
            type="submit"
          >
            Save
          </Button>
        </WidgetBody>
      </Widget>
    </form>
  );
}
