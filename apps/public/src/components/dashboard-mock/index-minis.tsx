import { HashIcon, MessageSquareIcon, WebhookIcon } from 'lucide-react';
import { MockBadge } from './primitives';
import type { MockDefinition } from './types';

// Small pieces used only by the features index cards.

const EVENTS = [
  { name: 'screen_view', detail: '/pricing', when: '2s ago' },
  { name: 'sign_up', detail: 'plan: pro', when: '14s ago' },
  { name: 'purchase', detail: 'revenue ($29.00)', when: '41s ago' },
  { name: 'link_out', detail: 'github.com', when: '1m ago' },
];

export function MiniEvents() {
  return (
    <div className="col overflow-hidden rounded-lg border border-neutral-200 bg-white text-[11.5px]">
      <div className="row items-center gap-2 border-neutral-200 border-b px-3 py-1.5">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
        </span>
        <span className="text-[10.5px] text-neutral-500">Listening</span>
      </div>
      {EVENTS.map((event) => (
        <div
          className="row items-center gap-2 border-neutral-100 border-b px-3 py-1.5 last:border-b-0"
          key={event.name}
        >
          <span className="size-1.5 rounded-full bg-blue-600" />
          <span className="font-mono">{event.name}</span>
          <span className="truncate text-neutral-500">{event.detail}</span>
          <span className="ml-auto whitespace-nowrap font-mono text-[10px] text-neutral-400">
            {event.when}
          </span>
        </div>
      ))}
    </div>
  );
}

const INTEGRATIONS = [
  { name: 'Slack', detail: '#growth', icon: HashIcon, installed: true },
  {
    name: 'Discord',
    detail: 'Webhook URL',
    icon: MessageSquareIcon,
    installed: true,
  },
  {
    name: 'Webhook',
    detail: 'JavaScript transform',
    icon: WebhookIcon,
    installed: false,
  },
];

export function MiniIntegrations() {
  return (
    <div className="col gap-2">
      {INTEGRATIONS.map((integration) => (
        <div
          className="row items-center gap-2.5 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-[11.5px]"
          key={integration.name}
        >
          <span className="center-center size-6 rounded-md bg-neutral-900 text-white">
            <integration.icon className="size-3" />
          </span>
          <span className="col">
            <span className="font-medium">{integration.name}</span>
            <span className="text-[10.5px] text-neutral-500">
              {integration.detail}
            </span>
          </span>
          <span className="ml-auto">
            {integration.installed ? (
              <MockBadge tone="emerald">Installed</MockBadge>
            ) : (
              <MockBadge>Add</MockBadge>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

export const INDEX_MOCKS = {
  'mini-events': { content: () => <MiniEvents /> },
  'mini-integrations': { content: () => <MiniIntegrations /> },
} satisfies Record<string, MockDefinition>;
