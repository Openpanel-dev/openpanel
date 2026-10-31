import { GlobeIcon } from 'lucide-react';
import type { MockDefinition } from './types';

// Profiles list, profile page, identify flow and groups.

const PROFILE_EVENTS = [
  { name: 'purchase', detail: 'Pro plan · $29', when: 'Today 14:02' },
  { name: 'screen_view', detail: '/settings/billing', when: 'Today 14:01' },
  { name: 'screen_view', detail: '/pricing', when: 'Today 13:58' },
  { name: 'sign_up', detail: 'email', when: 'Oct 24' },
  { name: 'screen_view', detail: '/', when: 'Oct 24' },
];

export function ProfileContent() {
  return (
    <div className="grid @2xl:grid-cols-[1fr_1.4fr] grid-cols-1 gap-3">
      <div className="col gap-4 rounded-lg border border-neutral-200 bg-white p-4">
        <div className="row items-center gap-3">
          <span className="center-center size-10 rounded-full bg-neutral-100 font-medium text-[12px]">
            AS
          </span>
          <span className="col">
            <span className="font-medium text-[13px]">Ada Svensson</span>
            <span className="text-[11px] text-neutral-500">
              ada@example.com · Pro
            </span>
          </span>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
          <dt className="text-neutral-500">First seen</dt>
          <dd className="font-mono">Oct 24</dd>
          <dt className="text-neutral-500">Sessions</dt>
          <dd className="font-mono">12</dd>
          <dt className="text-neutral-500">Country</dt>
          <dd className="row items-center gap-1">
            <GlobeIcon className="size-3 text-neutral-400" /> Sweden
          </dd>
          <dt className="text-neutral-500">Revenue</dt>
          <dd className="font-mono">$29.00</dd>
        </dl>
      </div>
      <div className="col overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <span className="border-neutral-200 border-b px-3 py-2.5 font-medium text-[12px]">
          Activity
        </span>
        {PROFILE_EVENTS.map((event, index) => (
          <div
            className="row items-center gap-3 border-neutral-100 border-b px-3 py-2 text-[12px] last:border-b-0"
            // biome-ignore lint/suspicious/noArrayIndexKey: static rows with repeated names
            key={index}
          >
            <span className="size-1.5 rounded-full bg-blue-600" />
            <span className="font-mono">{event.name}</span>
            <span className="truncate text-neutral-500">{event.detail}</span>
            <span className="ml-auto whitespace-nowrap text-neutral-500">
              {event.when}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export const PROFILE_MOCKS = {
  profile: {
    content: () => <ProfileContent />,
    shell: { page: 'profiles', project: 'Acme SaaS' },
    insetWidth: 820,
  },
} satisfies Record<string, MockDefinition>;
