import {
  CloudIcon,
  DatabaseIcon,
  HashIcon,
  MailIcon,
  MessageCircleIcon,
  MonitorIcon,
  WebhookIcon,
} from 'lucide-react';
import { FeatureClosing, type FeaturePageProps } from './shared';
import { CardGrid } from '@/components/blocks/card-grid';
import { CodeSnippet } from '@/components/blocks/code-snippet';
import { FeatureHero } from '@/components/blocks/feature-hero';
import { Pillar } from '@/components/blocks/pillar';
import { StepsBand } from '@/components/blocks/steps-band';
import { EventBadge } from '@/components/dashboard-mock/manage';
import { MockBadge, Pill } from '@/components/dashboard-mock/primitives';
import {
  FormField,
  FormInput,
} from '@/components/dashboard-mock/primitives-ui';
import { VisualMock } from '@/components/visual-mock';

function SlackInstallCard() {
  return (
    <div className="col gap-2 rounded-lg border border-neutral-200 bg-white p-3 text-[12px]">
      <span className="row items-center gap-2 font-medium">
        <HashIcon className="size-3.5 text-neutral-500" />
        Slack
        <MockBadge className="ml-auto" tone="emerald">
          Installed
        </MockBadge>
      </span>
      <span className="text-neutral-500">Posting to</span>
      <span className="row items-center gap-1 rounded-md bg-neutral-100 px-2 py-1 font-mono text-[11px]">
        #sales
      </span>
    </div>
  );
}

function DiscordCard() {
  return (
    <div className="col gap-2 rounded-lg border border-neutral-200 bg-white p-3 text-[12px]">
      <span className="row items-center gap-2 font-medium">
        <MessageCircleIcon className="size-3.5 text-neutral-500" />
        Discord
      </span>
      <span className="text-neutral-500">Discord Webhook URL</span>
      <FormInput mono value="https://discord.com/api/webhooks/…" />
    </div>
  );
}

function BuiltInCard() {
  return (
    <div className="col gap-2 text-[12px]">
      <span className="row items-center gap-2 rounded-lg border border-neutral-200 bg-white p-3">
        <MonitorIcon className="size-3.5 text-neutral-500" />
        <span className="font-medium">Website</span>
        <span className="ml-auto text-neutral-500">toast in the dashboard</span>
      </span>
      <span className="row items-center gap-2 rounded-lg border border-neutral-200 bg-white p-3">
        <MailIcon className="size-3.5 text-neutral-500" />
        <span className="font-medium">Email</span>
        <span className="ml-auto text-neutral-500">
          every member with access
        </span>
      </span>
    </div>
  );
}

function RuleUsesCard() {
  return (
    <div className="col gap-2 rounded-lg border border-neutral-200 bg-white p-3 text-[12px]">
      <p className="row flex-wrap items-center gap-1.5 text-neutral-600">
        Get notified when <EventBadge filtered name="purchase" /> occurs
      </p>
      <span className="row flex-wrap gap-1.5">
        <MockBadge tone="blue">Slack · #sales</MockBadge>
        <MockBadge tone="blue">Zapier webhook</MockBadge>
      </span>
    </div>
  );
}

function McpCard() {
  return (
    <div className="col gap-2 rounded-lg border border-neutral-200 bg-white p-3 text-[12px]">
      <span className="font-medium">MCP Server</span>
      <span className="rounded-md bg-neutral-100 px-2 py-1 font-mono text-[11px] text-neutral-700">
        https://api.openpanel.dev/mcp
      </span>
      <span className="row flex-wrap gap-1">
        {['Claude', 'Cursor', 'Windsurf'].map((client) => (
          <Pill className="px-1.5 py-0.5 text-[10.5px]" key={client}>
            {client}
          </Pill>
        ))}
      </span>
    </div>
  );
}

const TRANSFORM_SNIPPET = [
  { text: '// JavaScript transform', tone: 'muted' as const },
  { text: '(payload) => ({' },
  { text: '  event: payload.name,' },
  { text: '  user: payload.profile,' },
  { text: '  at: payload.createdAt,' },
  { text: '})' },
];

