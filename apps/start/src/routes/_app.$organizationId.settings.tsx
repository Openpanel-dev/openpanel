import { InputWithLabel, WithLabel } from '@/components/forms/input-with-label';
import { FullPageEmptyState } from '@/components/full-page-empty-state';
import FullPageLoadingState from '@/components/full-page-loading-state';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import DeleteOrganization from '@/components/settings/delete-organization';
import { Widget, WidgetBody, WidgetHead } from '@/components/widget';
import { handleError, useTRPC } from '@/integrations/trpc/react';
import { PAGE_TITLES, createOrganizationTitle } from '@/utils/title';
import { zEditOrganization } from '@openpanel/validation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { z } from 'zod';

const validator = zEditOrganization;

type IForm = z.infer<typeof validator>;

export const Route = createFileRoute('/_app/$organizationId/settings')({
  component: Component,
  head: () => {
    return {
      meta: [
        {
          title: createOrganizationTitle(PAGE_TITLES.SETTINGS),
        },
      ],
    };
  },
});

function Component() {
  const { t } = useTranslation();
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
    return <FullPageEmptyState title={t('organization.not_found')} />;
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
        toast(t('organization.toast_updated'), {
          description: t('organization.toast_updated_description'),
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
        title={t('organization.settings_page_title')}
        description={t('organization.settings_page_description')}
        className="mb-8"
      />

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

      <div className="mt-8">
        <DeleteOrganization organization={organization} />
      </div>
    </div>
  );
}
