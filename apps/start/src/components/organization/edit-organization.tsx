import { InputWithLabel, WithLabel } from '@/components/forms/input-with-label';
import { Button } from '@/components/ui/button';
import { Widget, WidgetBody, WidgetHead } from '@/components/widget';
import { useTRPC } from '@/integrations/trpc/react';
import { handleError } from '@/trpc/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
        toast(t('organization.toast_updated'), {
          description: t('organization.toast_updated_description'),
        });
        reset({
          ...res,
          timezone: res.timezone!,
        });
        queryClient.invalidateQueries(trpc.organization.get.pathFilter());
      },
      onError: handleError,
    }),
  );

  return (
    <form
      onSubmit={handleSubmit((values) => {
        mutation.mutate(values);
      })}
    >
        <Widget>
          <WidgetHead className="flex items-center justify-between">
          <span className="title">{t('organization.details_title')}</span>
        </WidgetHead>
        <WidgetBody className="gap-4 col">
          <InputWithLabel
            className="flex-1"
            label={t('organization.name_label')}
            {...register('name')}
            defaultValue={organization?.name}
          />
          <Controller
            name="timezone"
            control={control}
            render={({ field }) => (
              <WithLabel label={t('organization.timezone_label')}>
                <Combobox
                  placeholder={t('organization.timezone_placeholder')}
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
            {t('common.save')}
          </Button>
        </WidgetBody>
      </Widget>
    </form>
  );
}
