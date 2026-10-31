import { CopyIcon, KeyRoundIcon, ServerIcon } from 'lucide-react';
import { FeatureClosing, type FeaturePageProps } from './shared';
import { CardGrid } from '@/components/blocks/card-grid';
import { CodeSnippet } from '@/components/blocks/code-snippet';
import { CompareRow } from '@/components/blocks/compare-row';
import { FeatureHero } from '@/components/blocks/feature-hero';
import { Pillar } from '@/components/blocks/pillar';
import { SplitStat } from '@/components/blocks/split-stat';
import { StepsBand } from '@/components/blocks/steps-band';
import {
  ClientCard,
  MCP_CLIENTS,
} from '@/components/dashboard-mock/manage-mcp';
import {
  FilterChip,
  MockBadge,
  Pill,
} from '@/components/dashboard-mock/primitives';
import {
  FormField,
  FormInput,
  MockButton,
  SegmentedControl,
} from '@/components/dashboard-mock/primitives-ui';
import { VisualMock } from '@/components/visual-mock';

const CONFIG_SNIPPET = [
  { text: '// claude_desktop_config.json', tone: 'muted' as const },
  { text: '"openpanel": {' },
  { text: '  "type": "streamable-http",' },
  { text: '  "url": "<api>/mcp",', tone: 'string' as const },
  { text: '  "headers": {' },
  { text: '    "Authorization":' },
  { text: '      "Bearer <token>"' },
  { text: '  }' },
];

function ToolChips({ tools }: { tools: string[] }) {
  return (
    <div className="row flex-wrap gap-1.5">
      {tools.map((tool) => (
        <span
          className="rounded-md bg-neutral-100 px-1.5 py-0.5 font-mono text-[11px] text-neutral-700"
          key={tool}
        >
          {tool}
        </span>
      ))}
    </div>
  );
}

function QueryEventsCard() {
  return (
    <div className="col gap-2 text-[12px]">
      <span className="font-mono text-neutral-700">query_events</span>
      <div className="row flex-wrap gap-1.5">
        <FilterChip field="name" value="purchase" />
        <FilterChip field="properties.plan" value="pro" />
        <FilterChip field="country" operator="is not" value="SE" />
      </div>
    </div>
  );
}

function SelfHostedCard() {
  return (
    <div className="col gap-2 rounded-lg border border-neutral-200 bg-white p-3 text-[12px]">
      <span className="row items-center gap-2 font-medium">
        <ServerIcon className="size-3.5 text-neutral-500" />
        Your own install
      </span>
      <span className="rounded-md bg-neutral-100 px-2 py-1 font-mono text-[11px]">
        https://analytics.acme.io/mcp
      </span>
      <span className="text-neutral-500">Same tools, same token format.</span>
    </div>
  );
}

function TokenCard() {
  return (
    <div className="col gap-2 rounded-lg border border-neutral-200 bg-white p-3 text-[12px]">
      <span className="row items-center gap-2 font-medium">
        <KeyRoundIcon className="size-3.5 text-neutral-500" />
        New client created
      </span>
      <FormInput mono value="sec_9dab4366c3d0ed07ef6a" />
      <span className="text-[11px] text-amber-700">
        Copy it now. The secret is shown once.
      </span>
    </div>
  );
}

