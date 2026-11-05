import {
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  GlobeIcon,
  LockIcon,
  PlusIcon,
} from 'lucide-react';
import {
  Avatar,
  BarSpark,
  MockBadge,
  MockTabs,
  Panel,
  Pill,
} from './primitives';
import {
  FormField,
  FormInput,
  MockButton,
  MockModal,
  MockSheet,
  SegmentedControl,
} from './primitives-ui';
import type { MockDefinition } from './types';
import { cn } from '@/lib/utils';

// Members, invitations, public links and embeddable widgets.

const MEMBERS = [
  {
    initials: 'CL',
    name: 'Carl Lindesvärd',
    email: 'carl@acme.io',
    role: 'Owner',
    created: 'Jan 12',
    access: ['All projects'],
  },
  {
    initials: 'AS',
    name: 'Ada Svensson',
    email: 'ada@acme.io',
    role: 'Admin',
    created: 'Feb 3',
    access: ['All projects'],
  },
  {
    initials: 'ML',
    name: 'Marc Lemoine',
    email: 'marc@acme.io',
    role: 'Member',
    created: 'Mar 18',
    access: ['Acme Web', 'Acme SaaS (read-only)'],
  },
  {
    initials: 'JK',
    name: 'Jun Kim',
    email: 'jun@acme.io',
    role: 'Viewer',
    created: 'Jun 2',
    access: ['Acme Shop (read-only)'],
  },
  {
    initials: 'SB',
    name: 'Sofia Barros',
    email: 'sofia@agency.pt',
    role: 'Member',
    created: 'Oct 21',
    access: ['Acme Web'],
  },
];

function RoleBadge({ role }: { role: string }) {
  const tone =
    role === 'Owner' ? 'blue' : role === 'Admin' ? 'emerald' : 'neutral';
  return <MockBadge tone={tone}>{role}</MockBadge>;
}

export function MembersContent() {
  return (
    <>
      <div className="col gap-0.5">
        <span className="font-semibold text-[15px]">Members</span>
        <span className="text-[12px] text-neutral-500">
          Who can see and edit the projects in Acme
        </span>
      </div>
      <div className="row items-end justify-between">
        <MockTabs items={['Members', 'Invitations']} />
        <Pill active>
          <PlusIcon className="size-3" />
          Invite user
        </Pill>
      </div>
      <Panel padded={false}>
        <div className="grid grid-cols-[1.4fr_1.3fr_0.7fr_0.6fr_1.6fr] gap-x-3 border-neutral-200 border-b px-3 py-2 font-medium text-[10px] text-neutral-500 uppercase tracking-wider">
          <span>Name</span>
          <span>Email</span>
          <span>Role</span>
          <span>Created</span>
          <span>Access</span>
        </div>
        {MEMBERS.map((member) => (
          <div
            className="grid grid-cols-[1.4fr_1.3fr_0.7fr_0.6fr_1.6fr] items-center gap-x-3 border-neutral-100 border-b px-3 py-2 text-[12px] last:border-b-0"
            key={member.email}
          >
            <span className="row items-center gap-2 truncate font-medium">
              <Avatar initials={member.initials} />
              {member.name}
            </span>
            <span className="truncate text-neutral-600">{member.email}</span>
            <span>
              <RoleBadge role={member.role} />
            </span>
            <span className="text-neutral-500">{member.created}</span>
            <span className="row flex-wrap gap-1">
              {member.access.map((item) => (
                <MockBadge key={item}>{item}</MockBadge>
              ))}
            </span>
          </div>
        ))}
      </Panel>
    </>
  );
}

const PROJECT_GRANTS = [
  { name: 'Acme Web', grant: 'Can edit' },
  { name: 'Acme SaaS', grant: 'Read-only' },
  { name: 'Acme Shop', grant: 'No access' },
];

