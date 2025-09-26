'use client';

import AnimateHeight from '@/components/animate-height';
import { ButtonContainer } from '@/components/button-container';
import { CreateClientSuccess } from '@/components/clients/create-client-success';
import { CheckboxItem } from '@/components/forms/checkbox-item';
import { InputWithLabel, WithLabel } from '@/components/forms/input-with-label';
import TagInput from '@/components/forms/tag-input';
import { Button } from '@/components/ui/button';
import { useAppParams } from '@/hooks/useAppParams';
import { api, handleError } from '@/trpc/client';
import { zodResolver } from '@hookform/resolvers/zod';
import { zOnboardingProject } from '@openpanel/validation';
import {
  MonitorIcon,
  SaveIcon,
  ServerIcon,
  SmartphoneIcon,
} from 'lucide-react';
import { useEffect } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';

const validator = zOnboardingProject;
type IForm = z.infer<typeof validator>;

export default function AddProject() {
  const { organizationId } = useAppParams();
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
  const mutation = api.project.create.useMutation({
    onError: handleError,
    onSuccess: () => {
      toast.success('Project created');
    },
  });

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
          <ModalHeader title="Success" text={'Your project is created'} />
          {mutation.data.client && (
            <CreateClientSuccess {...mutation.data.client} />
          )}
          <ButtonContainer className="justify-end">
            <Button className="flex-1" onClick={() => popModal()}>
              Close
            </Button>
          </ButtonContainer>
        </>
      ) : (
        <>
          <ModalHeader title="Create project" />
          <form onSubmit={form.handleSubmit(onSubmit)} className="col gap-4">
            <InputWithLabel
              label="Project name"
              placeholder="Eg. My music site"
              {...form.register('project')}
              error={form.formState.errors.project?.message}
            />

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

            <ButtonContainer className="justify-end">
              <Button
                loading={mutation.isLoading}
                type="submit"
                icon={SaveIcon}
              >
                Create project
              </Button>
            </ButtonContainer>
          </form>
        </>
      )}
    </ModalContent>
  );
}
