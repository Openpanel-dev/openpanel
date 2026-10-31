import { FeatureClosing, type FeaturePageProps } from './shared';
import { CardGrid } from '@/components/blocks/card-grid';
import { CodeSnippet } from '@/components/blocks/code-snippet';
import { FeatureHero } from '@/components/blocks/feature-hero';
import { Pillar } from '@/components/blocks/pillar';
import { ProofStrip } from '@/components/blocks/proof-strip';
import { StepsBand } from '@/components/blocks/steps-band';
import { VisualMock } from '@/components/visual-mock';

const INSTALL_LINES = [
  { text: 'new OpenPanel({' },
  { text: "  clientId: 'YOUR_CLIENT_ID',", tone: 'string' as const },
  { text: '  trackScreenViews: true,' },
  { text: '  trackOutgoingLinks: true,' },
  { text: '});' },
];

export function SessionTrackingPage({ data }: FeaturePageProps) {
  return (
    <>
      <FeatureHero
        description="Every visit as one row: where it started, where it ended, how long it took, what it was worth. Open it and read the events in order, with the replay on top when there is one."
        title={data.hero.heading}
        visual={<VisualMock name="sessions" />}
      />
      <ProofStrip quote={0} />
      <Pillar
        description="A session page has everything from that visit: the entry and exit page, referrer and campaign, device and city, revenue, and the events in the order they happened. Click an event to open it."
        label="Session page"
        points={[
          {
            title: 'Entry to exit',
            text: 'Entry page, exit page, duration, bounce, referrer and UTM on every session.',
          },
          {
            title: 'Revenue and groups on the row',
            text: 'A purchase shows on the session that made it, and on the company it belongs to.',
          },
          {
            title: 'Events in order',
            text: 'Screen views, custom events and AI calls, each one a click away from its details.',
          },
        ]}
        title="One session, start to finish"
        visual={
          <VisualMock bleed="right" frame="inset" name="session-detail" />
        }
      />
      <Pillar
        description="Sessions take the same filters as everything else. Entry page starts with /docs, bounce is no, in the cohort you built last week. Pick the columns you want to see and the view stays."
        label="Find the ones that matter"
        points={[
          {
            title: 'Session, profile, group or cohort',
            text: 'Filter on any property from any of the four.',
          },
          {
            title: 'Sixteen operators',
            text: 'Is, contains, starts with, regex, greater than, in cohort and the rest.',
          },
          {
            title: 'Your columns',
            text: 'Show device id, groups or revenue, hide what you do not need. Saved in the browser.',
          },
        ]}
        reverse
        title="Filter sessions like events"
        visual={
          <VisualMock bleed="left" frame="inset" name="sessions-filtered" />
        }
      />
      <Pillar
        description="There is no cookie and nothing in localStorage. A visitor gets a device id from the user agent, IP and site, hashed with a salt that changes every day. A session ends after 30 quiet minutes, on the server."
        label="Privacy"
        points={[
          {
            title: 'No cookie, no banner',
            text: 'Nothing is stored on the device, so there is nothing to ask consent for.',
          },
          {
            title: 'The salt rotates daily',
            text: 'The same anonymous visitor is a new device id tomorrow. That is the point.',
          },
          {
            title: 'session_start and session_end come from the server',
            text: 'Nothing to call. The 30 minute timeout is configurable when self-hosted.',
          },
        ]}
        title="Without cookies"
        visual={
          <VisualMock frame="inset" name="session-identity" side="bottom" />
        }
      />
      <CardGrid
        items={[
          {
            title: 'Replay on the row',
            description:
              'Sessions with a recording carry a video icon. One click to watch.',
            visual: <VisualMock frame="bare" name="mini-replay-row" />,
          },
          {
            title: 'Pages and events at a glance',
            description:
              'Visited pages and the event mix of the session, as two small bar lists.',
            visual: <VisualMock frame="bare" name="mini-page-bars" />,
          },
          {
            title: 'AI calls inline',
            description:
              'Model, tokens and cost show on the session timeline next to the clicks.',
            visual: <VisualMock frame="bare" name="mini-ai-event" />,
          },
          {
            title: 'Search by path or referrer',
            description:
              'Type a path fragment and the list narrows as you type.',
            visual: <VisualMock frame="bare" name="mini-session-search" />,
          },
          {
            title: 'Pick your columns',
            description:
              'Sixteen columns to choose from, remembered per browser.',
            visual: <VisualMock frame="bare" name="mini-column-picker" />,
          },
          {
            title: 'From the session to the person',
            description:
              'Identified sessions link to the profile and all of its other sessions.',
            visual: <VisualMock frame="bare" name="mini-profile-sessions" />,
          },
        ]}
        title="Around the session"
      />
      <StepsBand
        steps={[
          {
            title: 'Install the SDK',
            text: 'Turn on screen views and outgoing links. That is the whole setup.',
            visual: <CodeSnippet compact lines={INSTALL_LINES} />,
          },
          {
            title: 'The server groups events',
            text: 'Events from one device within 30 minutes of each other are one session. After 30 quiet minutes it ends.',
          },
          {
            title: 'Browse, filter, open',
            text: 'The sessions list is live. Filter it, open a session, read the events, watch the replay.',
          },
        ]}
        title="How a session is made"
      />
      <FeatureClosing data={data} />
    </>
  );
}
