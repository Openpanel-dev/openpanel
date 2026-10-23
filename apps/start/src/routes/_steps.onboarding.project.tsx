import { zodResolver } from '@hookform/resolvers/zod';
import { zOnboardingProject } from '@openpanel/core/modules/onboarding/onboarding.constants';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import {
  BuildingIcon,
  CheckIcon,
  type LucideIcon,
  MonitorIcon,
  ServerIcon,
  SmartphoneIcon,
} from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import {
  Controller,
  type SubmitErrorHandler,
  type SubmitHandler,
  useForm,
  useWatch,
} from 'react-hook-form';
import { z } from 'zod';
import AnimateHeight from '@/components/animate-height';
import {
  fieldMessageId,
  InputWithLabel,
  WithLabel,
} from '@/components/forms/input-with-label';
import TagInput from '@/components/forms/tag-input';
import FullPageLoadingState from '@/components/full-page-loading-state';
import { OnboardingHeading } from '@/components/onboarding/onboarding-heading';
import { useOnboardingShell } from '@/components/onboarding/onboarding-shell';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Label } from '@/components/ui/label';
import { useClientSecret, useMcpToken } from '@/hooks/use-client-secret';
import { handleError, useTRPC } from '@/integrations/trpc/react';
import { cn } from '@/utils/cn';
import {
  failureReason,
  trackFunnel,
  useSecondsOnStep,
} from '@/utils/funnel-tracking';
import { isSignedIn } from '@/utils/route-session';

const validateSearch = z.object({
  inviteId: z.string().optional(),
});
export const Route = createFileRoute('/_steps/onboarding/project')({
  component: Component,
  validateSearch,
  beforeLoad: async ({ context }) => {
    if (!(await isSignedIn(context))) {
      throw redirect({ to: '/onboarding' });
    }
  },
  loader: async ({ context, location }) => {
    const search = validateSearch.safeParse(location.search);
    const promises: Promise<unknown>[] = [
      context.queryClient.prefetchQuery(
        context.trpc.organization.list.queryOptions()
      ),
    ];
    if (search.success && search.data.inviteId) {
      promises.push(
        context.queryClient.prefetchQuery(
          context.trpc.organization.getInvite.queryOptions({
            inviteId: search.data.inviteId,
          })
        )
      );
    }
    await Promise.all(promises);
  },
  pendingComponent: FullPageLoadingState,
});

type IForm = z.infer<typeof zOnboardingProject>;
type ProjectType = 'website' | 'app' | 'backend';

const PROJECT_TYPES: {
  key: ProjectType;
  label: string;
  description: string;
  Icon: LucideIcon;
}[] = [
  {
    key: 'website',
    label: 'Website',
    description: 'Pages, traffic sources, funnels',
    Icon: MonitorIcon,
  },
  {
    key: 'app',
    label: 'App',
    description: 'iOS, Android, React Native',
    Icon: SmartphoneIcon,
  },
  {
    key: 'backend',
    label: 'Backend / API',
    description: 'Server-side events',
    Icon: ServerIcon,
  },
];

const PROJECT_STEP_SHELL = { step: 1, wide: false } as const;

const TIMEZONES = ['UTC', ...Intl.supportedValuesOf('timeZone')].map(
  (zone) => ({ value: zone, label: zone })
);

