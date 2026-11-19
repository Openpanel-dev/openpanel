import { GlobeIcon } from 'lucide-react';
import { FeatureClosing, type FeaturePageProps } from './shared';
import { CardGrid } from '@/components/blocks/card-grid';
import { FeatureHero } from '@/components/blocks/feature-hero';
import { Pillar } from '@/components/blocks/pillar';
import { StepsBand } from '@/components/blocks/steps-band';
import {
  BadgeWidget,
  CounterWidget,
} from '@/components/dashboard-mock/manage-sharing';
import {
  Avatar,
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

function SharedOverviewCard() {
  return (
    <div className="col gap-2 rounded-lg border border-neutral-200 bg-white p-3 text-[12px]">
      <span className="row items-center gap-2">
        <GlobeIcon className="size-3.5 text-emerald-600" />
        <span className="font-mono text-[11px] text-neutral-600">
          /share/overview/acme-web
        </span>
        <span className="row ml-auto items-center gap-1 text-[11px] text-neutral-500">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          14 live
        </span>
      </span>
      <span className="row gap-1.5">
        <FilterChip field="country" value="Sweden" />
        <Pill className="px-2 py-0.5 text-[11px]">Last 30 days</Pill>
      </span>
    </div>
  );
}

function ReadOnlyDashboardCard() {
  return (
    <div className="col gap-2 rounded-lg border border-neutral-200 bg-white p-3 text-[12px]">
      <span className="row items-center justify-between">
        <span className="font-medium">Growth</span>
        <MockBadge>read-only</MockBadge>
      </span>
      <span className="row gap-1.5">
        <Pill className="px-2 py-0.5 text-[11px]">Last 7 days</Pill>
        <Pill className="px-2 py-0.5 text-[11px]">Day</Pill>
      </span>
      <div className="grid grid-cols-3 gap-1.5">
        {[1, 2, 3].map((tile) => (
          <span className="h-8 rounded bg-neutral-100" key={tile} />
        ))}
      </div>
    </div>
  );
}

function InvitationCard() {
  return (
    <div className="col items-center gap-2 rounded-lg border border-neutral-200 bg-white p-4 text-center text-[12px]">
      <span className="font-semibold text-[14px]">Join Acme</span>
      <span className="text-neutral-500">
        You were invited as sofia@agency.pt
      </span>
      <MockButton primary>Accept invitation</MockButton>
    </div>
  );
}

function RolesCard() {
  return (
    <div className="col gap-2 text-[12px]">
      <SegmentedControl items={['Member', 'Viewer', 'Admin']} />
      <span className="text-[11px] text-neutral-500 leading-snug">
        Admins manage members and projects. Members can edit the projects they
        have access to, viewers can only look at them.
      </span>
    </div>
  );
}

function SelfHostedCard() {
  return (
    <div className="col gap-2 rounded-lg border border-neutral-200 bg-white p-3 text-[12px]">
      <span className="row items-center gap-2">
        {['CL', 'AS', 'ML', 'JK', 'SB', 'TP'].map((initials) => (
          <Avatar initials={initials} key={initials} />
        ))}
        <span className="text-neutral-500">+41</span>
      </span>
      <span className="text-neutral-600">47 members · no seats to pay for</span>
    </div>
  );
}

export function ShareAndCollaboratePage({ data }: FeaturePageProps) {
  return (
    <>
      <FeatureHero
        description="Invite as many people as you like, give each one the projects they need, and share any overview, dashboard or report as a link, with a password if you want."
        title={data.hero.heading}
        visual={<VisualMock name="members" />}
      />
      <StepsBand
        description="Four decisions, each one a field."
        steps={[
          {
            title: 'Invite members',
            text: 'By email. They get a link and a "Join Acme" page.',
            visual: <StepInvite />,
          },
          {
            title: 'Set the role',
            text: 'Admin, member or viewer. The owner is whoever created the organization.',
            visual: <StepRole />,
          },
          {
            title: 'Choose the projects',
            text: 'All projects, including future ones, or a list with edit or read-only per project.',
            visual: <StepProjects />,
          },
          {
            title: 'Share a link',
            text: 'The overview, a dashboard or a report. Public, or behind a password.',
            visual: <StepShare />,
          },
        ]}
        title="From an email address to a shared dashboard"
      />
      <Pillar
        description="Roles say what someone can do. Project access says where. An agency contact can edit one site and read another without seeing the rest."
        label="Members"
        points={[
          {
            title: 'Owner, admin, member, viewer',
            text: 'Admins manage people and projects. Viewers only look.',
          },
          {
            title: 'Edit or read-only per project',
            text: 'Or all projects at once, future ones included.',
          },
          {
            title: 'No seat pricing',
            text: 'Invite the whole company. You pay for events, not people.',
          },
        ]}
        title="The right access per project"
        visual={<VisualMock bleed="right" frame="inset" name="invite-sheet" />}
      />
      <Pillar
        description="Some people should see the numbers without an account: a client, an investor, the office wallboard. Make the overview, a dashboard or a single report public, add a password if you want, and send the link."
        label="Public links"
        points={[
          {
            title: 'Overview, dashboard or report',
            text: 'Each has its own share button and its own link.',
          },
          {
            title: 'Optional password',
            text: 'Public, or public with a password. Nothing in between to configure.',
          },
          {
            title: 'Revoke in one click',
            text: 'Make private and the link stops working.',
          },
        ]}
        reverse
        title="A link instead of a login"
        visual={<VisualMock bleed="left" frame="inset" name="share-modal" />}
      />
      <Pillar
        description="Three small iframes for your own site: a live visitor counter, a 30-day badge, and a realtime panel with countries and referrers. Pick a colour and paste the embed code."
        label="Embed"
        points={[
          {
            title: 'Realtime widget',
            text: 'Users in the last 30 minutes, a per-minute chart, top countries and referrers.',
          },
          {
            title: 'Counter and badge',
            text: 'A live number, or a Product Hunt-style badge with your 30-day visitors.',
          },
          {
            title: 'Wallboard mode',
            text: 'Add ?header=0 to a shared overview and put it on the office TV.',
          },
        ]}
        title="Show it off"
        visual={<VisualMock frame="inset" name="widgets" side="bottom" />}
      />
      <CardGrid
        items={[
          {
            title: 'The shared overview is live',
            description:
              'Date range, filters, the live counter, sources, pages, devices and geo, all on the public page.',
            visual: <SharedOverviewCard />,
          },
          {
            title: 'Shared dashboards stay read-only',
            description:
              'Viewers can change the range and interval, not the reports.',
            visual: <ReadOnlyDashboardCard />,
          },
          {
            title: 'An invitation page, not a form',
            description:
              'The invitee sees who invited them and accepts with the account they already have.',
            visual: <InvitationCard />,
          },
          {
            title: 'Roles explained in the form',
            description:
              'The help text is in the product, so nobody has to ask what a viewer can do.',
            visual: <RolesCard />,
          },
          {
            title: 'Self-hosted, the same',
            description:
              'Members, roles and share links work identically on your own servers.',
            visual: <SelfHostedCard />,
          },
          {
            title: 'Widgets you can colour',
            description:
              'Counter and badge take a colour parameter to match your site.',
            visual: (
              <div className="col gap-2">
                <CounterWidget />
                <BadgeWidget />
              </div>
            ),
          },
        ]}
        title="And around it"
      />
      <FeatureClosing data={data} />
    </>
  );
}

function StepInvite() {
  return (
    <div className="col gap-2.5">
      <FormField label="Email">
        <FormInput
          placeholder="Who do you want to invite?"
          value="sofia@agency.pt"
        />
      </FormField>
      <FormField label="What role?">
        <SegmentedControl items={['Member', 'Viewer', 'Admin']} />
      </FormField>
      <MockBadge className="w-fit" tone="emerald">
        Invitation sent
      </MockBadge>
    </div>
  );
}

const ROLE_ROWS = [
  { can: 'Manage members', who: 'Admin' },
  { can: 'Edit projects', who: 'Admin, Member' },
  { can: 'View everything', who: 'Everyone' },
];

function StepRole() {
  return (
    <div className="col gap-2.5 text-[12px]">
      <SegmentedControl items={['Member', 'Viewer', 'Admin']} />
      <div className="col divide-y divide-neutral-100 rounded-md border border-neutral-200">
        {ROLE_ROWS.map((row) => (
          <span
            className="row items-center justify-between gap-2 px-2.5 py-1.5"
            key={row.can}
          >
            <span className="truncate">{row.can}</span>
            <span className="whitespace-nowrap text-neutral-500">
              {row.who}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

const PROJECT_ROWS = [
  { name: 'Acme Web', grant: 'Can edit' },
  { name: 'Acme SaaS', grant: 'Read-only' },
  { name: 'Acme Shop', grant: 'No access' },
];

function StepProjects() {
  return (
    <div className="col gap-2.5 text-[12px]">
      <SegmentedControl active={1} items={['All', 'Selected']} />
      <div className="col divide-y divide-neutral-100 rounded-md border border-neutral-200">
        {PROJECT_ROWS.map((project) => (
          <span
            className="row items-center justify-between px-2.5 py-1.5"
            key={project.name}
          >
            <span className="font-medium">{project.name}</span>
            <span
              className={
                project.grant === 'No access'
                  ? 'text-neutral-400'
                  : 'text-neutral-700'
              }
            >
              {project.grant}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function StepShare() {
  return (
    <div className="col gap-2.5 text-[12px]">
      <span className="font-medium">Dashboard public availability</span>
      <FormInput placeholder="Enter your password (optional)" />
      <span className="row items-center gap-2 rounded-md bg-neutral-100 px-2.5 py-1.5 font-mono text-[11px] text-neutral-600">
        <GlobeIcon className="size-3 shrink-0 text-emerald-600" />
        <span className="truncate">
          dashboard.openpanel.dev/share/dashboard/k2m9x
        </span>
      </span>
      <span className="row justify-end gap-2">
        <MockButton>Cancel</MockButton>
        <MockButton primary>Make it public</MockButton>
      </span>
    </div>
  );
}
