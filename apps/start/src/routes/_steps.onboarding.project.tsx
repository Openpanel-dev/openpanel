import { zodResolver } from '@hookform/resolvers/zod';
import { zOnboardingProject } from '@openpanel/validation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import {
  BuildingIcon,
  MonitorIcon,
  ServerIcon,
  SmartphoneIcon,
} from 'lucide-react';
import { useEffect } from 'react';
import {
  Controller,
  type SubmitHandler,
  useForm,
  useWatch,
} from 'react-hook-form';
import { z } from 'zod';
import AnimateHeight from '@/components/animate-height';
import { ButtonContainer } from '@/components/button-container';
import { CheckboxItem } from '@/components/forms/checkbox-item';
import { InputWithLabel, WithLabel } from '@/components/forms/input-with-label';
import TagInput from '@/components/forms/tag-input';
import FullPageLoadingState from '@/components/full-page-loading-state';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Label } from '@/components/ui/label';
import { useClientSecret } from '@/hooks/use-client-secret';
import { handleError, useTRPC } from '@/integrations/trpc/react';

const validateSearch = z.object({
  inviteId: z.string().optional(),
});
export const Route = createFileRoute('/_steps/onboarding/project')({
  component: Component,
  validateSearch,
  beforeLoad: async ({ context }) => {
    if (!context.session?.session) {
      throw redirect({ to: '/onboarding' });
    }
  },
  loader: async ({ context, location }) => {
    const search = validateSearch.safeParse(location.search);
    if (search.success && search.data.inviteId) {
      await context.queryClient.prefetchQuery(
        context.trpc.organization.getInvite.queryOptions({
          inviteId: search.data.inviteId,
        })
      );
    }
  },
  pendingComponent: FullPageLoadingState,
});

type IForm = z.infer<typeof zOnboardingProject>;

function Component() {
  const trpc = useTRPC();
  const { data: organizations } = useQuery(
    trpc.organization.list.queryOptions(undefined, { initialData: [] })
  );
  const [, setSecret] = useClientSecret();
  const navigate = useNavigate();
  const mutation = useMutation(
    trpc.onboarding.project.mutationOptions({
      onError: handleError,
      onSuccess(res) {
        setSecret(res.secret);
        navigate({
          to: '/onboarding/$projectId/connect',
          params: {
            projectId: res.projectId!,
          },
        });
      },
    })
  );

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
      <div className="p-4">
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
                      error={formState.errors.organizationId?.message}
                      icon={BuildingIcon}
                      items={
                        organizations
                          .filter((item) => item.id)
                          .map((item) => ({
                            label: item.name,
                            value: item.id,
                          })) ?? []
                      }
                      onChange={field.onChange}
                      placeholder="Select workspace"
                      value={field.value}
                    />
                  </div>
                );
              }}
            />
          ) : (
            <>
              <InputWithLabel
                error={form.formState.errors.organization?.message}
                info="This is the name of your workspace. It can be anything you like."
                label="Workspace name"
                placeholder="Eg. The Music Company"
                {...form.register('organization')}
              />
              <Controller
                control={form.control}
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
            </>
          )}
          <InputWithLabel
            error={form.formState.errors.project?.message}
            label="Project name"
            placeholder="Eg. The Music App"
            {...form.register('project')}
            className="col-span-2"
          />
        </div>
        <div className="mt-4 flex flex-col divide-y">
          <Controller
            control={form.control}
            name="website"
            render={({ field }) => (
              <CheckboxItem
                description="Track events and conversion for your website"
                disabled={isApp}
                error={form.formState.errors.website?.message}
                Icon={MonitorIcon}
                label="Website"
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
                      control={form.control}
                      name="cors"
                      render={({ field }) => (
                        <WithLabel label="Allowed domains">
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
                            placeholder="Accept events from these domains"
                            renderTag={(tag) =>
                              tag === '*'
                                ? 'Accept events from any domains'
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
                description="Track events and conversion for your app"
                disabled={isWebsite}
                error={form.formState.errors.app?.message}
                Icon={SmartphoneIcon}
                label="App"
                {...field}
              />
            )}
          />
          <Controller
            control={form.control}
            name="backend"
            render={({ field }) => (
              <CheckboxItem
                description="Track events and conversion for your backend / API"
                error={form.formState.errors.backend?.message}
                Icon={ServerIcon}
                label="Backend / API"
                {...field}
              />
            )}
          />
        </div>
      </div>

      <ButtonContainer className="border-t p-4">
        <div />
        <Button
          className="min-w-28 self-start"
          loading={mutation.isPending}
          size="lg"
          type="submit"
        >
          Next
        </Button>
      </ButtonContainer>
    </form>
  );
}
