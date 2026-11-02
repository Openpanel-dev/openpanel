import { FeatureClosing, type FeaturePageProps } from './shared';
import { CardGrid } from '@/components/blocks/card-grid';
import { CodeSnippet } from '@/components/blocks/code-snippet';
import { FeatureHero } from '@/components/blocks/feature-hero';
import { Pillar } from '@/components/blocks/pillar';
import { ProofStrip } from '@/components/blocks/proof-strip';
import { StepsBand } from '@/components/blocks/steps-band';
import { VisualMock } from '@/components/visual-mock';

const IDENTIFY_LINES = [
  { text: 'op.identify({' },
  { text: "  profileId: 'usr_4821',", tone: 'string' as const },
  { text: "  email: 'ada@acme.io',", tone: 'string' as const },
  { text: "  firstName: 'Ada',", tone: 'string' as const },
  { text: "  properties: { plan: 'pro' },", tone: 'string' as const },
  { text: '});' },
];

const GROUP_LINES = [
  { text: 'op.upsertGroup({' },
  { text: "  id: 'grp_acme',", tone: 'string' as const },
  { text: "  type: 'company',", tone: 'string' as const },
  { text: "  name: 'Acme Inc',", tone: 'string' as const },
  { text: '});' },
];

export function IdentifyUsersPage({ data }: FeaturePageProps) {
  return (
    <>
      <FeatureHero
        description="Call identify once and the visitor becomes a person: first seen, last seen, every session, every event, revenue, and the company they belong to."
        title={data.hero.heading}
        visual={<VisualMock name="profile" />}
      />
      <ProofStrip quote={1} />
      <Pillar
        description="Before identify, a visitor is a device id with no cookie behind it. After identify, the events from that same session are rewritten to the profile, so the sign-up flow is part of the person's history."
        label="Identify"
        points={[
          {
            title: 'One call',
            text: 'profileId, name, email, avatar and any properties you want on the profile.',
          },
          {
            title: 'Same-session backfill',
            text: 'Earlier events in the same session, up to six hours back, move to the profile.',
          },
          {
            title: 'No cross-device tracking',
            text: 'An anonymous visitor is a daily-rotating hash. There is no cross-device merge.',
          },
        ]}
        title="From anonymous to a name"
        visual={
          <VisualMock bleed="right" frame="inset" name="identify-merge" />
        }
      />
      <Pillar
        description="Identified, anonymous, and the people who use the product most. Search by name or email, filter by profile, group or cohort properties, and open anyone."
        label="Profiles"
        points={[
          {
            title: 'Power users',
            text: 'Ranked by event count over the last three months. The list writes itself.',
          },
          {
            title: 'Filters you already know',
            text: 'The same operators as reports: is, contains, in cohort, and so on.',
          },
          {
            title: 'Groups on the row',
            text: 'See which company each person belongs to without opening them.',
          },
        ]}
        reverse
        title="The list, three ways"
        visual={<VisualMock bleed="left" frame="inset" name="profiles-list" />}
      />
      <Pillar
        description="A group is a company, a team, a workspace, anything several people share. Groups have their own page with members, events and activity, and their properties work as filters and breakdowns everywhere."
        label="Groups"
        points={[
          {
            title: 'Any type you define',
            text: 'upsertGroup with an id, a type and a name. setGroup attaches it to the session.',
          },
          {
            title: 'Account-level numbers',
            text: 'Total events, unique members, first and last seen, new members over time.',
          },
          {
            title: 'In every report',
            text: 'Break a funnel down by group plan, or filter retention to one company.',
          },
        ]}
        title="Companies, not just people"
        visual={<VisualMock frame="inset" name="group-page" side="bottom" />}
      />
      <CardGrid
        items={[
          {
            title: 'Activity calendar',
            description: 'A year of days, shaded by how active the person was.',
            visual: <VisualMock frame="bare" name="mini-activity-heatmap" />,
          },
          {
            title: 'Counters on the profile',
            description:
              'increment and decrement a property without reading it first.',
            visual: <VisualMock frame="bare" name="mini-counter" />,
          },
          {
            title: 'Revenue per person',
            description: 'Every revenue event adds up on the profile.',
            visual: <VisualMock frame="bare" name="mini-profile-revenue" />,
          },
          {
            title: 'Cohort membership',
            description:
              'See which cohorts a person is in, and filter any report by them.',
            visual: <VisualMock frame="bare" name="mini-cohort-badges" />,
          },
          {
            title: 'Custom properties',
            description:
              'Plan, company, seats, anything. Shown on the profile, usable as filters.',
            visual: <VisualMock frame="bare" name="mini-custom-props" />,
          },
          {
            title: 'Sessions and replays',
            description:
              'The Sessions tab lists every visit, with the replay icon where there is one.',
            visual: <VisualMock frame="bare" name="mini-profile-sessions" />,
          },
        ]}
        title="On every profile"
      />
      <StepsBand
        steps={[
          {
            title: 'Track as usual',
            text: 'Visitors are anonymous device ids until you say otherwise.',
            visual: <VisualMock frame="bare" name="mini-profile-sessions" />,
          },
          {
            title: 'Identify on login or sign-up',
            text: 'A stable id from your own system. Email and name are optional.',
            visual: <CodeSnippet compact lines={IDENTIFY_LINES} />,
          },
          {
            title: 'Add the company',
            text: 'Optional. Groups give you account-level analytics on top.',
            visual: <CodeSnippet compact lines={GROUP_LINES} />,
          },
        ]}
        title="Three calls at most"
      />
      <FeatureClosing data={data} />
    </>
  );
}
