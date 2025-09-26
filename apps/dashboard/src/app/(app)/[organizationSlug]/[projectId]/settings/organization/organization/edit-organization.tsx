'use client';

import { InputWithLabel, WithLabel } from '@/components/forms/input-with-label';
import { Button } from '@/components/ui/button';
import { Widget, WidgetBody, WidgetHead } from '@/components/widget';
import { api, handleError } from '@/trpc/client';
import { useRouter } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';

import { Combobox } from '@/components/ui/combobox';
import type { IServiceOrganization } from '@openpanel/db';
import { zEditOrganization } from '@openpanel/validation';

const validator = zEditOrganization;

type IForm = z.infer<typeof validator>;
interface EditOrganizationProps {
  organization: IServiceOrganization;
}
export default function EditOrganization({
  organization,
}: EditOrganizationProps) {
  const router = useRouter();

  const { register, handleSubmit, formState, reset, control } = useForm<IForm>({
    defaultValues: {
      id: organization.id,
      name: organization.name,
      timezone: organization.timezone ?? undefined,
    },
  });

  const mutation = api.organization.update.useMutation({
    onSuccess(res) {
      toast('Organization updated', {
        description: 'Your organization has been updated.',
      });
      reset({
        ...res,
        timezone: res.timezone!,
      });
      router.refresh();
    },
    onError: handleError,
  });

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
  );
}