function toOrigin(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === '*' || /^https?:\/\//.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

function Component() {
  const workspaceFieldId = useId();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: organizations } = useQuery(
    trpc.organization.list.queryOptions(undefined, { initialData: [] })
  );
  const [, setSecret] = useClientSecret();
  const [, setMcpToken] = useMcpToken();
  const navigate = useNavigate();
  const secondsOnStep = useSecondsOnStep();
  useOnboardingShell(PROJECT_STEP_SHELL);
  const mutation = useMutation(
    trpc.onboarding.project.mutationOptions({
      onError(error) {
        trackFunnel('onboarding_project_create_failed', {
          reason: failureReason(error),
        });
        handleError(error);
      },
      onSuccess(res, input) {
        trackFunnel('onboarding_project_created', {
          projectId: res.projectId,
          types: [
            input.website && 'website',
            input.app && 'app',
            input.backend && 'backend',
          ].filter((type): type is string => Boolean(type)),
          hasDomain: Boolean(input.domain),
          extraDomains: Math.max(0, (input.cors ?? []).length - 1),
          createdWorkspace: Boolean(input.organization),
          secondsOnStep: secondsOnStep(),
        });
        queryClient.invalidateQueries(trpc.organization.list.queryFilter());
        setSecret(res.secret);
        setMcpToken(res.mcpToken);
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

  const [isWebsite, isApp, isBackend, projectName, domain, workspaceName] =
    useWatch({
      control: form.control,
      name: ['website', 'app', 'backend', 'project', 'domain', 'organization'],
    });
  const selectedTypes: Record<ProjectType, boolean> = {
    website: isWebsite,
    app: isApp,
    backend: isBackend,
  };

  const hasWorkspaces = organizations.length > 0;
  const [useExistingWorkspace, setUseExistingWorkspace] = useState(true);
  const createsWorkspace = !(hasWorkspaces && useExistingWorkspace);
  const [workspaceEdited, setWorkspaceEdited] = useState(false);
  const [showWorkspaceSettings, setShowWorkspaceSettings] = useState(false);
  const [showCorsInput, setShowCorsInput] = useState(false);

  useEffect(() => {
    trackFunnel('onboarding_project_viewed', { hasWorkspaces });
  }, [hasWorkspaces]);

  // The workspace is the billing unit, not something a new user should have
  // to name before seeing a single chart: it follows the project name until
  // they edit it themselves.
  useEffect(() => {
    if (!workspaceEdited) {
      form.setValue('organization', projectName);
    }
  }, [projectName, workspaceEdited, form]);

  useEffect(() => {
    if (!isWebsite) {
      form.setValue('domain', null);
      form.setValue('cors', []);
      setShowCorsInput(false);
    }
  }, [isWebsite, form]);

  useEffect(() => {
    form.clearErrors();
  }, [isWebsite, isApp, isBackend, form]);

  // `enforceAccess` checks any organizationId key that is present, even an
  // undefined one, so each branch sends only its own workspace field.
  const onSubmit: SubmitHandler<IForm> = ({
    organization,
    organizationId,
    ...values
  }) => {
    if (createsWorkspace) {
      mutation.mutate({ ...values, organization });
      return;
    }
    if (!organizationId) {
      form.setError('organizationId', { message: 'Select a workspace' });
      return;
    }
    mutation.mutate({ ...values, organizationId });
  };
  const onInvalid: SubmitErrorHandler<IForm> = (errors) => {
    trackFunnel('onboarding_project_invalid', {
      fields: Object.keys(errors),
    });
  };

  const typeError =
    form.formState.errors.website?.message ??
    form.formState.errors.app?.message ??
    form.formState.errors.backend?.message;

  return (
    <form className="col" onSubmit={form.handleSubmit(onSubmit, onInvalid)}>
      <OnboardingHeading
        className="mb-10"
        description="A project is one website, app or service you want to track. You can add more later."
        title={hasWorkspaces ? 'Create a project' : 'Create your first project'}
      />

      {hasWorkspaces && (
        <div className="col mb-10 gap-3">
          <Label className="mb-0 text-base">Workspace</Label>
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-def-200 p-1 dark:bg-def-300">
            {[
              { label: 'Use existing workspace', existing: true },
              { label: 'Create new workspace', existing: false },
            ].map((option) => (
              <button
                aria-pressed={useExistingWorkspace === option.existing}
                className={cn(
                  'rounded-lg px-4 py-2.5 font-medium transition-colors',
                  useExistingWorkspace === option.existing
                    ? 'bg-background shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                key={option.label}
                onClick={() => {
                  trackFunnel('onboarding_workspace_mode_changed', {
                    mode: option.existing ? 'existing' : 'new',
                  });
                  setUseExistingWorkspace(option.existing);
                }}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
          <AnimateHeight open={!createsWorkspace}>
            <Controller
              control={form.control}
              name="organizationId"
              render={({ field, formState }) => (
                <WithLabel
                  error={formState.errors.organizationId?.message}
                  id={workspaceFieldId}
                  label="Which workspace?"
                >
                  <Combobox
                    aria-describedby={
                      formState.errors.organizationId
                        ? fieldMessageId(workspaceFieldId)
                        : undefined
                    }
                    className="w-full"
                    error={formState.errors.organizationId?.message}
                    icon={BuildingIcon}
                    id={workspaceFieldId}
                    items={organizations.map((item) => ({
                      label: item.name,
                      value: item.id,
                    }))}
                    onChange={field.onChange}
                    placeholder="Select workspace"
                    size="xl"
                    value={field.value}
                    variant="input"
                  />
                </WithLabel>
              )}
            />
          </AnimateHeight>
        </div>
      )}

      <InputWithLabel
        autoFocus
        className="mb-10"
        error={form.formState.errors.project?.message}
        label="Project name"
        placeholder="Acme"
        size="xl"
        {...form.register('project')}
      />

      <div className="col mb-10 gap-3">
        <Label className="mb-0 text-base">What are you tracking?</Label>
        <div className="grid gap-3 sm:grid-cols-3">
          {PROJECT_TYPES.map(({ key, label, description, Icon }) => {
            const active = selectedTypes[key];
            return (
              <button
                aria-pressed={active}
                className={cn(
                  'col relative items-start gap-3 rounded-xl p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active
                    ? 'bg-foreground text-background'
                    : 'bg-def-200 hover:bg-def-300 dark:bg-def-300 dark:hover:bg-def-400/60'
                )}
                key={key}
                onClick={() => {
                  trackFunnel('onboarding_project_type_toggled', {
                    type: key,
                    selected: !active,
                  });
                  form.setValue(key, !active, { shouldValidate: true });
                }}
                type="button"
              >
                <Icon size={22} strokeWidth={1.75} />
                <span className="col gap-0.5">
                  <span className="font-medium">{label}</span>
                  <span
                    className={cn(
                      'text-xs',
                      active ? 'text-background/70' : 'text-muted-foreground'
                    )}
                  >
                    {description}
                  </span>
                </span>
                {active && (
                  <CheckIcon className="absolute top-4 right-4" size={16} />
                )}
              </button>
            );
          })}
        </div>
        <p className="text-muted-foreground text-sm">
          Pick everything that applies. It only decides which install guides we
          show first.
        </p>
        {typeError && (
          <p className="text-destructive text-sm">
            Pick at least one thing to track
          </p>
        )}
      </div>

      <AnimateHeight open={isWebsite}>
        <div className="col gap-3 pb-10">
          <InputWithLabel
            error={form.formState.errors.domain?.message}
            hint="Browser events are only accepted from this domain."
            inputMode="url"
            label="Website URL"
            placeholder="acme.com"
            size="xl"
            {...form.register('domain')}
            onBlur={(event) => {
              const value = toOrigin(event.target.value);
              if (!value) {
                return;
              }
              form.setValue('domain', value, { shouldValidate: true });
              if (form.getValues().cors.length === 0) {
                form.setValue('cors', [value]);
              }
            }}
          />
          {domain && (
            <button
              className="self-start text-muted-foreground text-sm hover:text-foreground hover:underline"
              onClick={() => {
                trackFunnel('onboarding_extra_domains_toggled', {
                  open: !showCorsInput,
                });
                setShowCorsInput((open) => !open);
              }}
              type="button"
            >
              Also track other domains (staging, localhost…)
            </button>
          )}
          <AnimateHeight open={showCorsInput}>
            <Controller
              control={form.control}
              name="cors"
              render={({ field }) => (
                <WithLabel
                  error={form.formState.errors.cors?.message}
                  label="Allowed domains"
                >
                  <TagInput
                    {...field}
                    error={form.formState.errors.cors?.message}
                    onChange={(values: string[]) =>
                      field.onChange(values.map(toOrigin))
                    }
                    placeholder="Add a domain and press Enter"
                    renderTag={(tag: string) =>
                      tag === '*' ? 'Any domain' : tag
                    }
                    value={field.value ?? []}
                  />
                </WithLabel>
              )}
            />
          </AnimateHeight>
        </div>
      </AnimateHeight>

      <AnimateHeight open={createsWorkspace}>
        <div className="col mb-10 gap-3 rounded-xl border p-5">
          <div className="row items-center justify-between gap-4">
            <div className="text-muted-foreground text-sm">
              Workspace{' '}
              <span className="font-medium text-foreground">
                {workspaceName || 'named after the project'}
              </span>{' '}
              · {form.getValues('timezone')}
            </div>
            <button
              className="shrink-0 text-sm underline-offset-4 hover:underline"
              onClick={() => {
                trackFunnel('onboarding_workspace_settings_toggled', {
                  open: !showWorkspaceSettings,
                });
                setShowWorkspaceSettings((open) => !open);
              }}
              type="button"
            >
              {showWorkspaceSettings ? 'Done' : 'Change'}
            </button>
          </div>
          <AnimateHeight open={showWorkspaceSettings}>
            <div className="grid gap-4 pt-3 sm:grid-cols-2">
              <InputWithLabel
                error={form.formState.errors.organization?.message}
                hint="Your team and billing live here."
                label="Workspace name"
                placeholder="Acme Inc"
                size="xl"
                {...form.register('organization', {
                  onChange: () => setWorkspaceEdited(true),
                })}
              />
              <Controller
                control={form.control}
                name="timezone"
                render={({ field }) => (
                  <WithLabel
                    hint="Used for daily and weekly reports."
                    label="Timezone"
                  >
                    <Combobox
                      className="w-full"
                      items={TIMEZONES}
                      onChange={field.onChange}
                      placeholder="Select timezone"
                      searchable
                      size="xl"
                      value={field.value}
                      variant="input"
                    />
                  </WithLabel>
                )}
              />
            </div>
          </AnimateHeight>
        </div>
      </AnimateHeight>

      <div className="row justify-end border-t pt-8">
        <Button
          className="min-w-44"
          loading={mutation.isPending}
          size="xl"
          type="submit"
        >
          Create project
        </Button>
      </div>
    </form>
  );
}
