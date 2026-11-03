import {
  BellIcon,
  CloudIcon,
  DatabaseIcon,
  FilterIcon,
  HashIcon,
  MailIcon,
  MessageCircleIcon,
  MonitorIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
  WebhookIcon,
} from 'lucide-react';
import { MANAGE_MCP_MOCKS } from './manage-mcp';
import { MANAGE_SHARING_MOCKS } from './manage-sharing';
import {
  Avatar,
  FilterChip,
  MockBadge,
  MockTabs,
  Panel,
  Pill,
} from './primitives';
import {
  FormField,
  FormInput,
  FormSelect,
  FormTextarea,
  MockButton,
  MockSheet,
  SegmentedControl,
} from './primitives-ui';
import type { MockDefinition } from './types';
import { cn } from '@/lib/utils';

// Notifications and integrations. Members, sharing and MCP live in the
// sibling files and register through this file.

function PageTitle({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="col gap-0.5">
      <span className="font-semibold text-[15px]">{title}</span>
      <span className="text-[12px] text-neutral-500">{description}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notifications

export function EventBadge({
  name,
  filtered = false,
}: {
  name: string;
  filtered?: boolean;
}) {
  return (
    <span className="row items-center gap-1 rounded-md border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 font-mono text-[11px]">
      {name}
      {filtered && <FilterIcon className="size-2.5 text-neutral-400" />}
    </span>
  );
}

function TargetBadge({
  children,
  tone = 'blue',
}: {
  children: React.ReactNode;
  tone?: 'blue' | 'emerald' | 'neutral';
}) {
  return (
    <MockBadge tone={tone}>
      <span className="relative flex size-1.5">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-50" />
        <span className="relative inline-flex size-1.5 rounded-full bg-current" />
      </span>
      {children}
    </MockBadge>
  );
}

const FUNNEL_RULE_STEPS = ['screen_view /pricing', 'started_trial', 'upgraded'];

export function RuleCard({
  name,
  kind,
  event = 'purchase',
  targets,
  className,
}: {
  name: string;
  kind: 'events' | 'funnel';
  event?: string;
  targets: { label: string; tone?: 'blue' | 'emerald' | 'neutral' }[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        'col gap-3 rounded-lg border border-neutral-200 bg-white p-4',
        className
      )}
    >
      <div className="row items-center justify-between">
        <span className="font-medium text-[13px]">{name}</span>
        <span className="row gap-2 text-neutral-400">
          <PencilIcon className="size-3" />
          <Trash2Icon className="size-3" />
        </span>
      </div>
      {kind === 'events' ? (
        <p className="row flex-wrap items-center gap-1.5 text-[12px] text-neutral-600">
          Get notified when <EventBadge filtered name={event} /> occurs
        </p>
      ) : (
        <div className="col gap-2 text-[12px] text-neutral-600">
          <span>Get notified when a session has completed this funnel</span>
          <ol className="col gap-1">
            {FUNNEL_RULE_STEPS.map((step, index) => (
              <li className="row items-center gap-2" key={step}>
                <span className="center-center size-4 rounded-full bg-neutral-900 font-mono text-[9px] text-white">
                  {index + 1}
                </span>
                <span className="font-mono text-neutral-800">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      <div className="row flex-wrap gap-1.5 border-neutral-100 border-t pt-3">
        {targets.map((target) => (
          <TargetBadge key={target.label} tone={target.tone}>
            {target.label}
          </TargetBadge>
        ))}
      </div>
    </div>
  );
}

export function NotificationRulesContent() {
  return (
    <>
      <PageTitle
        description="See notifications and manage your rules when to get notifications"
        title="Notifications"
      />
      <div className="row items-end justify-between">
        <MockTabs active={1} items={['Notifications', 'Rules']} />
        <Pill active>
          <PlusIcon className="size-3" />
          Add rule
        </Pill>
      </div>
      <div className="grid @2xl:grid-cols-2 grid-cols-1 gap-3">
        <RuleCard
          kind="events"
          name="New purchases"
          targets={[
            { label: 'Slack · #sales' },
            { label: 'Website', tone: 'neutral' },
          ]}
        />
        <RuleCard
          kind="funnel"
          name="Trial to paid"
          targets={[
            { label: 'Slack · #growth' },
            { label: 'Email', tone: 'emerald' },
          ]}
        />
        <RuleCard
          event="sign_up"
          kind="events"
          name="Sign ups on android"
          targets={[{ label: 'Discord · #growth' }]}
        />
        <RuleCard
          event="error"
          kind="events"
          name="Checkout errors"
          targets={[
            { label: 'Zapier webhook' },
            { label: 'Email', tone: 'emerald' },
          ]}
        />
      </div>
    </>
  );
}

export function RuleEditorContent() {
  return (
    <div className="row items-start gap-4">
      <div className="col w-[260px] shrink-0 gap-3 opacity-60">
        <PageTitle
          description="Manage your rules when to get notifications"
          title="Notifications"
        />
        <MockTabs active={1} items={['Notifications', 'Rules']} />
        <RuleCard
          kind="events"
          name="New purchases"
          targets={[{ label: 'Slack · #sales' }]}
        />
      </div>
      <MockSheet
        footer={
          <>
            <MockButton>Cancel</MockButton>
            <MockButton primary>Create rule</MockButton>
          </>
        }
        title="Create rule"
        width={340}
      >
        <FormField label="Rule name">
          <FormInput value="Sign ups on android" />
        </FormField>
        <FormField label="Type">
          <SegmentedControl items={['Events', 'Funnel']} />
        </FormField>
        <FormField label="Events">
          <div className="col gap-2">
            <div className="row items-center gap-2">
              <span className="center-center size-5 rounded-full bg-neutral-900 font-mono text-[10px] text-white">
                1
              </span>
              <FormSelect className="flex-1" value="sign_up" />
              <FilterIcon className="size-3.5 text-neutral-400" />
            </div>
            <div className="row pl-7">
              <FilterChip field="os" value="Android" />
            </div>
            <span className="row items-center gap-1 pl-7 text-[11.5px] text-neutral-500">
              <PlusIcon className="size-3" />
              Add event
            </span>
          </div>
        </FormField>
        <FormField
          hint="Variables: {{name}}, {{rule_name}}, {{profile.firstName}}, {{country}}, {{properties.plan}}"
          label="Template"
        >
          <FormTextarea
            rows={2}
            value="{{profile.firstName}} signed up from {{country}}"
          />
        </FormField>
        <FormField label="Integrations">
          <div className="row flex-wrap gap-1.5 rounded-md bg-neutral-100 p-1.5">
            <MockBadge tone="blue">Slack · #growth</MockBadge>
            <MockBadge tone="blue">Discord</MockBadge>
            <MockBadge>Website</MockBadge>
          </div>
        </FormField>
      </MockSheet>
    </div>
  );
}

export function SlackMessage({
  title,
  lines,
  className,
}: {
  title: string;
  lines: string[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        'row items-start gap-2.5 rounded-lg border border-neutral-200 bg-white p-3 text-[12px]',
        className
      )}
    >
      <span className="center-center size-8 shrink-0 rounded-md bg-blue-600 font-semibold text-[11px] text-white">
        OP
      </span>
      <div className="col min-w-0 gap-0.5">
        <span className="row items-center gap-1.5">
          <span className="font-semibold">OpenPanel</span>
          <MockBadge className="px-1 py-0 text-[9px]">APP</MockBadge>
          <span className="text-[11px] text-neutral-500">14:02</span>
        </span>
        <span className="font-medium">{title}</span>
        {lines.map((line) => (
          <span className="truncate text-neutral-600" key={line}>
            {line}
          </span>
        ))}
      </div>
    </div>
  );
}

export function RuleFunnelContent() {
  return (
    <div className="grid @2xl:grid-cols-[1fr_1.1fr] grid-cols-1 items-start gap-4">
      <RuleCard
        kind="funnel"
        name="Trial to paid"
        targets={[
          { label: 'Slack · #growth' },
          { label: 'Email', tone: 'emerald' },
        ]}
      />
      <div className="col gap-2">
        <span className="font-medium text-[10px] text-neutral-500 uppercase tracking-wider">
          Sent when the session ends
        </span>
        <SlackMessage
          lines={[
            'screen_view /pricing -> started_trial -> upgraded',
            'Ada Svensson · Stockholm, SE · Desktop · Chrome',
          ]}
          title='Funnel "Trial to paid" completed'
        />
        <SlackMessage
          className="opacity-60"
          lines={[
            'screen_view /pricing -> started_trial -> upgraded',
            'Marc Lemoine · Berlin, DE · Mobile · Safari',
          ]}
          title='Funnel "Trial to paid" completed'
        />
      </div>
    </div>
  );
}

const FEED = [
  {
    title: 'Ada signed up from Sweden',
    integration: 'Slack',
    country: 'SE · Stockholm',
    os: 'macOS',
    browser: 'Chrome',
    profile: 'AS',
    when: 'Today 14:02',
  },
  {
    title: 'Funnel "Trial to paid" completed',
    integration: 'Slack',
    country: 'DE · Berlin',
    os: 'iOS',
    browser: 'Safari',
    profile: 'ML',
    when: 'Today 13:48',
  },
  {
    title: 'New purchase: Pro plan · $29',
    integration: 'Website',
    country: 'US · Austin',
    os: 'Windows',
    browser: 'Edge',
    profile: 'JK',
    when: 'Today 12:10',
  },
  {
    title: 'Sofia signed up from Portugal',
    integration: 'Email',
    country: 'PT · Lisbon',
    os: 'Android',
    browser: 'Chrome',
    profile: 'SB',
    when: 'Today 09:31',
  },
  {
    title: 'New purchase: Team plan · $99',
    integration: 'Webhook',
    country: 'JP · Tokyo',
    os: 'macOS',
    browser: 'Arc',
    profile: 'TP',
    when: 'Yesterday',
  },
];

export function NotificationFeedContent() {
  return (
    <>
      <PageTitle
        description="See notifications and manage your rules when to get notifications"
        title="Notifications"
      />
      <div className="row items-end justify-between">
        <MockTabs items={['Notifications', 'Rules']} />
        <Pill>
          <SearchIcon className="size-3" />
          Search title
        </Pill>
      </div>
      <Panel padded={false}>
        <div className="grid grid-cols-[1.8fr_0.8fr_1.1fr_0.7fr_0.7fr_0.6fr_0.9fr] gap-x-3 border-neutral-200 border-b px-3 py-2 font-medium text-[10px] text-neutral-500 uppercase tracking-wider">
          <span>Title</span>
          <span>Integration</span>
          <span>Country</span>
          <span>OS</span>
          <span>Browser</span>
          <span>Profile</span>
          <span className="text-right">Created at</span>
        </div>
        {FEED.map((row) => (
          <div
            className="grid grid-cols-[1.8fr_0.8fr_1.1fr_0.7fr_0.7fr_0.6fr_0.9fr] items-center gap-x-3 border-neutral-100 border-b px-3 py-2 text-[12px] last:border-b-0"
            key={row.title}
          >
            <span className="truncate font-medium">{row.title}</span>
            <span className="text-neutral-600">{row.integration}</span>
            <span className="truncate text-neutral-600">{row.country}</span>
            <span className="text-neutral-600">{row.os}</span>
            <span className="text-neutral-600">{row.browser}</span>
            <Avatar initials={row.profile} />
            <span className="text-right text-neutral-500">{row.when}</span>
          </div>
        ))}
      </Panel>
    </>
  );
}

// ---------------------------------------------------------------------------
// Integrations

const INTEGRATIONS = [
  {
    name: 'Slack',
    description: 'Post rule matches to a channel you pick during install.',
    icon: HashIcon,
    installed: true,
  },
  {
    name: 'Discord',
    description: 'Send messages to a Discord channel through its webhook URL.',
    icon: MessageCircleIcon,
  },
  {
    name: 'Webhook',
    description:
      'POST events to any URL, with your headers and a JavaScript transform.',
    icon: WebhookIcon,
  },
  {
    name: 'S3 Export',
    description:
      'Export raw events for loading into Redshift, Snowflake, Athena, or other data warehouses.',
    icon: DatabaseIcon,
  },
  {
    name: 'GCS Export',
    description:
      'Export raw events for loading into BigQuery or other data warehouses.',
    icon: CloudIcon,
  },
];

export function IntegrationCard({
  name,
  description,
  icon: Icon,
  installed,
}: (typeof INTEGRATIONS)[number]) {
  return (
    <div className="col gap-3 rounded-lg border border-neutral-200 bg-white p-4">
      <div className="row items-center justify-between">
        <span className="center-center size-8 rounded-md bg-neutral-100 text-neutral-700">
          <Icon className="size-4" />
        </span>
        {installed ? (
          <MockBadge tone="emerald">Installed</MockBadge>
        ) : (
          <Pill className="px-2 py-1">Add</Pill>
        )}
      </div>
      <div className="col gap-0.5">
        <span className="font-medium text-[13px]">{name}</span>
        <span className="text-[11.5px] text-neutral-500 leading-snug">
          {description}
        </span>
      </div>
    </div>
  );
}

export function IntegrationsContent() {
  return (
    <>
      <PageTitle
        description="Send events and notifications to the tools you already use"
        title="Integrations"
      />
      <MockTabs active={1} items={['Installed', 'Available']} />
      <div className="grid @2xl:grid-cols-3 grid-cols-2 gap-3">
        {INTEGRATIONS.map((integration) => (
          <IntegrationCard key={integration.name} {...integration} />
        ))}
        <div className="col justify-center gap-1 rounded-lg border border-neutral-200 border-dashed p-4 text-[11.5px] text-neutral-500">
          <span className="row items-center gap-1.5 font-medium text-neutral-700">
            <MonitorIcon className="size-3.5" /> Website
            <span className="text-neutral-400">·</span>
            <MailIcon className="size-3.5" /> Email
          </span>
          Built in: a toast in the dashboard and mail to every member with
          access.
        </div>
      </div>
    </>
  );
}

const TRANSFORM_LINES = [
  '(payload) => ({',
  '  text: payload.name,',
  '  plan: payload.properties.plan,',
  '  amount: payload.properties.value,',
  '  user: payload.profile?.email,',
  '})',
];

export function CodeBox({
  lines,
  className,
}: {
  lines: string[];
  className?: string;
}) {
  return (
    <pre
      className={cn(
        'overflow-x-auto rounded-md bg-neutral-900 p-3 font-mono text-[11px] text-neutral-200 leading-relaxed',
        className
      )}
    >
      {lines.map((line) => (
        <div key={line}>{line || ' '}</div>
      ))}
    </pre>
  );
}

export function WebhookFormContent() {
  return (
    <div className="row items-start gap-4">
      <div className="col w-[240px] shrink-0 gap-3 opacity-60">
        <PageTitle
          description="Send events to the tools you already use"
          title="Integrations"
        />
        <MockTabs active={1} items={['Installed', 'Available']} />
        <IntegrationCard {...INTEGRATIONS[2]} />
      </div>
      <MockSheet
        footer={
          <>
            <MockButton>Cancel</MockButton>
            <MockButton primary>Save</MockButton>
          </>
        }
        title="Webhook"
        width={380}
      >
        <FormField label="Name">
          <FormInput value="Zapier webhook" />
        </FormField>
        <FormField label="URL">
          <FormInput
            mono
            value="https://hooks.zapier.com/hooks/catch/18/ab3c"
          />
        </FormField>
        <FormField label="Headers">
          <div className="col gap-1.5">
            <div className="grid grid-cols-[1fr_1fr] gap-1.5">
              <FormInput mono value="Authorization" />
              <FormInput mono value="••••••••••••" />
            </div>
            <span className="row items-center gap-1 text-[11.5px] text-neutral-500">
              <PlusIcon className="size-3" />
              Add Header
            </span>
          </div>
        </FormField>
        <FormField label="Payload Format">
          <SegmentedControl active={1} items={['Message', 'JavaScript']} />
        </FormField>
        <FormField
          hint="Network calls, file system access, and other dangerous operations are blocked."
          label="JavaScript Transform"
        >
          <CodeBox lines={TRANSFORM_LINES} />
        </FormField>
      </MockSheet>
    </div>
  );
}

const EXPORT_FILES = [
  { path: '2026/10/31/events-0914.jsonl.gz', size: '1.2 MB' },
  { path: '2026/10/31/events-0913.jsonl.gz', size: '1.1 MB' },
  { path: '2026/10/31/events-0912.jsonl.gz', size: '1.4 MB' },
  { path: '2026/10/31/events-0911.jsonl.gz', size: '0.9 MB' },
];

export function S3ExportContent() {
  return (
    <div className="grid @2xl:grid-cols-[1.2fr_1fr] grid-cols-1 items-start gap-4">
      <Panel title="S3 Export">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="S3 Bucket">
            <FormInput mono value="acme-analytics" />
          </FormField>
          <FormField label="Prefix">
            <FormInput mono value="openpanel-exports" />
          </FormField>
          <FormField label="Region">
            <FormSelect value="eu-north-1" />
          </FormField>
          <FormField label="Format">
            <FormSelect value="JSONL (gzip)" />
          </FormField>
        </div>
        <FormField label="Authentication">
          <SegmentedControl items={['IAM Role', 'Access Key']} />
        </FormField>
        <FormField label="Role ARN">
          <FormInput mono value="arn:aws:iam::1234:role/openpanel-export" />
        </FormField>
        <FormField
          hint="For R2, MinIO and other S3-compatible storage."
          label="Endpoint URL (optional)"
        >
          <FormInput
            mono
            placeholder="https://<account>.r2.cloudflarestorage.com"
          />
        </FormField>
        <FormField label="Encryption">
          <SegmentedControl items={['SSE-S3', 'SSE-KMS', 'none']} />
        </FormField>
        <div className="row justify-end gap-2">
          <MockButton>Test connection</MockButton>
          <MockButton primary>Save</MockButton>
        </div>
      </Panel>
      <Panel padded={false} title="acme-analytics / openpanel-exports">
        <div className="col px-3 pb-2">
          {EXPORT_FILES.map((file) => (
            <div
              className="row items-center justify-between border-neutral-100 border-b py-2 font-mono text-[11.5px] last:border-b-0"
              key={file.path}
            >
              <span className="row items-center gap-2 truncate">
                <DatabaseIcon className="size-3 text-neutral-400" />
                {file.path}
              </span>
              <span className="text-neutral-500">{file.size}</span>
            </div>
          ))}
          <span className="pt-2 text-[11px] text-neutral-500">
            Flushed every 60 seconds
          </span>
        </div>
      </Panel>
    </div>
  );
}

const IMPORT_PROVIDERS = [
  {
    name: 'Umami',
    description: 'From an exported file, with a project mapper.',
  },
  {
    name: 'Mixpanel',
    description: 'Through the export API. US, EU or IN residency.',
  },
  {
    name: 'Amplitude',
    description: 'Through the Export API. US or EU residency.',
  },
];

const IMPORT_HISTORY = [
  {
    provider: 'Mixpanel',
    created: 'Oct 28, 09:12',
    status: 'Completed',
    tone: 'emerald' as const,
    progress: '2.4M events',
  },
  {
    provider: 'Amplitude',
    created: 'Oct 30, 16:40',
    status: 'Running',
    tone: 'blue' as const,
    progress: '61%',
  },
];

export function ImportsContent() {
  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        {IMPORT_PROVIDERS.map((provider) => (
          <div
            className="col gap-3 rounded-lg border border-neutral-200 bg-white p-4"
            key={provider.name}
          >
            <div className="col gap-0.5">
              <span className="font-medium text-[13px]">{provider.name}</span>
              <span className="text-[11.5px] text-neutral-500 leading-snug">
                {provider.description}
              </span>
            </div>
            <Pill className="w-fit px-2 py-1">Import Data</Pill>
          </div>
        ))}
      </div>
      <Panel padded={false} title="Import History">
        <div className="grid grid-cols-[1fr_1fr_1fr_1fr] gap-x-3 px-3 py-2 font-medium text-[10px] text-neutral-500 uppercase tracking-wider">
          <span>Provider</span>
          <span>Created</span>
          <span>Status</span>
          <span className="text-right">Progress</span>
        </div>
        {IMPORT_HISTORY.map((row) => (
          <div
            className="grid grid-cols-[1fr_1fr_1fr_1fr] items-center gap-x-3 border-neutral-100 border-t px-3 py-2 text-[12px]"
            key={row.provider}
          >
            <span className="font-medium">{row.provider}</span>
            <span className="text-neutral-600">{row.created}</span>
            <span>
              <MockBadge tone={row.tone}>{row.status}</MockBadge>
            </span>
            <span className="text-right font-mono text-neutral-600">
              {row.progress}
            </span>
          </div>
        ))}
      </Panel>
    </>
  );
}

// A toast in the dashboard, the "Website" integration.
export function WebsiteToast() {
  return (
    <div className="row items-start gap-2.5 rounded-lg border border-neutral-200 bg-white p-3 text-[12px] shadow-sm">
      <span className="center-center size-7 shrink-0 rounded-md bg-neutral-900 text-white">
        <BellIcon className="size-3.5" />
      </span>
      <span className="col gap-0.5">
        <span className="font-medium">New purchase: Pro plan · $29</span>
        <span className="text-neutral-500">
          Ada Svensson · Stockholm · just now
        </span>
      </span>
    </div>
  );
}

export const MANAGE_MOCKS = {
  'notification-rules': {
    content: () => <NotificationRulesContent />,
    shell: { page: 'notifications', project: 'Acme SaaS' },
    insetWidth: 820,
  },
  'rule-editor': {
    content: () => <RuleEditorContent />,
    shell: { page: 'notifications', project: 'Acme SaaS' },
    insetWidth: 660,
  },
  'rule-funnel': {
    content: () => <RuleFunnelContent />,
    shell: { page: 'notifications', project: 'Acme SaaS' },
    insetWidth: 820,
  },
  'notification-feed': {
    content: () => <NotificationFeedContent />,
    shell: { page: 'notifications', project: 'Acme SaaS' },
    insetWidth: 880,
  },
  integrations: {
    content: () => <IntegrationsContent />,
    shell: { page: 'integrations', project: 'Acme SaaS' },
    insetWidth: 860,
  },
  'webhook-form': {
    content: () => <WebhookFormContent />,
    shell: { page: 'integrations', project: 'Acme SaaS' },
    insetWidth: 680,
  },
  's3-export': {
    content: () => <S3ExportContent />,
    shell: { page: 'integrations', project: 'Acme SaaS' },
    insetWidth: 880,
  },
  imports: {
    content: () => <ImportsContent />,
    shell: { page: 'settings', project: 'Acme SaaS' },
    insetWidth: 820,
  },
  ...MANAGE_SHARING_MOCKS,
  ...MANAGE_MCP_MOCKS,
} satisfies Record<string, MockDefinition>;
