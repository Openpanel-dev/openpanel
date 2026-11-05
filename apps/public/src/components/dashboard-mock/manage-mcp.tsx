import { CopyIcon, KeyRoundIcon, PlusIcon } from 'lucide-react';
import { MockBadge, Panel, Pill } from './primitives';
import { MockButton } from './primitives-ui';
import type { MockDefinition } from './types';
import { cn } from '@/lib/utils';

// Settings › MCP and the tool catalogue.

export const MCP_CLIENTS = [
  'Claude Desktop',
  'Claude Code',
  'Cursor',
  'Windsurf',
  'VS Code (Copilot)',
  'Raycast',
];

const CONFIG_LINES = [
  '{',
  '  "mcpServers": {',
  '    "openpanel": {',
  '      "type": "streamable-http",',
  '      "url": "https://api.openpanel.dev/mcp",',
  '      "headers": { "Authorization": "Bearer <token>" }',
  '    }',
  '  }',
  '}',
];

export function McpSettingsContent() {
  return (
    <div className="grid @2xl:grid-cols-[1.1fr_1fr] grid-cols-1 items-start gap-4">
      <div className="col gap-3">
        <Panel>
          <div className="col gap-1">
            <span className="font-semibold text-[14px]">MCP Server</span>
            <span className="text-[11.5px] text-neutral-500 leading-snug">
              Connect any MCP-compatible AI client (Claude, Cursor, Windsurf, …)
              to this project. Most of its tools read; a root client can also
              create, edit and delete dashboards and reports, so treat the token
              as write access.
            </span>
          </div>
          <div className="col gap-1.5">
            <span className="font-medium text-[11px] text-neutral-700">
              Endpoint
            </span>
            <span className="row items-center justify-between rounded-md bg-neutral-100 px-2.5 py-2 font-mono text-[11.5px]">
              https://api.openpanel.dev/mcp
              <CopyIcon className="size-3 text-neutral-400" />
            </span>
            <span className="text-[11px] text-neutral-500">
              Send{' '}
              <span className="font-mono">
                Authorization: Bearer base64(clientId:clientSecret)
              </span>
              , or
              <span className="font-mono"> ?token=</span> for clients that
              cannot set headers.
            </span>
          </div>
        </Panel>
        <Panel>
          <div className="row items-start gap-3">
            <span className="center-center size-8 shrink-0 rounded-md bg-neutral-100">
              <KeyRoundIcon className="size-4 text-neutral-700" />
            </span>
            <div className="col flex-1 gap-1">
              <span className="font-medium text-[12.5px]">Need a token?</span>
              <span className="text-[11px] text-neutral-500 leading-snug">
                Only read and root clients can authenticate with MCP. The secret
                is shown once when you create the client.
              </span>
            </div>
            <Pill className="px-2 py-1">
              <PlusIcon className="size-3" />
              Add client
            </Pill>
          </div>
        </Panel>
      </div>
      <Panel title="Configure your AI client">
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
        <span className="text-[11px] text-neutral-500">
          Add this block to{' '}
          <span className="font-mono">claude_desktop_config.json</span>{' '}
          (Settings → Developer → Edit Config).
        </span>
        <pre className="overflow-x-auto rounded-md bg-neutral-900 p-3 font-mono text-[11px] text-neutral-200 leading-relaxed">
          {CONFIG_LINES.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </pre>
      </Panel>
    </div>
  );
}

export const MCP_TOOL_GROUPS = [
  {
    title: 'Overview and pages',
    tools: [
      'get_analytics_overview',
      'get_top_pages',
      'get_top_referrers',
      'get_device_breakdown',
      'get_rolling_active_users',
    ],
    count: 11,
  },
  {
    title: 'Funnels, retention, flows',
    tools: [
      'get_funnel',
      'get_retention_cohort',
      'get_weekly_retention_series',
      'get_user_flow',
      'get_page_conversions',
    ],
    count: 5,
  },
  {
    title: 'Events, profiles, groups',
    tools: [
      'query_events',
      'query_sessions',
      'find_profiles',
      'get_profile_metrics',
      'find_groups',
    ],
    count: 12,
  },
  {
    title: 'Search Console',
    tools: [
      'gsc_get_overview',
      'gsc_get_top_queries',
      'gsc_get_query_opportunities',
      'gsc_get_cannibalization',
    ],
    count: 7,
  },
  {
    title: 'Dashboards and reports',
    tools: [
      'list_dashboards',
      'get_report_data',
      'create_dashboard',
      'create_report',
      'update_report_layout',
    ],
    count: 13,
    write: true,
  },
];

export function McpToolsContent({ compact = false }: { compact?: boolean }) {
  const groups = compact ? MCP_TOOL_GROUPS.slice(0, 3) : MCP_TOOL_GROUPS;
  return (
    <>
      <div className="row items-center justify-between">
        <span className="font-semibold text-[14px]">Tools</span>
        <span className="row gap-1.5">
          <MockBadge tone="blue">48 tools</MockBadge>
          <MockBadge>39 for read clients</MockBadge>
          <MockBadge tone="amber">9 root-only</MockBadge>
        </span>
      </div>
      <div className="col gap-2">
        {groups.map((group) => (
          <div
            className="col gap-2 rounded-lg border border-neutral-200 bg-white p-3"
            key={group.title}
          >
            <div className="row items-center justify-between">
              <span className="font-medium text-[12px]">{group.title}</span>
              <span className="text-[11px] text-neutral-500">
                {group.count} tools
              </span>
            </div>
            <div className="row flex-wrap gap-1.5">
              {group.tools.map((tool) => {
                const isWrite =
                  group.write &&
                  /^(create|update|delete|duplicate|reset)_/.test(tool);
                return (
                  <span
                    className={cn(
                      'rounded-md px-1.5 py-0.5 font-mono text-[10.5px]',
                      isWrite
                        ? 'bg-amber-50 text-amber-800'
                        : 'bg-neutral-100 text-neutral-700'
                    )}
                    key={tool}
                  >
                    {tool}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// Read vs root in one glance, for the compare row.
export function ClientCard({ kind }: { kind: 'read' | 'root' }) {
  const root = kind === 'root';
  return (
    <div className="col gap-3 text-[12px]">
      <div className="row items-center justify-between">
        <span className="row items-center gap-2 font-medium">
          <MockBadge tone={root ? 'amber' : 'blue'}>
            {root ? 'root' : 'read'}
          </MockBadge>
          {root ? 'Every project in Acme' : 'Acme SaaS only'}
        </span>
        <MockButton>{root ? '48 tools' : '39 tools'}</MockButton>
      </div>
      <ul className="col gap-1 text-neutral-600">
        <li>Reads reports, funnels, retention, profiles, sessions</li>
        <li>
          {root
            ? 'Creates, edits and deletes dashboards and reports'
            : 'Cannot change anything'}
        </li>
        <li>
          {root
            ? 'Treat the token as write access'
            : 'Safe to hand to an assistant'}
        </li>
      </ul>
    </div>
  );
}

export const MANAGE_MCP_MOCKS = {
  'mcp-settings': {
    content: () => <McpSettingsContent />,
    shell: { page: 'settings', project: 'Acme SaaS' },
    insetWidth: 900,
  },
  'mcp-tools': {
    content: () => <McpToolsContent />,
    shell: { page: 'settings', project: 'Acme SaaS' },
    insetWidth: 760,
  },
} satisfies Record<string, MockDefinition>;
