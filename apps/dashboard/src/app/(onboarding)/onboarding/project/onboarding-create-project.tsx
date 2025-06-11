'use client';

import AnimateHeight from '@/components/animate-height';
import { ButtonContainer } from '@/components/button-container';
import { CheckboxItem } from '@/components/forms/checkbox-item';
import { InputWithLabel, WithLabel } from '@/components/forms/input-with-label';
import TagInput from '@/components/forms/tag-input';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Label } from '@/components/ui/label';
import { useClientSecret } from '@/hooks/useClientSecret';
import { api, handleError } from '@/trpc/client';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Building,
  MonitorIcon,
  ServerIcon,
  SmartphoneIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import type { SubmitHandler } from 'react-hook-form';
import { Controller, useForm, useWatch } from 'react-hook-form';
import type { z } from 'zod';

import type { IServiceOrganization } from '@openpanel/db';
import { zOnboardingProject } from '@openpanel/validation';

import OnboardingLayout, {
  OnboardingDescription,
} from '../../onboarding-layout';

type IForm = z.infer<typeof zOnboardingProject>;

export const OnboardingCreateProject = ({
  organizations,
}: {
  organizations: IServiceOrganization[];
}) => {
  const [, setSecret] = useClientSecret();
  const router = useRouter();
  const mutation = api.onboarding.project.useMutation({
    onError: handleError,
    onSuccess(res) {
      setSecret(res.secret);
      router.push(`/onboarding/${res.projectId}/connect`);
    },
  });

  const form = useForm<IForm>({
    resolver: zodResolver(zOnboardingProject),
    defaultValues: {
      organization: '',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      project: '',
      domain: '',
      cors: [],
      website: false,
      app: false,
      backend: false,
    },
  });

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

  const onSubmit: SubmitHandler<IForm> = (values) => {
    mutation.mutate(values);
  };

  useEffect(() => {
    form.clearErrors();
  }, [isWebsite, isApp, isBackend]);

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <OnboardingLayout
        title="What are you tracking?"
        description={
          <OnboardingDescription>
            Let us know what you want to track so we can help you get started.
          </OnboardingDescription>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          {organizations.length > 0 ? (
            <Controller
              control={form.control}
              name="organizationId"
              render={({ field, formState }) => {
                return (
                  <div>
                    <Label>Workspace</Label>
                    <Combobox
                      className="w-full"
                      placeholder="Select workspace"
                      icon={Building}
                      error={formState.errors.organizationId?.message}
                      value={field.value}
                      items={
                        organizations
                          .filter((item) => item.id)
                          .map((item) => ({
                            label: item.name,
                            value: item.id,
                          })) ?? []
                      }
                      onChange={field.onChange}
                    />
                  </div>
                );
              }}
            />
          ) : (
            <>
              <InputWithLabel
                label="Workspace name"
                info="This is the name of your workspace. It can be anything you like."
                placeholder="Eg. The Music Company"
                error={form.formState.errors.organization?.message}
                {...form.register('organization')}
              />
              <Controller
                name="timezone"
                control={form.control}
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
            </>
          )}
          <InputWithLabel
            label="Project name"
            placeholder="Eg. The Music App"
            error={form.formState.errors.project?.message}
            {...form.register('project')}
          />
        </div>
        <div className="flex flex-col divide-y">
          <Controller
            name="website"
            control={form.control}
            render={({ field }) => (
              <CheckboxItem
                error={form.formState.errors.website?.message}
                Icon={MonitorIcon}
                label="Website"
                disabled={isApp}
                description="Track events and conversion for your website"
                {...field}
              >
                <AnimateHeight open={isWebsite && !isApp}>
                  <div className="p-4 pl-14">
                    <InputWithLabel
                      label="Domain"
                      placeholder="Your website address"
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
                      name="cors"
                      control={form.control}
                      render={({ field }) => (
                        <WithLabel label="Allowed domains">
                          <TagInput
                            {...field}
                            error={form.formState.errors.cors?.message}
                            placeholder="Accept events from these domains"
                            value={field.value ?? []}
                            renderTag={(tag) =>
                              tag === '*'
                                ? 'Accept events from any domains'
                                : tag
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
                  </div>
                </AnimateHeight>
              </CheckboxItem>
            )}
          />
          <Controller
            name="app"
            control={form.control}
            render={({ field }) => (
              <CheckboxItem
                error={form.formState.errors.app?.message}
                disabled={isWebsite}
                Icon={SmartphoneIcon}
                label="App"
                description="Track events and conversion for your app"
                {...field}
              />
            )}
          />
          <Controller
            name="backend"
            control={form.control}
            render={({ field }) => (
              <CheckboxItem
                error={form.formState.errors.backend?.message}
                Icon={ServerIcon}
                label="Backend / API"
                description="Track events and conversion for your backend / API"
                {...field}
              />
            )}
          />
        </div>

        <ButtonContainer>
          <div />
          <Button
            type="submit"
            size="lg"
            className="min-w-28 self-start"
            loading={mutation.isLoading}
          >
            Next
          </Button>
        </ButtonContainer>
      </OnboardingLayout>
    </form>
  );
};
