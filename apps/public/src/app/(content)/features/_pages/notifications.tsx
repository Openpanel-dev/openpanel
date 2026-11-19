import { MailIcon } from 'lucide-react';
import { FeatureClosing, type FeaturePageProps } from './shared';
import { CardGrid } from '@/components/blocks/card-grid';
import { FeatureHero } from '@/components/blocks/feature-hero';
import { Pillar } from '@/components/blocks/pillar';
import { SplitStat } from '@/components/blocks/split-stat';
import { StepsBand } from '@/components/blocks/steps-band';
import {
  CodeBox,
  EventBadge,
  SlackMessage,
  WebsiteToast,
} from '@/components/dashboard-mock/manage';
import { FilterChip, MockBadge } from '@/components/dashboard-mock/primitives';
import {
  FormField,
  FormInput,
  FormSelect,
  FormTextarea,
  SegmentedControl,
} from '@/components/dashboard-mock/primitives-ui';
import { VisualMock } from '@/components/visual-mock';

const TEMPLATE_VARIABLES = [
  '{{name}}',
  '{{rule_name}}',
  '{{profile.firstName}}',
  '{{country}}',
  '{{city}}',
  '{{path}}',
  '{{referrerName}}',
  '{{properties.plan}}',
];

function EmailCard() {
  return (
    <div className="col gap-2 rounded-lg border border-neutral-200 bg-white p-3 text-[12px]">
      <span className="row items-center gap-2 text-neutral-500">
        <MailIcon className="size-3.5" />
        To: everyone with access to Acme SaaS
      </span>
      <span className="font-medium">Ada signed up from Sweden</span>
      <span className="text-neutral-500">sign_up · plan: pro · /pricing</span>
    </div>
  );
}

function VariablesCard() {
  return (
    <div className="row flex-wrap gap-1.5">
      {TEMPLATE_VARIABLES.map((variable) => (
        <span
          className="rounded-md bg-neutral-100 px-1.5 py-0.5 font-mono text-[11px] text-neutral-700"
          key={variable}
        >
          {variable}
        </span>
      ))}
    </div>
  );
}

function AnyEventCard() {
  return (
    <div className="col gap-3 rounded-lg border border-neutral-200 bg-white p-3 text-[12px]">
      <span className="font-medium">Everything, to the feed</span>
      <p className="row flex-wrap items-center gap-1.5 text-neutral-600">
        Get notified when <EventBadge name="Any event" /> occurs
      </p>
      <span className="row gap-1.5">
        <MockBadge>Website</MockBadge>
      </span>
    </div>
  );
}

