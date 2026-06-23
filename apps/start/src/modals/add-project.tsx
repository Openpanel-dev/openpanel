import { zodResolver } from '@hookform/resolvers/zod';
import { zOnboardingProject } from '@openpanel/validation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  MonitorIcon,
  SaveIcon,
  ServerIcon,
  SmartphoneIcon,
} from 'lucide-react';
import { useEffect } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { z } from 'zod';
import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';
import AnimateHeight from '@/components/animate-height';
import { ButtonContainer } from '@/components/button-container';
import { CreateClientSuccess } from '@/components/clients/create-client-success';
import { CheckboxItem } from '@/components/forms/checkbox-item';
import { InputWithLabel, WithLabel } from '@/components/forms/input-with-label';
import TagInput from '@/components/forms/tag-input';
import { Button } from '@/components/ui/button';
import { useAppParams } from '@/hooks/use-app-params';
import { handleError, useTRPC } from '@/integrations/trpc/react';

const validator = zOnboardingProject;
type IForm = z.infer<typeof validator>;

export default function AddProject() {
  const { t } = useTranslation();
  const { organizationId } = useAppParams();
  const navigate = useNavigate();
  const form = useForm<IForm>({
    resolver: zodResolver(validator),
    defaultValues: {
      organizationId,
      timezone: '', // Not used
      project: '',
      domain: '',
      cors: [],
      website: false,
      app: false,
      backend: false,
    },
  });
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const mutation = useMutation(
    trpc.project.create.mutationOptions({
      onError: handleError,
      onSuccess: (res) => {
        queryClient.invalidateQueries(
          trpc.project.list.queryFilter({ organizationId })
        );
        toast.success(t('projects.toast_created'), {
          description: `${res.name}`,
          action: {
            label: t('projects.view_project'),
            onClick: () =>
              navigate({
                to: '/$organizationId/$projectId',
                params: {
                  organizationId,
                  projectId: res.id,
                },
              }),
          },
        });
      },
    })
  );

  const onSubmit = (values: IForm) => {
    mutation.mutate(values);
  };

  const isWebsite = useWatch({
    name: 'website',
    control: form.control,
  });

  const isApp = useWatch({
    name: 'app',
    control: form.control,
  });

  const isBackend = useWatch({
    name: 'backend',
    control: form.control,
  });

  useEffect(() => {
    if (!isWebsite) {
      form.setValue('domain', null);
      form.setValue('cors', []);
    }
  }, [isWebsite, form]);

  useEffect(() => {
    form.clearErrors();
  }, [isWebsite, isApp, isBackend]);

  return (
    <ModalContent>
      {mutation.isSuccess ? (
        <>
          <ModalHeader
            text={t('projects.created_success_description')}
            title={t('common.success')}
          />
          {mutation.data.client && (
            <CreateClientSuccess {...mutation.data.client} />
          )}
          <ButtonContainer className="justify-end">
            <Button className="flex-1" onClick={() => popModal()}>
              {t('common.close')}
            </Button>
          </ButtonContainer>
        </>
      ) : (
        <>
          <ModalHeader title={t('projects.create_project')} />
          <form className="col gap-4" onSubmit={form.handleSubmit(onSubmit)}>
            <InputWithLabel
              label={t('projects.project_name')}
              placeholder={t('projects.project_name_placeholder')}
              {...form.register('project')}
              error={form.formState.errors.project?.message}
            />

            <div className="flex flex-col divide-y">
              <Controller
                control={form.control}
                name="website"
                render={({ field }) => (
                  <CheckboxItem
                    description={t('projects.website_description')}
                    disabled={isApp}
                    error={form.formState.errors.website?.message}
                    Icon={MonitorIcon}
                    label={t('projects.website')}
                    {...field}
                  >
                    <AnimateHeight open={isWebsite && !isApp}>
                      <div className="p-4 pl-14">
                        <InputWithLabel
                          label={t('projects.domain')}
                          placeholder={t('projects.domain_placeholder')}
                          {...form.register('domain')}
                          className="mb-4"
                          error={form.formState.errors.domain?.message}
                          onBlur={(e) => {
                            const value = e.target.value.trim();
                            if (
                              value.includes('.') &&
                              form.getValues().cors.length === 0 &&
                              !form.formState.errors.domain
                            ) {
                              form.setValue('cors', [value]);
                            }
                          }}
                        />

                        <Controller
                          control={form.control}
                          name="cors"
                          render={({ field }) => (
                            <WithLabel label={t('projects.allowed_domains')}>
                              <TagInput
                                {...field}
                                error={form.formState.errors.cors?.message}
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
                                    })
                                  );
                                }}
                                placeholder={t(
                                  'projects.allowed_domains_placeholder',
                                )}
                                renderTag={(tag) =>
                                  tag === '*'
                                    ? t('projects.accept_events_any_domain')
                                    : tag
                                }
                                value={field.value ?? []}
                              />
                            </WithLabel>
                          )}
                        />
                      </div>
                    </AnimateHeight>
                  </CheckboxItem>
                )}
              />
              <Controller
                control={form.control}
                name="app"
                render={({ field }) => (
                  <CheckboxItem
                    description={t('projects.app_description')}
                    disabled={isWebsite}
                    error={form.formState.errors.app?.message}
                    Icon={SmartphoneIcon}
                    label={t('projects.app')}
                    {...field}
                  />
                )}
              />
              <Controller
                control={form.control}
                name="backend"
                render={({ field }) => (
                  <CheckboxItem
                    description={t('projects.backend_description')}
                    error={form.formState.errors.backend?.message}
                    Icon={ServerIcon}
                    label={t('projects.backend_api')}
                    {...field}
                  />
                )}
              />
            </div>

            <ButtonContainer className="justify-end">
              <Button
                icon={SaveIcon}
                loading={mutation.isPending}
                type="submit"
              >
                {t('projects.create_project')}
              </Button>
            </ButtonContainer>
          </form>
        </>
      )}
    </ModalContent>
  );
}
