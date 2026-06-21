import AnimateHeight from '@/components/animate-height';
import { InputWithLabel, WithLabel } from '@/components/forms/input-with-label';
import TagInput from '@/components/forms/tag-input';
import { Button } from '@/components/ui/button';
import { CheckboxInput } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Widget, WidgetBody, WidgetHead } from '@/components/widget';
import { handleError, useTRPC } from '@/integrations/trpc/react';
import { zodResolver } from '@hookform/resolvers/zod';
import type { IServiceProjectWithClients } from '@openpanel/db';
import { zProject } from '@openpanel/validation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SaveIcon } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { z } from 'zod';

type Props = { project: IServiceProjectWithClients };

const validator = zProject.pick({
  name: true,
  id: true,
  domain: true,
  cors: true,
  crossDomain: true,
  allowUnsafeRevenueTracking: true,
});
type IForm = z.infer<typeof validator>;

export default function EditProjectDetails({ project }: Props) {
  const { t } = useTranslation();
  const [hasDomain, setHasDomain] = useState(project.domain !== null);
  const form = useForm<IForm>({
    resolver: zodResolver(validator),
    defaultValues: {
      id: project.id,
      name: project.name,
      domain: project.domain,
      cors: project.cors,
      crossDomain: project.crossDomain,
      allowUnsafeRevenueTracking: project.allowUnsafeRevenueTracking,
    },
  });
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const mutation = useMutation(
    trpc.project.update.mutationOptions({
      onError: handleError,
      onSuccess: () => {
        toast.success(t('settings.details_updated_toast'));
        queryClient.invalidateQueries(
          trpc.project.list.queryFilter({
            organizationId: project.organizationId,
          }),
        );
        queryClient.invalidateQueries(
          trpc.project.getProjectWithClients.queryFilter({
            projectId: project.id,
          }),
        );
      },
    }),
  );

  const onSubmit = (values: IForm) => {
    if (hasDomain) {
      let error = false;
      if (values.cors.length === 0) {
        form.setError('cors', {
          type: 'required',
          message: t('settings.details_cors_required'),
        });
        error = true;
      }

      if (!values.domain) {
        form.setError('domain', {
          type: 'required',
          message: t('settings.details_domain_required'),
        });
        error = true;
      }

      if (error) {
        return;
      }
    }

    mutation.mutate(hasDomain ? values : { ...values, cors: [], domain: null });
  };

  return (
    <Widget className="max-w-screen-md w-full">
      <WidgetHead>
        <span className="title">{t('settings.details_title')}</span>
      </WidgetHead>
      <WidgetBody>
        <form onSubmit={form.handleSubmit(onSubmit)} className="col gap-4">
          <InputWithLabel
            label={t('settings.details_name_label')}
            {...form.register('name')}
            defaultValue={project.name}
          />

          <div className="-mb-2 flex gap-2 items-center justify-between">
            <Label className="mb-0">{t('settings.details_domain_label')}</Label>
            <Switch checked={hasDomain} onCheckedChange={setHasDomain} />
          </div>
          <AnimateHeight open={hasDomain}>
            <Input
              placeholder="https://example.com"
              {...form.register('domain')}
              className="mb-4"
              error={form.formState.errors.domain?.message}
              defaultValue={project.domain ?? ''}
            />

            <Controller
              name="cors"
              control={form.control}
              render={({ field }) => (
                <WithLabel
                  label={t('settings.details_allowed_domains_label')}
                  error={form.formState.errors.cors?.message}
                >
                  <TagInput
                    {...field}
                    error={form.formState.errors.cors?.message}
                    placeholder={t('settings.details_add_domain_placeholder')}
                    value={field.value ?? []}
                    renderTag={(tag) =>
                      tag === '*' ? t('settings.details_allow_all_domains') : tag
                    }
                    onChange={(newValue) => {
                      field.onChange(
                        newValue.map((item) => {
                          const trimmed = item.trim();
                          if (
                            trimmed.startsWith('http://') ||
                            trimmed.startsWith('https://') ||
                            trimmed === '*'
                          ) {
                            return trimmed;
                          }
                          return `https://${trimmed}`;
                        }),
                      );
                    }}
                  />
                </WithLabel>
              )}
            />
            <Controller
              name="crossDomain"
              control={form.control}
              render={({ field }) => {
                return (
                  <WithLabel
                    label={t('settings.details_cross_domain_label')}
                    className="mt-4"
                  >
                    <CheckboxInput
                      ref={field.ref}
                      onBlur={field.onBlur}
                      defaultChecked={field.value}
                      onCheckedChange={field.onChange}
                    >
                      <div>{t('settings.details_cross_domain_enable')}</div>
                      <div className="font-normal text-muted-foreground">
                        {t('settings.details_cross_domain_description')}
                      </div>
                    </CheckboxInput>
                  </WithLabel>
                );
              }}
            />
          </AnimateHeight>

          <Controller
            name="allowUnsafeRevenueTracking"
            control={form.control}
            render={({ field }) => {
              return (
                <WithLabel label={t('settings.details_revenue_tracking_label')}>
                  <CheckboxInput
                    ref={field.ref}
                    onBlur={field.onBlur}
                    defaultChecked={field.value}
                    onCheckedChange={field.onChange}
                  >
                    <div>{t('settings.details_unsafe_revenue_enable')}</div>
                    <div className="font-normal text-muted-foreground">
                      {t('settings.details_unsafe_revenue_description')}
                    </div>
                  </CheckboxInput>
                </WithLabel>
              );
            }}
          />

          <Button
            loading={mutation.isPending}
            type="submit"
            icon={SaveIcon}
            className="self-start"
          >
            {t('common.save')}
          </Button>
        </form>
      </WidgetBody>
    </Widget>
  );
}