export function NotificationsPage({ data }: FeaturePageProps) {
  return (
    <>
      <FeatureHero
        description="A rule is an event, or a funnel, and a message. When it matches, the message goes to Slack, Discord, email, a webhook or the dashboard itself."
        title={data.hero.heading}
        visual={<VisualMock name="notification-rules" />}
      />
      <SplitStat
        items={[
          {
            value: '5',
            title: 'ways to deliver',
            text: 'Slack, Discord, email, any webhook, and a toast in the dashboard.',
          },
          {
            value: '2',
            title: 'kinds of rule',
            text: 'An event that matches your filters, or a session that completes a funnel.',
          },
          {
            value: '5,000',
            title: 'kept in the feed',
            text: 'Every notification that fired, searchable, with the profile behind it.',
          },
        ]}
      />
      <Pillar
        description="Name the rule, pick the event, narrow it with the same filters the reports use, and write the message. Then choose where it goes. One rule can reach several channels at once."
        label="Rules"
        points={[
          {
            title: 'Property filters',
            text: 'Is, contains, starts with, regex, greater than, in cohort and the rest.',
          },
          {
            title: 'Templates with variables',
            text: 'Event fields and profile properties, like {{profile.firstName}} and {{country}}.',
          },
          {
            title: 'Several integrations per rule',
            text: 'Slack and Discord and the dashboard, from the same rule.',
          },
        ]}
        title="One rule, several channels"
        visual={<VisualMock bleed="right" frame="inset" name="rule-editor" />}
      />
      <Pillar
        description="A funnel rule lists the steps in order. When a session ends having done them all, the message goes out with the steps and the person in it."
        label="Funnel rules"
        points={[
          {
            title: 'Evaluated when the session ends',
            text: 'The steps are checked against that session, in order.',
          },
          {
            title: 'Ordered steps',
            text: 'Screen views with a path, custom events, anything you track.',
          },
          {
            title: 'The message names the funnel',
            text: 'So #growth knows which journey just completed.',
          },
        ]}
        reverse
        title="When someone completes the funnel"
        visual={<VisualMock bleed="left" frame="inset" name="rule-funnel" />}
      />
      <Pillar
        description="Every notification that fired is kept, with its integration, the country, OS and browser of the event, and a link to the profile."
        label="History"
        points={[
          {
            title: 'Search by title',
            text: 'Find the sign-up or the purchase you are looking for.',
          },
          {
            title: 'Jump to the profile',
            text: 'From the row to the person, their sessions and events.',
          },
          {
            title: 'Rules and feed on one page',
            text: 'Two tabs: what fired, and why.',
          },
        ]}
        title="A feed you can search"
        visual={
          <VisualMock frame="inset" name="notification-feed" side="bottom" />
        }
      />
      <CardGrid
        description="Where a rule can send its message, and what it can say."
        items={[
          {
            title: 'A toast in the dashboard',
            description:
              'The Website integration shows the message to whoever has the project open, and keeps it in the feed.',
            visual: <WebsiteToast />,
          },
          {
            title: 'Email to the team',
            description:
              'The Email integration mails every member with access to the project.',
            visual: <EmailCard />,
          },
          {
            title: 'Slack and Discord',
            description:
              'Install Slack and pick a channel, or paste a Discord webhook URL.',
            visual: (
              <SlackMessage
                lines={['plan: pro · Stockholm, SE']}
                title="Ada signed up from Sweden"
              />
            ),
          },
          {
            title: 'Any webhook, your shape',
            description:
              'A webhook integration with a JavaScript transform turns the event into the payload your endpoint wants.',
            visual: (
              <CodeBox
                lines={[
                  '(payload) => ({',
                  '  text: payload.name,',
                  '  user: payload.profile?.email,',
                  '})',
                ]}
              />
            ),
            href: '/features/integrations',
          },
          {
            title: 'Template variables',
            description:
              'Event fields, properties and profile properties. Legacy $EVENT_NAME still works.',
            visual: <VariablesCard />,
          },
          {
            title: 'Any event',
            description:
              'A rule on "Any event" with no filters is a live log of everything, if that is what you want.',
            visual: <AnyEventCard />,
          },
        ]}
        title="Delivered where you already look"
      />
      <StepsBand
        steps={[
          {
            title: 'Choose the event type',
            text: 'An event rule fires per match. A funnel rule fires per completed session.',
            visual: <StepType />,
          },
          {
            title: 'Add property filters',
            text: 'Only paid plans, only one country, only a path that matches a regex.',
            visual: <StepFilters />,
          },
          {
            title: 'Write a template',
            text: 'Plain text with variables. Leave it empty and you get the default message.',
            visual: <StepTemplate />,
          },
          {
            title: 'Attach integrations',
            text: 'Pick one or several. The first match goes out within seconds.',
            visual: <StepIntegrations />,
          },
        ]}
        title="A rule in four fields"
      />
      <FeatureClosing data={data} />
    </>
  );
}

function StepType() {
  return (
    <div className="col gap-2.5">
      <FormField label="Rule name">
        <FormInput value="Sign ups on android" />
      </FormField>
      <FormField label="Type">
        <SegmentedControl items={['Events', 'Funnel']} />
      </FormField>
      <div className="row items-center gap-2">
        <span className="center-center size-5 rounded-full bg-neutral-900 font-mono text-[10px] text-white">
          1
        </span>
        <FormSelect className="flex-1" value="sign_up" />
      </div>
    </div>
  );
}

function StepFilters() {
  return (
    <div className="col gap-2">
      <div className="row items-center gap-2">
        <span className="center-center size-5 rounded-full bg-neutral-900 font-mono text-[10px] text-white">
          1
        </span>
        <FormSelect className="flex-1" value="sign_up" />
      </div>
      <div className="col gap-1.5 pl-7">
        <FilterChip field="plan" value="pro" />
        <FilterChip field="country" value="SE" />
        <FilterChip field="path" operator="regex" value="^/docs" />
        <span className="text-[11.5px] text-neutral-500">+ Add filter</span>
      </div>
    </div>
  );
}

function StepTemplate() {
  return (
    <div className="col gap-2">
      <FormField
        hint="Variables: {{name}}, {{profile.firstName}}, {{properties.plan}}"
        label="Template"
      >
        <FormTextarea
          rows={2}
          value="{{profile.firstName}} upgraded to {{properties.plan}}"
        />
      </FormField>
    </div>
  );
}

const STEP_INTEGRATIONS = [
  { label: 'Slack · #sales', on: true },
  { label: 'Email', on: true },
  { label: 'Website', on: true },
  { label: 'Discord · #growth', on: false },
];

function StepIntegrations() {
  return (
    <div className="col gap-1.5">
      <span className="font-medium text-[12px] text-neutral-700">
        Integrations
      </span>
      <div className="col divide-y divide-neutral-100 rounded-md border border-neutral-200 text-[12px]">
        {STEP_INTEGRATIONS.map((integration) => (
          <span
            className="row items-center justify-between px-2.5 py-1.5"
            key={integration.label}
          >
            {integration.label}
            <span
              className={
                integration.on
                  ? 'center-center size-4 rounded bg-neutral-900 text-[10px] text-white'
                  : 'size-4 rounded border border-neutral-300'
              }
            >
              {integration.on ? '✓' : ''}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
