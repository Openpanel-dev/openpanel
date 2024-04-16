'use client';

import { useEffect } from 'react';
import AnimateHeight from '@/components/animate-height';
import { ButtonContainer } from '@/components/button-container';
import { CheckboxItem } from '@/components/forms/checkbox-item';
import { InputWithLabel } from '@/components/forms/input-with-label';
import { Button } from '@/components/ui/button';
import { api, handleError } from '@/trpc/client';
import { zodResolver } from '@hookform/resolvers/zod';
import { MonitorIcon, ServerIcon, SmartphoneIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { SubmitHandler } from 'react-hook-form';
import { Controller, useForm, useWatch } from 'react-hook-form';
import type { z } from 'zod';

import { zOnboardingProject } from '@openpanel/validation';

import OnboardingLayout, { OnboardingDescription } from '../onboarding-layout';

type IForm = z.infer<typeof zOnboardingProject>;

const Tracking = () => {
  const router = useRouter();
  const mutation = api.onboarding.project.useMutation({
    onError: handleError,
    onSuccess(res) {
      router.push(`/onboarding/${res.projectId}/connect`);
    },
  });

  const form = useForm<IForm>({
    resolver: zodResolver(zOnboardingProject),
    defaultValues: {
      organization: '',
      project: '',
      domain: null,
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
          <InputWithLabel
            label="Workspace name"
            info="This is the name of your workspace. It can be anything you like."
            placeholder="Eg. The Music Company"
            error={form.formState.errors.organization?.message}
            {...form.register('organization')}
          />
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
                      placeholder="https://example.com"
                      error={form.formState.errors.domain?.message}
                      {...form.register('domain')}
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

export default Tracking;
