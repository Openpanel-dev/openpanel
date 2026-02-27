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
import { useEffect, useState } from 'react';
import {
  Controller,
  type SubmitHandler,
  useForm,
  useWatch,
} from 'react-hook-form';
import { z } from 'zod';
import AnimateHeight from '@/components/animate-height';
import { ButtonContainer } from '@/components/button-container';
import { InputWithLabel, WithLabel } from '@/components/forms/input-with-label';
import TagInput from '@/components/forms/tag-input';
import FullPageLoadingState from '@/components/full-page-loading-state';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Label } from '@/components/ui/label';
import { useClientSecret } from '@/hooks/use-client-secret';
import { handleError, useTRPC } from '@/integrations/trpc/react';
import { cn } from '@/utils/cn';

const validateSearch = z.object({
  inviteId: z.string().optional(),
});
export const Route = createFileRoute('/_steps/onboarding/project')({
  component: Component,
  validateSearch,
  beforeLoad: ({ context }) => {
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

  const domain = useWatch({
    name: 'domain',
    control: form.control,
  });

  const [showCorsInput, setShowCorsInput] = useState(false);

  useEffect(() => {
    if (!isWebsite) {
      form.setValue('domain', null);
      form.setValue('cors', []);
      setShowCorsInput(false);
    }
  }, [isWebsite, form]);

  const onSubmit: SubmitHandler<IForm> = (values) => {
    mutation.mutate(values);
  };

  useEffect(() => {
    form.clearErrors();
  }, [isWebsite, isApp, isBackend]);

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={form.handleSubmit(onSubmit)}
    >
      <div className="scrollbar-thin flex-1 overflow-y-auto p-4">
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
                      searchable
                      value={field.value}
                    />
                  </WithLabel>
                )}
              />
            </>
          )}
          <InputWithLabel
            error={form.formState.errors.project?.message}
            label="Your first project name"
            placeholder="Eg. The Music App"
            {...form.register('project')}
            className="col-span-2"
          />
        </div>
        <div className="mt-4">
          <Label className="mb-2">What are you tracking?</Label>
          <div className="grid grid-cols-3 gap-3">
            {[
              {
                key: 'website' as const,
                label: 'Website',
                Icon: MonitorIcon,
                active: isWebsite,
              },
              {
                key: 'app' as const,
                label: 'App',
                Icon: SmartphoneIcon,
                active: isApp,
              },
              {
                key: 'backend' as const,
                label: 'Backend / API',
                Icon: ServerIcon,
                active: isBackend,
              },
            ].map(({ key, label, Icon, active }) => (
              <button
                className={cn(
                  'flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors',
                  active
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border text-muted-foreground hover:border-primary/40'
                )}
                key={key}
                onClick={() => {
                  form.setValue(key, !active, { shouldValidate: true });
                }}
                type="button"
              >
                <Icon size={24} />
                <span className="font-medium text-sm">{label}</span>
              </button>
            ))}
          </div>
          {(form.formState.errors.website?.message ||
            form.formState.errors.app?.message ||
            form.formState.errors.backend?.message) && (
            <p className="mt-2 text-destructive text-sm">
              At least one type must be selected
            </p>
          )}
          <AnimateHeight open={isWebsite}>
            <div className="mt-4">
              <InputWithLabel
                label="Domain"
                placeholder="example.com"
                {...form.register('domain')}
                error={form.formState.errors.domain?.message}
                onBlur={(e) => {
                  const raw = e.target.value.trim();
                  if (!raw) {
                    return;
                  }

                  const hasProtocol =
                    raw.startsWith('http://') || raw.startsWith('https://');
                  const value = hasProtocol ? raw : `https://${raw}`;

                  form.setValue('domain', value, { shouldValidate: true });
                  if (form.getValues().cors.length === 0) {
                    form.setValue('cors', [value]);
                  }
                }}
              />
              {domain && (
                <>
                  <button
                    className="mt-2 text-muted-foreground text-sm hover:text-foreground"
                    onClick={() => setShowCorsInput((open) => !open)}
                    type="button"
                  >
                    All events from{' '}
                    <span className="font-medium text-foreground">
                      {domain}
                    </span>{' '}
                    will be allowed. Do you want to allow any other?
                  </button>
                  <AnimateHeight open={showCorsInput}>
                    <div className="mt-3">
                      <Controller
                        control={form.control}
                        name="cors"
                        render={({ field }) => (
                          <WithLabel label="Allowed domains">
                            <TagInput
                              {...field}
                              error={form.formState.errors.cors?.message}
                              onChange={(newValue: string[]) => {
                                field.onChange(
                                  newValue.map((item: string) => {
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
                              renderTag={(tag: string) =>
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
                </>
              )}
            </div>
          </AnimateHeight>
        </div>
      </div>

      <ButtonContainer className="mt-0 flex-shrink-0 border-t bg-background p-4">
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