export function McpPage({ data }: FeaturePageProps) {
  return (
    <>
      <FeatureHero
        description="Paste one URL into Claude, Cursor or Windsurf and ask in plain English. Funnels, retention, sessions, profiles and Search Console, with the numbers behind every answer."
        pill={{
          label: '48 tools',
          text: 'Everything the dashboard knows, from your AI client',
          href: '/docs/mcp',
        }}
        title={data.hero.heading}
        visual={<VisualMock name="chat" />}
      />
      <SplitStat
        items={[
          {
            value: '48',
            title: 'tools',
            text: '39 read tools for every client, 9 write tools for root tokens.',
          },
          {
            value: '6',
            title: 'documented clients',
            text: 'Claude Desktop, Claude Code, Cursor, Windsurf, VS Code and Raycast. Any MCP client works.',
          },
          {
            value: '0',
            title: 'installs',
            text: 'Streamable HTTP, hosted by OpenPanel or by you. A URL and a token.',
          },
        ]}
      />
      <Pillar
        description="The MCP server is part of the API. Create a read or root client in the project settings, copy the token once, and paste the endpoint into your client's config. The settings page writes the config block for you."
        label="Setup"
        link={{ href: '/docs/mcp', text: 'Setup for each client' }}
        points={[
          {
            title: 'Streamable HTTP',
            text: 'Token as a Bearer header, or ?token= for clients that cannot send headers.',
          },
          {
            title: 'Six documented clients',
            text: 'And any other MCP client, including an agent you wrote yourself.',
          },
          {
            title: 'Self-hosted too',
            text: 'Your install has the same /mcp endpoint.',
          },
        ]}
        title="One URL, no install"
        visual={<VisualMock bleed="right" frame="inset" name="mcp-settings" />}
      />
      <Pillar
        description="The tools map to what the dashboard can show: the overview, pages, referrers, devices and countries, funnels and retention, events and sessions with filters, profiles and groups, Search Console queries. Root tokens also get the tools that create and edit dashboards and reports."
        label="48 tools"
        points={[
          {
            title: '39 read tools',
            text: 'For any read or root client.',
          },
          {
            title: '9 write tools',
            text: 'Create, update, delete and lay out dashboards and reports. Root only.',
          },
          {
            title: 'Your permissions, nothing more',
            text: 'A read client sees one project. A root client sees the organization.',
          },
        ]}
        reverse
        title="Everything the dashboard knows"
        visual={<VisualMock bleed="left" frame="inset" name="mcp-tools" />}
      />
      <Pillar
        description="No MCP client at hand? The dashboard has a chat with the same reach. It answers from your data, drafts charts and dashboards, and asks before it saves anything."
        label="Built-in chat"
        points={[
          {
            title: 'Builds charts and dashboards',
            text: 'Describe the report and approve it when it looks right.',
          },
          {
            title: 'Writes ask first',
            text: 'Creating a dashboard, saving a chart or inviting someone needs your approval.',
          },
          {
            title: 'Daily limits by plan',
            text: 'Unlimited on self-hosted. GPT and Claude models, whichever key you configure.',
          },
        ]}
        title="Or use the one inside"
        visual={<VisualMock frame="inset" name="chat-inapp" side="bottom" />}
      />
      <CompareRow
        description="Two kinds of client can talk to the server. Pick by how much you trust the thing holding the token."
        items={[
          {
            label: 'Read client',
            caption: 'One project, 39 tools, cannot change anything.',
            visual: <ClientCard kind="read" />,
          },
          {
            label: 'Root client',
            caption:
              'Every project, 48 tools, treat the token as write access.',
            visual: <ClientCard kind="root" />,
          },
        ]}
        title="Read or root"
      />
      <CardGrid
        items={[
          {
            title: 'Search Console tools',
            description:
              'Seven gsc_* tools once the property is connected: queries, pages, opportunities, cannibalization.',
            visual: (
              <ToolChips
                tools={[
                  'gsc_get_overview',
                  'gsc_get_top_queries',
                  'gsc_get_query_opportunities',
                  'gsc_get_cannibalization',
                ]}
              />
            ),
          },
          {
            title: 'Profiles and groups',
            description:
              'Find a person or a company, then their sessions, metrics and events.',
            visual: (
              <ToolChips
                tools={[
                  'find_profiles',
                  'get_profile_sessions',
                  'find_groups',
                  'get_group',
                ]}
              />
            ),
          },
          {
            title: 'Events with filters',
            description:
              'query_events and query_sessions take the same filters the dashboard does.',
            visual: <QueryEventsCard />,
          },
          {
            title: 'Works self-hosted',
            description:
              'The endpoint lives on your API. Nothing leaves your servers except what the AI client asks for.',
            visual: <SelfHostedCard />,
          },
          {
            title: 'The token is shown once',
            description:
              'Read and root clients only. Rotate it by creating a new client.',
            visual: <TokenCard />,
          },
          {
            title: 'Pick the client in settings',
            description:
              'The MCP tab writes the config block for the client you choose.',
            visual: (
              <div className="row flex-wrap gap-1.5">
                {MCP_CLIENTS.map((client, index) => (
                  <Pill
                    active={index === 0}
                    className="px-2 py-1 text-[11px]"
                    key={client}
                  >
                    {client}
                  </Pill>
                ))}
              </div>
            ),
          },
        ]}
        title="What the AI can reach"
      />
      <StepsBand
        steps={[
          {
            title: 'Create an API client',
            text: 'Settings › Clients. Read for one project, root for the organization.',
            visual: <StepClient />,
          },
          {
            title: 'Copy the token',
            text: 'base64(clientId:clientSecret). It is shown once.',
            visual: <StepToken />,
          },
          {
            title: 'Paste the URL into your client',
            text: 'The config block for your client is on the MCP tab.',
            visual: <CodeSnippet compact lines={CONFIG_SNIPPET} />,
          },
          {
            title: 'Ask',
            text: 'Which campaign brought paying users last month? The answer names its tools.',
            visual: <StepAsk />,
          },
        ]}
        title="Connected in four steps"
      />
      <FeatureClosing data={data} />
    </>
  );
}

function StepClient() {
  return (
    <div className="col gap-2.5">
      <FormField label="Name">
        <FormInput value="Claude Desktop" />
      </FormField>
      <FormField label="Type">
        <SegmentedControl items={['read', 'root']} />
      </FormField>
      <MockButton className="w-fit" primary>
        Create client
      </MockButton>
    </div>
  );
}

function StepToken() {
  return (
    <div className="col gap-2 text-[12px]">
      <span className="font-medium text-neutral-700">Client secret</span>
      <FormInput mono value="sec_9dab4366c3d0ed07ef6a" />
      <span className="row items-center justify-between">
        <span className="text-[11px] text-amber-700">
          Shown once. Copy it now.
        </span>
        <MockButton>
          <CopyIcon className="size-3" />
          Copy
        </MockButton>
      </span>
      <span className="truncate rounded-md bg-neutral-100 px-2 py-1 font-mono text-[10.5px] text-neutral-600">
        Authorization: Bearer YWY4Mjcz…NWE5Mw==
      </span>
    </div>
  );
}

function StepAsk() {
  return (
    <div className="col gap-2 text-[12px]">
      <span className="max-w-[92%] self-end rounded-xl rounded-br-sm bg-neutral-100 px-3 py-1.5">
        Which campaign brought paying users last month?
      </span>
      <span className="row flex-wrap gap-1.5">
        <MockBadge tone="blue">get_top_referrers</MockBadge>
        <MockBadge tone="blue">get_funnel</MockBadge>
      </span>
      <span className="text-neutral-600">
        Product Hunt: 312 sign-ups, 38 paid. Google: 198 sign-ups, 12 paid.
      </span>
    </div>
  );
}