export function IntegrationsPage({ data }: FeaturePageProps) {
  return (
    <>
      <FeatureHero
        description="Slack, Discord and webhooks for the moments that matter. S3 or GCS for every event. Mixpanel and Amplitude importers for the history you already have."
        title={data.hero.heading}
        visual={<VisualMock name="integrations" />}
      />
      <Pillar
        description="A webhook integration takes a URL and your headers. Choose a plain message, or write a JavaScript transform and send exactly the JSON your endpoint expects. Zapier, Make, n8n and your own backend all work the same way."
        label="Webhooks"
        points={[
          {
            title: 'Custom headers',
            text: 'Authorization and anything else, stored write-only.',
          },
          {
            title: 'A sandboxed transform',
            text: 'Math, Date, JSON and the basics. No network, no file system.',
          },
          {
            title: 'Fired by notification rules',
            text: 'Any event with filters, or a completed funnel.',
          },
        ]}
        title="Any webhook, shaped your way"
        visual={<VisualMock bleed="right" frame="inset" name="webhook-form" />}
      />
      <Pillar
        description="Point an export at a bucket and every event lands there as gzipped JSON lines, flushed every minute. Load it into the warehouse you already have."
        label="Export"
        points={[
          {
            title: 'S3-compatible or GCS',
            text: 'AWS S3, Cloudflare R2, MinIO through the endpoint URL, or Google Cloud Storage.',
          },
          {
            title: 'IAM role or access key',
            text: 'External ID for the role, SSE-S3 or SSE-KMS encryption, a test button.',
          },
          {
            title: 'Snowflake, BigQuery, Athena, DuckDB',
            text: 'Files in a bucket, so any of them can read it.',
          },
        ]}
        reverse
        title="Every event in your bucket"
        visual={<VisualMock bleed="left" frame="inset" name="s3-export" />}
      />
      <Pillar
        description="Moving from Mixpanel or Amplitude? Give OpenPanel the API credentials and a date range and it pulls the events in. Umami imports from a file."
        label="Import"
        points={[
          {
            title: 'Mixpanel and Amplitude by API',
            text: 'Service account or API key, US or EU residency, a date range.',
          },
          {
            title: 'Progress and retries',
            text: 'The import history shows status, progress and the config used.',
          },
          {
            title: 'Your funnels work on day one',
            text: 'Imported events are ordinary events.',
          },
        ]}
        title="Bring your history"
        visual={<VisualMock frame="inset" name="imports" side="bottom" />}
      />
      <CardGrid
        description="Notification channels, data sources and the two that come built in."
        items={[
          {
            title: 'Slack',
            description:
              'Install with OAuth and pick the channel. Rules post there.',
            visual: <SlackInstallCard />,
          },
          {
            title: 'Discord',
            description:
              'Paste the channel webhook URL. That is the whole setup.',
            visual: <DiscordCard />,
          },
          {
            title: 'Google Search Console',
            description:
              'Connect a property and six months of queries, clicks and positions sit next to your pages.',
            visual: (
              <div className="pointer-events-none origin-top-left scale-[0.82]">
                <VisualMock frame="bare" name="seo" />
              </div>
            ),
            href: '/features/web-analytics',
          },
          {
            title: 'Website and Email, built in',
            description:
              'A toast in the dashboard and mail to every member with access. No setup.',
            visual: <BuiltInCard />,
          },
          {
            title: 'Notification rules use them',
            description:
              'One rule can send to several integrations. Edit the rule, not the integration.',
            visual: <RuleUsesCard />,
            href: '/features/notifications',
          },
          {
            title: 'MCP for your AI client',
            description:
              'Claude, Cursor or Windsurf read your analytics through the MCP server.',
            visual: <McpCard />,
            href: '/features/mcp',
          },
        ]}
        title="What connects"
      />
      <StepsBand
        steps={[
          {
            title: 'Pick an integration type',
            text: 'Slack, Discord, Webhook, S3 Export or GCS Export, from the Available tab.',
            visual: <StepPick />,
          },
          {
            title: 'Configure the connection',
            text: 'A URL and headers, a bucket and a role, or an OAuth install.',
            visual: <CodeSnippet compact lines={TRANSFORM_SNIPPET} />,
          },
          {
            title: 'Create a notification rule',
            text: 'Exports run on their own. Slack, Discord and webhooks fire from rules.',
            visual: <StepRule />,
          },
          {
            title: 'Events trigger actions',
            text: 'No polling, no glue code. The event arrives and the message goes.',
            visual: <StepDelivery />,
          },
        ]}
        title="Connected in four steps"
      />
      <FeatureClosing data={data} />
    </>
  );
}

const STEP_TYPES = [
  { name: 'Slack', icon: HashIcon, installed: true },
  { name: 'Discord', icon: MessageCircleIcon },
  { name: 'Webhook', icon: WebhookIcon },
  { name: 'S3 Export', icon: DatabaseIcon },
  { name: 'GCS Export', icon: CloudIcon },
];

function StepPick() {
  return (
    <div className="col divide-y divide-neutral-100 text-[12px]">
      {STEP_TYPES.map((type) => (
        <span className="row items-center gap-2 py-1.5" key={type.name}>
          <type.icon className="size-3.5 text-neutral-500" />
          <span className="font-medium">{type.name}</span>
          <span className="ml-auto">
            {type.installed ? (
              <MockBadge tone="emerald">Installed</MockBadge>
            ) : (
              <span className="text-neutral-400">Add</span>
            )}
          </span>
        </span>
      ))}
    </div>
  );
}

function StepRule() {
  return (
    <div className="col gap-2.5 text-[12px]">
      <FormField label="Rule name">
        <FormInput value="New purchases" />
      </FormField>
      <p className="row flex-wrap items-center gap-1.5 text-neutral-600">
        Get notified when <EventBadge filtered name="purchase" /> occurs
      </p>
      <span className="row flex-wrap gap-1.5">
        <MockBadge tone="blue">Slack · #sales</MockBadge>
        <MockBadge tone="blue">Zapier webhook</MockBadge>
      </span>
    </div>
  );
}

const DELIVERY = [
  { label: 'purchase', detail: 'Ada · $29', time: '14:02:01' },
  { label: 'rule', detail: 'New purchases', time: '14:02:01' },
  { label: 'Slack', detail: '#sales', time: '14:02:02' },
  { label: 'webhook', detail: '200 OK', time: '14:02:02' },
];

function StepDelivery() {
  return (
    <ol className="col divide-y divide-neutral-100 text-[12px]">
      {DELIVERY.map((row) => (
        <li className="row items-center gap-2 py-1.5" key={row.label}>
          <span className="size-1.5 rounded-full bg-blue-600" />
          <span className="whitespace-nowrap font-mono">{row.label}</span>
          <span className="truncate text-neutral-500">{row.detail}</span>
          <span className="ml-auto font-mono text-[11px] text-neutral-500">
            {row.time}
          </span>
        </li>
      ))}
    </ol>
  );
}