export function InviteSheetContent() {
  return (
    <div className="row items-start gap-4">
      <div className="col w-[260px] shrink-0 gap-3 opacity-60">
        <div className="col gap-0.5">
          <span className="font-semibold text-[15px]">Members</span>
          <span className="text-[12px] text-neutral-500">
            Who can see and edit the projects in Acme
          </span>
        </div>
        <MockTabs items={['Members', 'Invitations']} />
        <Panel padded={false}>
          {MEMBERS.slice(0, 3).map((member) => (
            <div
              className="row items-center gap-2 border-neutral-100 border-b px-3 py-2 text-[12px] last:border-b-0"
              key={member.email}
            >
              <Avatar initials={member.initials} />
              <span className="font-medium">{member.name}</span>
              <span className="ml-auto">
                <RoleBadge role={member.role} />
              </span>
            </div>
          ))}
        </Panel>
      </div>
      <MockSheet
        footer={<MockButton primary>Invite user</MockButton>}
        title="Invite a user"
        width={340}
      >
        <FormField label="Email">
          <FormInput
            placeholder="Who do you want to invite?"
            value="sofia@agency.pt"
          />
        </FormField>
        <FormField
          hint="Admins manage members and projects. Members can edit the projects they have access to, viewers can only look at them."
          label="What role?"
        >
          <SegmentedControl items={['Member', 'Viewer', 'Admin']} />
        </FormField>
        <FormField label="Project access">
          <div className="col gap-2">
            <SegmentedControl
              active={1}
              items={['All projects', 'Selected projects']}
            />
            <div className="col divide-y divide-neutral-100 rounded-md border border-neutral-200">
              {PROJECT_GRANTS.map((project) => (
                <div
                  className="row items-center justify-between px-2.5 py-1.5 text-[12px]"
                  key={project.name}
                >
                  <span className="font-medium">{project.name}</span>
                  <span
                    className={cn(
                      'text-[11px]',
                      project.grant === 'No access'
                        ? 'text-neutral-400'
                        : 'text-neutral-700'
                    )}
                  >
                    {project.grant}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </FormField>
      </MockSheet>
    </div>
  );
}

export function ShareModalContent() {
  return (
    <div className="grid @2xl:grid-cols-2 grid-cols-1 items-start gap-4">
      <MockModal
        actions={
          <>
            <MockButton>Cancel</MockButton>
            <MockButton primary>Make it public</MockButton>
          </>
        }
        description="You can choose if you want to add a password to make it a bit more private."
        title="Dashboard public availability"
        width={360}
      >
        <FormField label="Password">
          <FormInput placeholder="Enter your password (optional)" />
        </FormField>
      </MockModal>
      <MockModal
        actions={
          <>
            <MockButton>
              <LockIcon className="size-3" />
              Make private
            </MockButton>
            <MockButton primary>Update</MockButton>
          </>
        }
        description="Anyone with the link can open this dashboard. It asks for the password first."
        title="Currently shared"
        width={360}
      >
        <div className="col gap-2">
          <span className="row items-center gap-2 rounded-md bg-neutral-100 px-2.5 py-2 font-mono text-[11px] text-neutral-700">
            <GlobeIcon className="size-3 shrink-0 text-emerald-600" />
            <span className="truncate">
              dashboard.openpanel.dev/share/dashboard/k2m9x
            </span>
          </span>
          <div className="row gap-2 text-[11.5px]">
            <Pill className="px-2 py-1">
              <CopyIcon className="size-3" />
              Copy
            </Pill>
            <Pill className="px-2 py-1">
              <ExternalLinkIcon className="size-3" />
              Open in new tab
            </Pill>
          </div>
          <span className="row items-center gap-1.5 text-[11px] text-emerald-700">
            <CheckIcon className="size-3" />
            Password protected
          </span>
        </div>
      </MockModal>
    </div>
  );
}

const WIDGET_COUNTRIES = [
  { label: 'Sweden', value: 48 },
  { label: 'Germany', value: 31 },
  { label: 'United States', value: 27 },
];
const WIDGET_REFERRERS = [
  { label: 'Google', value: 52 },
  { label: 'Direct', value: 38 },
  { label: 'Product Hunt', value: 19 },
];

function WidgetList({
  title,
  items,
}: {
  title: string;
  items: { label: string; value: number }[];
}) {
  return (
    <div className="col gap-1">
      <span className="font-medium text-[9px] text-neutral-500 uppercase tracking-wider">
        {title}
      </span>
      {items.map((item) => (
        <div
          className="row items-center justify-between text-[11px]"
          key={item.label}
        >
          <span>{item.label}</span>
          <span className="font-mono text-neutral-600">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

export function RealtimeWidget({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'col gap-3 rounded-lg border border-neutral-200 bg-white p-4',
        className
      )}
    >
      <div className="col gap-1">
        <span className="font-medium text-[9px] text-neutral-500 uppercase tracking-wider">
          Users in last 30 minutes
        </span>
        <span className="row items-center gap-2">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
          </span>
          <span className="font-mono font-semibold text-2xl">142</span>
        </span>
      </div>
      <BarSpark values={[3, 5, 4, 6, 8, 7, 9, 8, 10, 12, 11, 14, 12, 15]} />
      <div className="grid grid-cols-2 gap-3">
        <WidgetList items={WIDGET_COUNTRIES} title="Country" />
        <WidgetList items={WIDGET_REFERRERS} title="Referrer" />
      </div>
    </div>
  );
}

export function CounterWidget({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'row w-fit items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-[12px]',
        className
      )}
    >
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
        <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
      </span>
      <span className="font-mono font-semibold">1,204</span>
      <span className="text-neutral-600">unique visitors</span>
    </span>
  );
}

export function BadgeWidget({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'row w-fit items-stretch overflow-hidden rounded-md border border-neutral-200 bg-white text-[11px]',
        className
      )}
    >
      <span className="col justify-center bg-blue-600 px-2.5 py-1.5 text-white">
        <span className="font-medium text-[8px] uppercase tracking-wider opacity-80">
          Analytics from
        </span>
        <span className="font-semibold">OpenPanel</span>
      </span>
      <span className="col justify-center px-2.5 py-1.5">
        <span className="font-mono font-semibold text-[13px]">24.1K</span>
        <span className="text-[9px] text-neutral-500">visitors · 30 days</span>
      </span>
    </span>
  );
}

export function WidgetsContent() {
  return (
    <div className="grid @2xl:grid-cols-[1fr_1.2fr] grid-cols-1 items-start gap-4">
      <div className="col gap-3">
        <Panel title="Realtime Widget">
          <div className="row flex-wrap gap-1.5 text-[11px]">
            <MockBadge tone="blue">Show Referrers</MockBadge>
            <MockBadge tone="blue">Show Countries</MockBadge>
            <MockBadge>Show Paths</MockBadge>
          </div>
          <FormField label="Embed Code">
            <FormInput
              mono
              value='<iframe src="https://dashboard.openpanel.dev/widget/realtime?…'
            />
          </FormField>
        </Panel>
        <Panel title="Counter Widget">
          <span className="text-[11.5px] text-neutral-500">
            A compact live visitor counter.
          </span>
          <CounterWidget />
        </Panel>
        <Panel title="Analytics Badge">
          <span className="text-[11.5px] text-neutral-500">
            A Product Hunt-style badge showing your 30-day unique visitor count.
          </span>
          <BadgeWidget />
        </Panel>
      </div>
      <div className="col gap-2">
        <span className="font-medium text-[10px] text-neutral-500 uppercase tracking-wider">
          Preview
        </span>
        <RealtimeWidget />
      </div>
    </div>
  );
}

export const MANAGE_SHARING_MOCKS = {
  members: {
    content: () => <MembersContent />,
    shell: { page: 'members', project: 'Acme' },
    insetWidth: 860,
  },
  'invite-sheet': {
    content: () => <InviteSheetContent />,
    shell: { page: 'members', project: 'Acme' },
    insetWidth: 660,
  },
  'share-modal': {
    content: () => <ShareModalContent />,
    shell: { page: 'dashboards', project: 'Acme Web' },
    insetWidth: 800,
  },
  widgets: {
    content: () => <WidgetsContent />,
    shell: { page: 'settings', project: 'Acme Web' },
    insetWidth: 820,
  },
} satisfies Record<string, MockDefinition>;
